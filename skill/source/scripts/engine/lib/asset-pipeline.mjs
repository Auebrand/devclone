/**
 * asset-pipeline.mjs — portado de background.js (extensão DevClone).
 * Categorização de arquivos, resolução recursiva de CSS/JS, crawl same-origin
 * e reescrita de HTML cru. Lógica pura — a única mudança real é trocar o
 * fetch com credentials:'omit' do navegador pelo fetch global do Node.
 *
 * Usado tanto pelo Modo 1 (clone completo) quanto pelo Modo 2 (harness): no
 * Modo 2, o clone.mjs simplesmente não chama registerFile/fetchAsset para
 * imagem/vídeo/página — as funções aqui não sabem nem precisam saber em que
 * modo estão rodando.
 */

export function absUrl(url, base) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try { return new URL(url.trim(), base).href; } catch { return null; }
}

export function sanitizeSegment(name) {
  return (name || '')
    .replace(/[?#].*$/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 80);
}

const EXT_BY_MIME = {
  'text/css': 'css',
  'text/javascript': 'js',
  'application/javascript': 'js',
  'application/x-javascript': 'js',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg',
  'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
  'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf',
  'font/otf': 'otf', 'application/font-woff': 'woff',
  'application/vnd.ms-fontobject': 'eot',
  'application/wasm': 'wasm', 'application/octet-stream': 'bin',
  'application/manifest+json': 'json',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv',
  'video/quicktime': 'mov', 'video/x-m4v': 'm4v',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/aac': 'aac',
  'application/json': 'json', 'text/plain': 'txt', 'text/html': 'html',
};

export const CATEGORY = {
  css: 'css',
  js: 'js',
  img: 'assets/img',
  icon: 'assets/img',
  font: 'assets/fonts',
  media: 'assets/media',
  anim: 'assets/media',
  data: 'assets/data',
  runtime: 'assets/runtime',
  asset: 'assets/files',
  page: '',
};

export function extFromUrl(u) {
  try {
    const p = new URL(u).pathname;
    const m = p.match(/\.([a-zA-Z0-9]{1,5})$/);
    return m ? m[1].toLowerCase() : '';
  } catch { return ''; }
}

export function relativePath(fromPath, toPath) {
  const fromDir = fromPath.split('/').slice(0, -1);
  const toParts = toPath.split('/');
  const up = fromDir.map(() => '..');
  return [...up, ...toParts].join('/') || toPath;
}

export function newState() {
  return {
    pathMap: {},
    files: [],
    seenNames: new Set(),
    fetched: new Set(),
    errors: [],
    bytes: 0,
    captureMode: 'compatibility',
    dynamicCaptured: 0,
    captureWarnings: [],
    validation: null,
    stack: [],
  };
}

export function uniqueName(dir, base, ext, state) {
  let name = base && base !== '' ? base : 'file';
  if (ext && !name.toLowerCase().endsWith('.' + ext)) name = `${name}.${ext}`;
  let full = dir ? `${dir}/${name}` : name;
  if (!state.seenNames.has(full)) { state.seenNames.add(full); return full; }
  let i = 1;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const tail = dot > 0 ? name.slice(dot) : '';
  for (;;) {
    const cand = dir ? `${dir}/${stem}-${i}${tail}` : `${stem}-${i}${tail}`;
    if (!state.seenNames.has(cand)) { state.seenNames.add(cand); return cand; }
    i++;
  }
}

export async function fetchAsset(url) {
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  const ct = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  return { buf, contentType: ct };
}

export function registerFile(url, kind, buf, contentType, state) {
  let cat = CATEGORY[kind] || 'assets/img';
  if (kind === 'asset' || kind === 'icon') {
    if (contentType.startsWith('font/') || /font/.test(contentType)) cat = CATEGORY.font;
    else if (contentType.startsWith('video/') || contentType.startsWith('audio/')) cat = CATEGORY.media;
    else if (contentType.startsWith('image/')) cat = CATEGORY.img;
  }
  if (kind === 'font') cat = CATEGORY.font;

  const urlExt = extFromUrl(url);
  const ext = urlExt || EXT_BY_MIME[contentType] || '';
  let base = sanitizeSegment(decodeURIComponent((url.split('/').pop() || '').split('?')[0])) || kind;
  if (base.indexOf('.') === -1 && ext) base = `${base}.${ext}`;

  const path = uniqueName(cat, base.replace(/\.[^.]*$/, ''), ext, state);
  state.pathMap[url] = path;
  state.files.push({ name: path, data: buf });
  state.bytes += buf.length;
  return path;
}

const DEFAULT_EXT_BY_KIND = { css: 'css', js: 'js' };
export function registerFileText(url, kind, buf, state) {
  const cat = CATEGORY[kind] || 'assets/img';
  const ext = extFromUrl(url) || DEFAULT_EXT_BY_KIND[kind] || 'txt';
  let base = sanitizeSegment(decodeURIComponent((url.split('/').pop() || '').split('?')[0])) || kind;
  const path = uniqueName(cat, base.replace(/\.[^.]*$/, ''), ext, state);
  state.pathMap[url] = path;
  state.files.push({ name: path, data: buf });
  state.bytes += buf.length;
  return path;
}

export function replaceFileText(path, newText, state) {
  const data = new TextEncoder().encode(newText);
  const f = state.files.find((x) => x.name === path);
  if (f) { state.bytes += data.length - f.data.length; f.data = data; }
}

export function guessKind(contentType, url) {
  if (contentType.startsWith('font/') || /font/.test(contentType) || /\.(woff2?|ttf|otf|eot)$/i.test(url)) return 'font';
  if (/\.lottie$/i.test(url)) return 'anim';
  if (/\.riv(?:\?|$)/i.test(url)) return 'anim';
  if (/\.wasm(?:\?|$)/i.test(url) || contentType === 'application/wasm') return 'runtime';
  if (/\.(json|map)(?:\?|$)/i.test(url) || /json/.test(contentType)) return 'data';
  if (contentType.startsWith('video/') || contentType.startsWith('audio/') || /\.(mp4|m4v|mov|webm|ogv|mp3|ogg|wav|aac)$/i.test(url)) return 'media';
  if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i.test(url)) return 'img';
  if (contentType === 'text/css') return 'css';
  if (/javascript/.test(contentType)) return 'js';
  return 'asset';
}

export function kindFromNetwork(record) {
  const type = String(record.type || '').toLowerCase();
  if (type === 'stylesheet') return 'css';
  if (type === 'script') return 'js';
  if (type === 'image') return 'img';
  if (type === 'media') return 'media';
  if (type === 'font') return 'font';
  if (type === 'manifest') return 'data';
  return guessKind(record.mimeType || '', record.url || '');
}

export function registerNetworkRecords(records, state, cssToProcess, jsToProcess) {
  for (const record of records || []) {
    if (!record || !record.url || !record.bytes || record.type === 'Document') continue;
    if (state.pathMap[record.url]) continue;
    const kind = kindFromNetwork(record);
    state.fetched.add(record.url);
    let path;
    if (kind === 'css') {
      path = registerFileText(record.url, 'css', record.bytes, state);
      cssToProcess.push({ url: record.url, path, text: Buffer.from(record.bytes).toString('utf8') });
    } else if (kind === 'js') {
      path = registerFileText(record.url, 'js', record.bytes, state);
      jsToProcess.push({ url: record.url, path, text: Buffer.from(record.bytes).toString('utf8') });
    } else {
      path = registerFile(record.url, kind, record.bytes, record.mimeType || '', state);
    }
    for (const alias of record.aliases || []) {
      if (alias && !state.pathMap[alias]) state.pathMap[alias] = path;
      if (alias) state.fetched.add(alias);
    }
  }
  state.dynamicCaptured = state.files.length;
}

/**
 * Variante usada pelo Modo 2 (harness): registra apenas CSS e JS vindos da
 * rede (necessários para extrair tokens/animações). Imagens, vídeo, fontes
 * e demais binários NÃO são baixados — o harness referencia esses tipos
 * apenas quando um extrator (ex. animation-extract.mjs) marcar como
 * estritamente necessário para reproduzir uma animação/componente.
 */
export function registerNetworkRecordsForHarness(records, state, cssToProcess, jsToProcess) {
  for (const record of records || []) {
    if (!record || !record.url || !record.bytes || record.type === 'Document') continue;
    if (state.pathMap[record.url]) continue;
    const kind = kindFromNetwork(record);
    if (kind !== 'css' && kind !== 'js') continue;
    state.fetched.add(record.url);
    let path;
    if (kind === 'css') {
      path = registerFileText(record.url, 'css', record.bytes, state);
      cssToProcess.push({ url: record.url, path, text: Buffer.from(record.bytes).toString('utf8') });
    } else {
      path = registerFileText(record.url, 'js', record.bytes, state);
      jsToProcess.push({ url: record.url, path, text: Buffer.from(record.bytes).toString('utf8') });
    }
    for (const alias of record.aliases || []) {
      if (alias && !state.pathMap[alias]) state.pathMap[alias] = path;
      if (alias) state.fetched.add(alias);
    }
  }
  state.dynamicCaptured = state.files.length;
}

// ---- CSS recursivo ----------------------------------------------------
export async function processCss(cssText, cssUrl, cssLocalPath, state, onProgress) {
  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  const importRe = /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)([^;]*);/gi;
  const found = [];

  let m;
  while ((m = importRe.exec(cssText))) {
    const target = m[2] || m[4];
    if (target) found.push({ raw: target, kind: 'css' });
  }
  while ((m = urlRe.exec(cssText))) {
    const raw = m[2].trim();
    if (raw.startsWith('data:') || raw.startsWith('blob:')) continue;
    found.push({ raw, kind: 'asset' });
  }

  for (const dep of found) {
    const absoluteUrl = absUrl(dep.raw, cssUrl);
    if (!absoluteUrl) continue;
    if (!state.pathMap[absoluteUrl] && !state.fetched.has(absoluteUrl)) {
      state.fetched.add(absoluteUrl);
      try {
        const { buf, contentType } = await fetchAsset(absoluteUrl);
        onProgress?.(absoluteUrl);
        if (dep.kind === 'css' || contentType === 'text/css') {
          const nestedPath = registerFileText(absoluteUrl, 'css', buf, state);
          const nestedText = Buffer.from(buf).toString('utf8');
          const rewritten = await processCss(nestedText, absoluteUrl, nestedPath, state, onProgress);
          replaceFileText(nestedPath, rewritten, state);
        } else {
          registerFile(absoluteUrl, guessKind(contentType, absoluteUrl), buf, contentType, state);
        }
      } catch (e) {
        state.errors.push({ url: absoluteUrl, reason: String((e && e.message) || e) });
      }
    }
  }

  const rewrite = (text) => text.replace(urlRe, (full, q, raw) => {
    if (raw.startsWith('data:') || raw.startsWith('blob:')) return full;
    const absoluteUrl = absUrl(raw, cssUrl);
    if (absoluteUrl && state.pathMap[absoluteUrl]) {
      return `url("${relativePath(cssLocalPath, state.pathMap[absoluteUrl])}")`;
    }
    return full;
  }).replace(importRe, (full, q1, u1, q2, u2, media) => {
    const target = u1 || u2;
    const absoluteUrl = absUrl(target, cssUrl);
    if (absoluteUrl && state.pathMap[absoluteUrl]) {
      return `@import url("${relativePath(cssLocalPath, state.pathMap[absoluteUrl])}")${media || ''};`;
    }
    return full;
  });

  return rewrite(cssText);
}

/**
 * Variante para o Modo 2: percorre CSS recursivamente só para achar mais
 * CSS (@import) e mantém o texto original intacto (sem reescrever url()
 * para caminhos locais, já que imagens/fontes normalmente não entram no
 * harness). Retorna o texto sem alterações — serve para animation-extract
 * localizar @keyframes/transition em folhas importadas.
 */
export async function processCssForHarness(cssText, cssUrl, state, onDiscoverCss) {
  const importRe = /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)([^;]*);/gi;
  let m;
  const targets = [];
  while ((m = importRe.exec(cssText))) {
    const target = m[2] || m[4];
    if (target) targets.push(target);
  }
  for (const raw of targets) {
    const absoluteUrl = absUrl(raw, cssUrl);
    if (!absoluteUrl || state.fetched.has(absoluteUrl)) continue;
    state.fetched.add(absoluteUrl);
    try {
      const { buf, contentType } = await fetchAsset(absoluteUrl);
      if (contentType === 'text/css' || /\.css(?:\?|$)/i.test(absoluteUrl)) {
        const text = Buffer.from(buf).toString('utf8');
        onDiscoverCss?.(absoluteUrl, text);
        await processCssForHarness(text, absoluteUrl, state, onDiscoverCss);
      }
    } catch (e) {
      state.errors.push({ url: absoluteUrl, reason: String((e && e.message) || e) });
    }
  }
  return cssText;
}

// ---- JS (ES Modules) recursivo ----------------------------------------
const IMPORT_FROM_RE = /\bimport\s*(?:[\w$*{},\s]+\s*from\s*)?["']([^"']+)["']/g;
const EXPORT_FROM_RE = /\bexport\s*(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function findModuleSpecifiers(text) {
  const specs = new Set();
  let m;
  IMPORT_FROM_RE.lastIndex = 0; while ((m = IMPORT_FROM_RE.exec(text))) specs.add(m[1]);
  EXPORT_FROM_RE.lastIndex = 0; while ((m = EXPORT_FROM_RE.exec(text))) specs.add(m[1]);
  DYNAMIC_IMPORT_RE.lastIndex = 0; while ((m = DYNAMIC_IMPORT_RE.exec(text))) specs.add(m[1]);
  return Array.from(specs).filter((s) => s && !s.startsWith('data:'));
}

export async function processJsModule(jsText, jsUrl, jsLocalPath, state, onProgress) {
  const specs = findModuleSpecifiers(jsText);
  if (!specs.length) return jsText;

  const resolved = new Map();
  for (const spec of specs) {
    const a = absUrl(spec, jsUrl);
    if (a) resolved.set(spec, a);
  }

  for (const [, absoluteUrl] of resolved) {
    if (state.pathMap[absoluteUrl] || state.fetched.has(absoluteUrl)) continue;
    state.fetched.add(absoluteUrl);
    try {
      const { buf, contentType } = await fetchAsset(absoluteUrl);
      onProgress?.(absoluteUrl);
      const looksLikeJs = /javascript|ecmascript/.test(contentType) || /\.m?js$/i.test(absoluteUrl);
      if (looksLikeJs) {
        const text = Buffer.from(buf).toString('utf8');
        const nestedPath = registerFileText(absoluteUrl, 'js', buf, state);
        const rewritten = await processJsModule(text, absoluteUrl, nestedPath, state, onProgress);
        if (rewritten !== text) replaceFileText(nestedPath, rewritten, state);
      } else {
        registerFile(absoluteUrl, guessKind(contentType, absoluteUrl), buf, contentType, state);
      }
    } catch (e) {
      state.errors.push({ url: absoluteUrl, reason: String((e && e.message) || e) });
    }
  }

  let out = jsText;
  for (const [spec, absoluteUrl] of resolved) {
    if (!state.pathMap[absoluteUrl]) continue;
    let rel = relativePath(jsLocalPath, state.pathMap[absoluteUrl]);
    if (!rel.startsWith('.') && !rel.startsWith('/')) rel = './' + rel;
    const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp('([\"\'])' + escaped + '\\1', 'g'), (_full, q) => q + rel + q);
  }
  return out;
}

export function rewriteKnownJsAssets(jsText, jsUrl, jsLocalPath, state) {
  let out = jsText;

  const mappings = Object.entries(state.pathMap)
    .filter(([url, local]) => /^https?:/i.test(url) && local)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [url, local] of mappings) {
    if (!out.includes(url)) continue;
    out = out.split(url).join(relativePath(jsLocalPath, local));
  }

  const assetLiteralRe = /(["'`])((?:(?:\.\.?)?\/|\/)[^"'`\\\r\n]{1,2000}\.(?:m?js|css|wasm|riv|lottie|glb|gltf|bin|ktx2?|basis|hdr|exr|dds|tga|obj|fbx|mtl|ply|stl|dae|meshopt|json|png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mov|m4v|ogv|mp3|ogg|wav|aac)(?:\?[^"'`\\\r\n]*)?)\1/gi;
  out = out.replace(assetLiteralRe, (full, q, value) => {
    if (/^(data:|blob:|javascript:|#)/i.test(value)) return full;
    const absolute = absUrl(value, jsUrl);
    if (!absolute || !state.pathMap[absolute]) return full;
    return `${q}${relativePath(jsLocalPath, state.pathMap[absolute])}${q}`;
  });

  const dirs = new Map();
  for (const [url, local] of mappings) {
    try {
      const u = new URL(url);
      const remoteDir = u.href.slice(0, u.href.lastIndexOf('/') + 1);
      const localDir = local.includes('/') ? local.slice(0, local.lastIndexOf('/') + 1) : '';
      if (!dirs.has(remoteDir)) dirs.set(remoteDir, new Set());
      dirs.get(remoteDir).add(localDir);
    } catch {}
  }
  const dirEntries = Array.from(dirs.entries()).sort((a, b) => b[0].length - a[0].length);
  for (const [remoteDir, localDirs] of dirEntries) {
    if (localDirs.size !== 1 || !out.includes(remoteDir)) continue;
    const localDir = Array.from(localDirs)[0];
    const probe = `${localDir}__file__`;
    const rel = relativePath(jsLocalPath, probe).replace(/__file__$/, '');
    out = out.split(remoteDir).join(rel);
  }
  return out;
}

// ---- crawl same-origin --------------------------------------------------
export async function crawlSameOrigin(startUrl, depth, state, onProgress) {
  const origin = new URL(startUrl).origin;
  const visited = new Set([startUrl]);
  const pages = [];
  let frontier = [startUrl];
  const MAX_PAGES = 60;

  for (let d = 0; d <= depth && frontier.length; d++) {
    const next = [];
    for (const pageUrl of frontier) {
      if (pages.length >= MAX_PAGES) break;
      try {
        const resp = await fetch(pageUrl, { redirect: 'follow' });
        if (!resp.ok) { state.errors.push({ url: pageUrl, reason: `HTTP ${resp.status}` }); continue; }
        const html = await resp.text();
        pages.push({ url: pageUrl, html });
        onProgress?.(pageUrl);
        if (d < depth) {
          const linkRe = /<a\b[^>]*\bhref\s*=\s*(['"])(.*?)\1/gi;
          let lm;
          while ((lm = linkRe.exec(html))) {
            const target = absUrl(lm[2], pageUrl);
            if (!target) continue;
            const clean = target.split('#')[0];
            if (new URL(clean).origin !== origin) continue;
            if (/\.(pdf|zip|jpg|png|gif|mp4|css|js)$/i.test(clean)) continue;
            if (!visited.has(clean) && visited.size < MAX_PAGES) { visited.add(clean); next.push(clean); }
          }
        }
      } catch (e) {
        state.errors.push({ url: pageUrl, reason: String((e && e.message) || e) });
      }
    }
    frontier = next;
  }
  return pages;
}

export function pageFileName(pageUrl, startUrl, state) {
  const u = new URL(pageUrl);
  if (pageUrl.split('#')[0].replace(/\/$/, '') === startUrl.split('#')[0].replace(/\/$/, '')) return null;
  let p = u.pathname.replace(/^\/+|\/+$/g, '');
  if (!p) p = 'index';
  p = p.replace(/\//g, '_');
  p = sanitizeSegment(p) || 'page';
  return uniqueName('pages', p, 'html', state);
}

export function rewriteRawHtml(html, pageUrl, state, htmlLocalPath) {
  const attrRe = /(\b(?:href|src|poster|data)\s*=\s*)(['"])(.*?)\2/gi;
  return html.replace(attrRe, (full, pre, q, val) => {
    if (!val || val.startsWith('data:') || val.startsWith('#') || val.startsWith('javascript:')) return full;
    const a = absUrl(val, pageUrl);
    if (a && state.pathMap[a]) {
      const rel = htmlLocalPath ? relativePath(htmlLocalPath, state.pathMap[a]) : state.pathMap[a];
      return `${pre}${q}${rel}${q}`;
    }
    return full;
  });
}

export function animationDependencyGaps(state) {
  const counts = {};
  for (const file of state.files || []) {
    const match = String(file.name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
    if (match) counts[match[1]] = (counts[match[1]] || 0) + 1;
  }
  const scriptText = (state.files || [])
    .filter((file) => /\.m?js$/i.test(file.name || ''))
    .map((file) => { try { return Buffer.from(file.data).toString('utf8').toLowerCase(); } catch { return ''; } })
    .join('\n');
  const gaps = [];
  const checks = [
    ['riv', ['riv']], ['wasm', ['wasm']], ['glb', ['glb']], ['gltf', ['gltf']],
    ['ktx2', ['ktx2']], ['hdr', ['hdr']], ['exr', ['exr']], ['basis', ['basis']],
  ];
  for (const [reference, localExtensions] of checks) {
    if (!scriptText.includes(`.${reference}`)) continue;
    if (localExtensions.some((ext) => counts[ext])) continue;
    gaps.push(`o JavaScript referencia .${reference}, mas nenhum arquivo desse tipo entrou no ZIP`);
  }
  if (/[/_-](?:msdf|bmfont|font|scene|model)[^\s"'`]*\.json\b/i.test(scriptText) && !counts.json) {
    gaps.push('o JavaScript referencia JSON de fonte/cena/modelo, mas nenhum JSON correspondente entrou no ZIP');
  }
  return gaps;
}
