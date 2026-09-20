/**
 * zip.js — Empacotador ZIP minimalista, sem dependencias.
 * Usa CompressionStream('deflate-raw') (nativo do Chrome) para compressao real,
 * com fallback para o metodo STORE quando a compressao nao ajuda ou nao existe.
 *
 * Exporta: buildZip(files) -> Promise<Uint8Array>
 *   files: Array<{ name: string, data: Uint8Array }>
 */

// ---- CRC32 -----------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- deflate nativo --------------------------------------------------------
async function deflateRaw(u8) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(u8);
    writer.close();
    const reader = cs.readable.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  } catch {
    return null;
  }
}

// ---- helpers de escrita ----------------------------------------------------
function pushU16(arr, v) { arr.push(v & 0xff, (v >>> 8) & 0xff); }
function pushU32(arr, v) { arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); }

// data/hora DOS fixas (2024-01-01 00:00) — evita metadados variaveis
// formato: bits 9-15 ano-1980, 5-8 mes, 0-4 dia => (44<<9)|(1<<5)|1
const DOS_TIME = 0;
const DOS_DATE = (44 << 9) | (1 << 5) | 1;

// formatos que ja vem comprimidos: tentar deflate so gasta tempo/memoria
const STORED_EXT = /\.(png|jpe?g|gif|webp|avif|ico|mp4|m4v|mov|webm|ogv|ogg|mp3|aac|wav|woff2?|zip|gz|br)$/i;

/**
 * Monta o buffer ZIP final.
 */
export async function buildZip(files) {
  const enc = new TextEncoder();
  const localParts = [];      // pedacos do fluxo local (headers + dados)
  const central = [];         // registros do diretorio central
  let offset = 0;             // offset corrente do arquivo

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const raw = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = crc32(raw);

    let method = 0;             // 0 = store
    let payload = raw;
    // so tenta comprimir se nao for um formato ja comprimido e tiver algum tamanho
    if (raw.length > 64 && !STORED_EXT.test(file.name)) {
      const def = await deflateRaw(raw);
      if (def && def.length < raw.length) { method = 8; payload = def; }
    }

    // ---- local file header ----
    const lh = [];
    pushU32(lh, 0x04034b50);
    pushU16(lh, 20);            // versao necessaria
    pushU16(lh, 0x0800);        // flag bit 11 = nomes em UTF-8
    pushU16(lh, method);
    pushU16(lh, DOS_TIME);
    pushU16(lh, DOS_DATE);
    pushU32(lh, crc);
    pushU32(lh, payload.length);
    pushU32(lh, raw.length);
    pushU16(lh, nameBytes.length);
    pushU16(lh, 0);            // extra len
    const localHeader = new Uint8Array(lh);

    localParts.push(localHeader, nameBytes, payload);
    const localHeaderOffset = offset;
    offset += localHeader.length + nameBytes.length + payload.length;

    // ---- central directory header ----
    const ch = [];
    pushU32(ch, 0x02014b50);
    pushU16(ch, 20);            // versao criadora
    pushU16(ch, 20);            // versao necessaria
    pushU16(ch, 0x0800);
    pushU16(ch, method);
    pushU16(ch, DOS_TIME);
    pushU16(ch, DOS_DATE);
    pushU32(ch, crc);
    pushU32(ch, payload.length);
    pushU32(ch, raw.length);
    pushU16(ch, nameBytes.length);
    pushU16(ch, 0);            // extra
    pushU16(ch, 0);            // comentario
    pushU16(ch, 0);            // disco
    pushU16(ch, 0);            // atributos internos
    pushU32(ch, 0);            // atributos externos
    pushU32(ch, localHeaderOffset);
    central.push(new Uint8Array(ch), nameBytes);
  }

  // ---- diretorio central + EOCD ----
  let centralSize = 0;
  for (const p of central) centralSize += p.length;
  const centralOffset = offset;

  const eocd = [];
  pushU32(eocd, 0x06054b50);
  pushU16(eocd, 0);
  pushU16(eocd, 0);
  pushU16(eocd, files.length);
  pushU16(eocd, files.length);
  pushU32(eocd, centralSize);
  pushU32(eocd, centralOffset);
  pushU16(eocd, 0);
  const eocdBytes = new Uint8Array(eocd);

  // ---- concatena tudo ----
  let totalLen = offset + centralSize + eocdBytes.length;
  const out = new Uint8Array(totalLen);
  let o = 0;
  for (const p of localParts) { out.set(p, o); o += p.length; }
  for (const p of central) { out.set(p, o); o += p.length; }
  out.set(eocdBytes, o);
  return out;
}

/**
 * Uint8Array -> string base64 (em blocos, evita estourar a call stack).
 */
export function toBase64(u8) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(s);
}
