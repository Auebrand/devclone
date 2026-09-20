/**
 * background.js — service worker (modulo).
 * Orquestra todo o processo de clonagem.
 */
import { buildZip, toBase64 } from './zip.js';
import { captureNetworkSession } from './capture.js';
import { callPageBridgeViaDebugger, primePageViaAttachedDebugger } from './cdp-bridge.js';
import { getPreviewPackageFiles } from './preview-files.js';

// ------------------------------------------------------------------ util URL
function absUrl(url, base) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try { return new URL(url.trim(), base).href; } catch { return null; }
}

function sanitizeSegment(name) {
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

const CATEGORY = {
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

function extFromUrl(u) {
  try {
    const p = new URL(u).pathname;
    const m = p.match(/\.([a-zA-Z0-9]{1,5})$/);
    return m ? m[1].toLowerCase() : '';
  } catch { return ''; }
}

// caminho relativo de "from" (arquivo) ate "to" (arquivo), ambos relativos a raiz
function relativePath(fromPath, toPath) {
  const fromDir = fromPath.split('/').slice(0, -1);
  const toParts = toPath.split('/');
  // sobe ate a raiz e desce
  const up = fromDir.map(() => '..');
  return [...up, ...toParts].join('/') || toPath;
}

// ------------------------------------------------------------------ estado
function newState() {
  return {
    pathMap: {},        // urlAbs -> caminhoLocal (relativo a raiz)
    files: [],          // { name, data:Uint8Array }
    seenNames: new Set(),
    fetched: new Set(),
    errors: [],         // { url, reason }
    bytes: 0,
    captureMode: 'compatibility',
    dynamicCaptured: 0,
    captureWarnings: [],
    validation: null,
  };
}

function uniqueName(dir, base, ext, state) {
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

// ------------------------------------------------------------------ fetch
async function fetchAsset(url) {
  const resp = await fetch(url, { credentials: 'omit', cache: 'force-cache', redirect: 'follow' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  const ct = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  return { buf, contentType: ct };
}

// decide caminho local e registra o arquivo
function registerFile(url, kind, buf, contentType, state) {
  let cat = CATEGORY[kind] || 'assets/img';
  // refina categoria por content-type quando o kind era generico ('asset')
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

// ------------------------------------------------------------------ relatorio amigavel
function categorizeUrl(url) {
  const u = url.toLowerCase().split('?')[0];
  if (/\.(png|jpe?g|webp|avif|gif|svg|ico|bmp)$/.test(u)) return 'imagens';
  if (/\.(mp4|webm|mov|m4v|ogv|mp3|ogg|wav|aac)$/.test(u)) return 'videos';
  if (/\.(woff2?|ttf|otf|eot)$/.test(u)) return 'fontes';
  if (/\.(css)$/.test(u)) return 'estilos';
  if (/\.(js|mjs)$/.test(u)) return 'scripts';
  return 'outros';
}

function fileExtensionCounts(state) {
  const counts = {};
  for (const file of state.files || []) {
    const match = String(file.name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
    if (match) counts[match[1]] = (counts[match[1]] || 0) + 1;
  }
  return counts;
}

function animationDependencyGaps(state) {
  const counts = fileExtensionCounts(state);
  const scriptText = (state.files || [])
    .filter((file) => /\.m?js$/i.test(file.name || ''))
    .map((file) => {
      try { return new TextDecoder().decode(file.data).toLowerCase(); } catch { return ''; }
    })
    .join('\n');
  const gaps = [];
  const checks = [
    ['riv', ['riv']],
    ['wasm', ['wasm']],
    ['glb', ['glb']],
    ['gltf', ['gltf']],
    ['ktx2', ['ktx2']],
    ['hdr', ['hdr']],
    ['exr', ['exr']],
    ['basis', ['basis']],
  ];
  for (const [reference, localExtensions] of checks) {
    if (!scriptText.includes(`.${reference}`)) continue;
    if (localExtensions.some((ext) => counts[ext])) continue;
    gaps.push(`o JavaScript referencia .${reference}, mas nenhum arquivo desse tipo entrou no ZIP`);
  }
  // JSON de fonte MSDF e manifests 3D aparecem como caminhos literais. JSONs
  // genericos de APIs nao entram nesta verificacao.
  if (/[/_-](?:msdf|bmfont|font|scene|model)[^\s"'`]*\.json\b/i.test(scriptText) && !counts.json) {
    gaps.push('o JavaScript referencia JSON de fonte/cena/modelo, mas nenhum JSON correspondente entrou no ZIP');
  }
  return gaps;
}

function friendlyReason(reason) {
  const r = String(reason || '').toLowerCase();
  if (r.includes('403') || r.includes('401') || r.includes('cors') || r.includes('opaque')) {
    return 'sem permissão de acesso (o site bloqueou o download deste arquivo)';
  }
  if (r.includes('404') || r.includes('410')) {
    return 'não encontrado (o link pode ter expirado ou mudado de lugar)';
  }
  if (/\b5\d\d\b/.test(r)) {
    return 'o servidor do arquivo estava com problema no momento';
  }
  if (r.includes('network') || r.includes('failed to fetch') || r.includes('timeout')) {
    return 'falha de conexão durante a captura';
  }
  return reason || 'motivo não identificado';
}

function buildFailureReport(startUrl, state) {
  const total = state.files.length;
  const fails = state.errors || [];
  const remaining = (state.validation && state.validation.remainingRemote) || [];
  const dependencyGaps = (state.validation && state.validation.dependencyGaps) || [];
  const L = [];
  L.push('RELATÓRIO DE CAPTURA — DevClone');
  L.push('========================================');
  L.push('');
  L.push(`Site clonado : ${startUrl}`);
  L.push(`Data         : ${new Date().toLocaleString('pt-BR')}`);
  L.push('');
  L.push('RESUMO');
  L.push('------');
  L.push(`Modo de captura: ${state.captureMode === 'network-original' ? 'avancado (rede real + HTML original)' : 'compatibilidade'}`);
  L.push(`Recursos obtidos da execucao real: ${state.dynamicCaptured || 0}`);
  L.push(`[ok] ${total} arquivos capturados com sucesso.`);
  if (!fails.length && !remaining.length && !dependencyGaps.length) {
    L.push('[ok] Nenhum arquivo ficou de fora. Captura completa!');
    L.push('');
    return L.join('\n');
  }
  if (fails.length) L.push(`[!]  ${fails.length} arquivo(s) nao puderam ser baixados (lista abaixo).`);
  if (remaining.length) L.push(`[!]  ${remaining.length} referencia(s) ativa(s) continuam externas.`);
  if (dependencyGaps.length) L.push(`[!]  ${dependencyGaps.length} dependencia(s) citada(s) pelos controladores nao foram localizadas.`);
  L.push('');
  const criticalScripts = fails.filter((e) => /\.(m?js)(\?|$)/i.test(e.url || ''));
  if (criticalScripts.length) {
    L.push('[CRITICO] Um ou mais scripts ativos nao foram obtidos. Animacoes ou interacoes');
    L.push('podem ficar incompletas. Consulte VALIDACAO-DE-ANIMACOES.txt.');
  } else {
    L.push('Os itens abaixo nao foram obtidos. O impacto depende da funcao de cada arquivo.');
  }
  L.push('');

  const groups = {};
  for (const e of fails) {
    const cat = categorizeUrl(e.url);
    (groups[cat] = groups[cat] || []).push(e);
  }
  const order = ['imagens', 'videos', 'fontes', 'estilos', 'scripts', 'outros'];
  const titulo = {
    imagens: 'IMAGENS', videos: 'VIDEOS E MIDIA', fontes: 'FONTES',
    estilos: 'ESTILOS (CSS)', scripts: 'SCRIPTS', outros: 'OUTROS ARQUIVOS',
  };
  if (fails.length) {
    L.push('O QUE FALTOU, POR TIPO');
    L.push('----------------------');
    for (const cat of order) {
      const items = groups[cat];
      if (!items || !items.length) continue;
      L.push('');
      L.push(`${titulo[cat]} — ${items.length} arquivo(s)`);
      for (const it of items.slice(0, 500)) {
        const name = decodeURIComponent((it.url.split('/').pop() || it.url).split('?')[0]).slice(0, 90);
        L.push(`  - ${name}`);
        L.push(`      motivo: ${friendlyReason(it.reason)}`);
        L.push(`      link:   ${it.url}`);
      }
    }
  }
  if (remaining.length) {
    L.push('');
    L.push('REFERENCIAS ATIVAS AINDA EXTERNAS');
    L.push('--------------------------------');
    remaining.forEach((u) => L.push(`- ${u}`));
  }
  if (dependencyGaps.length) {
    L.push('');
    L.push('DEPENDENCIAS DE ANIMACAO AUSENTES');
    L.push('--------------------------------');
    dependencyGaps.forEach((item) => L.push(`- ${item}`));
  }
  L.push('');
  L.push('POR QUE ISSO ACONTECE');
  L.push('---------------------');
  L.push('- "sem permissao de acesso": o servidor bloqueou o download por protecao.');
  L.push('- "nao encontrado": o arquivo nao existe mais naquele endereco.');
  L.push('- "falha de conexao": instabilidade de rede no momento da captura.');
  L.push('');
  L.push('O QUE VOCE PODE FAZER');
  L.push('---------------------');
  L.push('1. Tente clonar de novo mais tarde — falhas de rede costumam se resolver.');
  L.push('2. Ao reconstruir o site com IA, os arquivos faltantes podem ser trocados');
  L.push('   por equivalentes. Descreva no prompt o que faltou (ex.: "a imagem do');
  L.push('   topo nao veio, gere uma parecida").');
  L.push('3. Se for um video ou imagem essencial, baixe-o manualmente pelo link');
  L.push('   acima (botao direito na pagina original > salvar).');
  L.push('');
  return L.join('\n');
}

function buildAnimationValidation(startUrl, state) {
  const L = [];
  const remaining = (state.validation && state.validation.remainingRemote) || [];
  const stats = (state.validation && state.validation.stats) || {};
  const dependencyGaps = (state.validation && state.validation.dependencyGaps) || [];
  const criticalErrors = state.errors.filter((e) => /\.(m?js|wasm|riv|json)(\?|$)/i.test(e.url || ''));
  L.push('VALIDACAO DE ANIMACOES - DevClone');
  L.push('================================================');
  L.push('');
  L.push(`Origem: ${startUrl}`);
  L.push(`Fonte do HTML: ${stats.source || state.captureMode}`);
  L.push(`Recursos registrados durante a execucao: ${state.dynamicCaptured || 0}`);
  L.push(`Mapeamentos usados pelo runtime local: ${stats.runtimeMappings || 0}`);
  L.push(`Stack observada: ${(state.stack || []).join(', ') || 'nao identificada'}`);
  L.push('');
  L.push('RESULTADO');
  L.push('---------');
  if (state.captureMode === 'network-original' && !criticalErrors.length && !remaining.length && !dependencyGaps.length) {
    L.push('[ok] HTML original preservado e dependencias de animacao observadas foram incorporadas.');
  } else {
    if (state.captureMode !== 'network-original') L.push('[!] A captura avancada nao ficou disponivel; foi usado o DOM renderizado.');
    if (criticalErrors.length) L.push(`[!] ${criticalErrors.length} controlador(es) ou arquivo(s) de runtime falharam.`);
    if (remaining.length) L.push(`[!] ${remaining.length} referencia(s) ativa(s) continuam externas.`);
    if (dependencyGaps.length) L.push(`[!] ${dependencyGaps.length} tipo(s) de dependencia citados no JavaScript nao apareceram no ZIP.`);
  }
  L.push('');
  L.push('IMPORTANTE');
  L.push('----------');
  L.push('Execute por http://localhost. Abrir index.html por duplo clique usa file:// e');
  L.push('pode bloquear modulos, fetch, WASM, workers, Rive e outras animacoes modernas.');
  if (remaining.length) {
    L.push('');
    L.push('REFERENCIAS ATIVAS QUE CONTINUAM REMOTAS');
    L.push('----------------------------------------');
    remaining.forEach((u) => L.push(`- ${u}`));
  }
  if (criticalErrors.length) {
    L.push('');
    L.push('FALHAS CRITICAS');
    L.push('---------------');
    criticalErrors.forEach((e) => L.push(`- ${e.url} — ${e.reason}`));
  }
  if (dependencyGaps.length) {
    L.push('');
    L.push('DEPENDENCIAS CITADAS, MAS AUSENTES');
    L.push('--------------------------------');
    dependencyGaps.forEach((item) => L.push(`- ${item}`));
  }
  if (state.captureWarnings && state.captureWarnings.length) {
    L.push('');
    L.push('AVISOS TECNICOS DA CAPTURA');
    L.push('--------------------------');
    state.captureWarnings.slice(0, 100).forEach((e) => L.push(`- ${e.url || 'captura'} — ${e.reason}`));
  }
  L.push('');
  return L.join('\n');
}

// ------------------------------------------------------------------ JS (ES Modules) recursivo
// Frameworks modernos (Framer, Vite, etc.) dividem o runtime em varios arquivos .mjs
// interligados por "import ... from './outro.mjs'" DENTRO do proprio JavaScript — nao
// em <script> do HTML. Sem seguir essas importacoes, o arquivo de entrada e baixado
// mas fica "orfao": o navegador tenta carregar os modulos dele e nao encontra nada,
// e o runtime inteiro (e as animacoes que ele controla) falha em silencio.
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

async function processJsModule(jsText, jsUrl, jsLocalPath, state, onProgress) {
  const specs = findModuleSpecifiers(jsText);
  if (!specs.length) return jsText;

  const resolved = new Map(); // specifier original -> URL absoluta
  for (const spec of specs) {
    const a = absUrl(spec, jsUrl);
    if (a) resolved.set(spec, a);
  }

  for (const [, absoluteUrl] of resolved) {
    if (state.pathMap[absoluteUrl] || state.fetched.has(absoluteUrl)) continue;
    state.fetched.add(absoluteUrl);
    try {
      const { buf, contentType } = await fetchAsset(absoluteUrl);
      onProgress && onProgress(absoluteUrl);
      const looksLikeJs = /javascript|ecmascript/.test(contentType) || /\.m?js$/i.test(absoluteUrl);
      if (looksLikeJs) {
        const text = new TextDecoder().decode(buf);
        const nestedPath = registerFileText(absoluteUrl, 'js', buf, state);
        const rewritten = await processJsModule(text, absoluteUrl, nestedPath, state, onProgress);
        if (rewritten !== text) replaceFileText(nestedPath, rewritten, state);
      } else {
        registerFile(absoluteUrl, guessKind(contentType, absoluteUrl), buf, contentType, state);
      }
    } catch (e) {
      state.errors.push({ url: absoluteUrl, reason: String(e && e.message || e) });
    }
  }

  // reescreve cada especificador de import para o caminho local relativo
  let out = jsText;
  for (const [spec, absoluteUrl] of resolved) {
    if (!state.pathMap[absoluteUrl]) continue; // falhou -> mantem como estava (vira 404 visivel, nao silencioso)
    let rel = relativePath(jsLocalPath, state.pathMap[absoluteUrl]);
    if (!rel.startsWith('.') && !rel.startsWith('/')) rel = './' + rel; // import relativo exige prefixo
    const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp('(["\'])' + escaped + '\\1', 'g'), (_full, q) => q + rel + q);
  }
  return out;
}

// Reescreve tambem URLs usadas por fetch(), Worker, Rive, WASM e loaders 3D.
// Diferente dos imports ES, esses caminhos costumam aparecer como strings comuns.
function rewriteKnownJsAssets(jsText, jsUrl, jsLocalPath, state) {
  let out = jsText;

  // URLs absolutas completas.
  const mappings = Object.entries(state.pathMap)
    .filter(([url, local]) => /^https?:/i.test(url) && local)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [url, local] of mappings) {
    if (!out.includes(url)) continue;
    out = out.split(url).join(relativePath(jsLocalPath, local));
  }

  // Strings relativas que apontam inequivocamente para um arquivo capturado.
  // Nao usamos um curinga para "qualquer texto entre aspas": em bundles
  // minificados isso atravessa aspas escapadas de shaders/templates e corrompe
  // partes arbitrarias do controlador (inclusive GLSL e textos de cena).
  const assetLiteralRe = /(["'`])((?:(?:\.\.?)?\/|\/)[^"'`\\\r\n]{1,2000}\.(?:m?js|css|wasm|riv|lottie|glb|gltf|bin|ktx2?|basis|hdr|exr|dds|tga|obj|fbx|mtl|ply|stl|dae|meshopt|json|png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mov|m4v|ogv|mp3|ogg|wav|aac)(?:\?[^"'`\\\r\n]*)?)\1/gi;
  out = out.replace(assetLiteralRe, (full, q, value) => {
    if (/^(data:|blob:|javascript:|#)/i.test(value)) return full;
    const absolute = absUrl(value, jsUrl);
    if (!absolute || !state.pathMap[absolute]) return full;
    return `${q}${relativePath(jsLocalPath, state.pathMap[absolute])}${q}`;
  });

  // Bases dinamicas, por exemplo CDN + nomeDoArquivo + '.riv'. So trocamos
  // quando todos os recursos daquela pasta remota foram salvos na mesma pasta local.
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

function kindFromNetwork(record) {
  const type = String(record.type || '').toLowerCase();
  if (type === 'stylesheet') return 'css';
  if (type === 'script') return 'js';
  if (type === 'image') return 'img';
  if (type === 'media') return 'media';
  if (type === 'font') return 'font';
  if (type === 'manifest') return 'data';
  return guessKind(record.mimeType || '', record.url || '');
}

function registerNetworkRecords(records, state, cssToProcess, jsToProcess) {
  for (const record of records || []) {
    if (!record || !record.url || !record.bytes || record.type === 'Document') continue;
    if (state.pathMap[record.url]) continue;
    const kind = kindFromNetwork(record);
    state.fetched.add(record.url);
    let path;
    if (kind === 'css') {
      path = registerFileText(record.url, 'css', record.bytes, state);
      cssToProcess.push({ url: record.url, path, text: new TextDecoder().decode(record.bytes) });
    } else if (kind === 'js') {
      path = registerFileText(record.url, 'js', record.bytes, state);
      jsToProcess.push({ url: record.url, path, text: new TextDecoder().decode(record.bytes) });
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

// ------------------------------------------------------------------ CSS recursivo
async function processCss(cssText, cssUrl, cssLocalPath, state, onProgress) {
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

  // busca e registra cada dependencia, depois reescreve
  for (const dep of found) {
    const absoluteUrl = absUrl(dep.raw, cssUrl);
    if (!absoluteUrl) continue;
    if (!state.pathMap[absoluteUrl] && !state.fetched.has(absoluteUrl)) {
      state.fetched.add(absoluteUrl);
      try {
        const { buf, contentType } = await fetchAsset(absoluteUrl);
        onProgress && onProgress(absoluteUrl);
        if (dep.kind === 'css' || contentType === 'text/css') {
          // CSS aninhado: registra e processa recursivamente
          const nestedPath = registerFileText(absoluteUrl, 'css', buf, state);
          const nestedText = new TextDecoder().decode(buf);
          const rewritten = await processCss(nestedText, absoluteUrl, nestedPath, state, onProgress);
          replaceFileText(nestedPath, rewritten, state);
        } else {
          registerFile(absoluteUrl, guessKind(contentType, absoluteUrl), buf, contentType, state);
        }
      } catch (e) {
        state.errors.push({ url: absoluteUrl, reason: String(e && e.message || e) });
      }
    }
  }

  // reescreve o texto do CSS trocando urls -> caminho relativo a partir do CSS
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

function guessKind(contentType, url) {
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

// versoes "text" para arquivos que precisam ser reescritos depois
const DEFAULT_EXT_BY_KIND = { css: 'css', js: 'js' };
function registerFileText(url, kind, buf, state) {
  const cat = CATEGORY[kind] || 'assets/img';
  const ext = extFromUrl(url) || DEFAULT_EXT_BY_KIND[kind] || 'txt';
  let base = sanitizeSegment(decodeURIComponent((url.split('/').pop() || '').split('?')[0])) || kind;
  const path = uniqueName(cat, base.replace(/\.[^.]*$/, ''), ext, state);
  state.pathMap[url] = path;
  state.files.push({ name: path, data: buf });
  state.bytes += buf.length;
  return path;
}

function replaceFileText(path, newText, state) {
  const data = new TextEncoder().encode(newText);
  const f = state.files.find((x) => x.name === path);
  if (f) { state.bytes += data.length - f.data.length; f.data = data; }
}

// ------------------------------------------------------------------ crawl
async function crawlSameOrigin(startUrl, depth, state, onProgress) {
  const origin = new URL(startUrl).origin;
  const visited = new Set([startUrl]);
  const pages = []; // { url, html }
  let frontier = [startUrl];
  const MAX_PAGES = 60;

  for (let d = 0; d <= depth && frontier.length; d++) {
    const next = [];
    for (const pageUrl of frontier) {
      if (pages.length >= MAX_PAGES) break;
      try {
        const resp = await fetch(pageUrl, { credentials: 'omit', redirect: 'follow' });
        if (!resp.ok) { state.errors.push({ url: pageUrl, reason: `HTTP ${resp.status}` }); continue; }
        const html = await resp.text();
        pages.push({ url: pageUrl, html });
        onProgress && onProgress(pageUrl);
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
        state.errors.push({ url: pageUrl, reason: String(e && e.message || e) });
      }
    }
    frontier = next;
  }
  return pages;
}

// nome de arquivo html para uma pagina crawleada
function pageFileName(pageUrl, startUrl, state) {
  const u = new URL(pageUrl);
  if (pageUrl.split('#')[0].replace(/\/$/, '') === startUrl.split('#')[0].replace(/\/$/, '')) return null; // e a raiz
  let p = u.pathname.replace(/^\/+|\/+$/g, '');
  if (!p) p = 'index';
  p = p.replace(/\//g, '_');
  p = sanitizeSegment(p) || 'page';
  return uniqueName('pages', p, 'html', state);
}

// reescreve HTML cru (paginas do crawl, sem DOM) via regex simples de assets
function rewriteRawHtml(html, pageUrl, state, htmlLocalPath) {
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

// ------------------------------------------------------------------ docs
function buildReadme(startUrl, state, opts) {
  const total = state.files.length;
  const kb = (state.bytes / 1024).toFixed(1);
  const lines = [];
  lines.push('# DevClone — Clone de alta fidelidade');
  lines.push('');
  lines.push(`- **Origem:** ${startUrl}`);
  lines.push(`- **Gerado em:** ${new Date().toISOString()}`);
  lines.push(`- **Escopo:** ${opts.scope === 'site' ? `site (profundidade ${opts.depth})` : 'pagina atual'}`);
  if (state.stack && state.stack.length) lines.push(`- **Stack detectada:** ${state.stack.join(', ')}`);
  lines.push(`- **Arquivos:** ${total}  •  **Tamanho (descompactado):** ${kb} KB`);
  lines.push(`- **Captura:** ${state.captureMode === 'network-original' ? 'rede real + HTML original' : 'modo de compatibilidade'}`);
  lines.push('');
  lines.push('## Estrutura');
  lines.push('```');
  lines.push('/index.html          pagina principal (HTML renderizado)');
  lines.push('/css/                folhas de estilo');
  lines.push('/js/                 scripts');
  lines.push('/assets/img/         imagens, icones, SVGs');
  lines.push('/assets/fonts/       fontes web');
  lines.push('/assets/media/       video/audio');
  lines.push('/assets/runtime/     WASM e runtimes binarios');
  lines.push('/assets/data/        JSON, manifests e dados de animacao');
  lines.push('/pages/              outras paginas (modo site inteiro)');
  lines.push('/AI_CONTEXT.md       briefing para reconstrucao por IA');
  lines.push('/RELATORIO-DE-CAPTURA.txt  o que veio e o que faltou (linguagem simples)');
  lines.push('/VALIDACAO-DE-ANIMACOES.txt  verificacao de scripts e recursos dinamicos');
  lines.push('```');
  lines.push('');
  lines.push('## Como usar');
  lines.push('1. No Windows, extraia o ZIP e de dois cliques em `ABRIR-SITE.cmd`.');
  lines.push('   O launcher inicia o servidor local, escolhe uma porta disponivel e abre o');
  lines.push('   navegador automaticamente. Nao e necessario instalar ou configurar nada.');
  lines.push('   Nao abra `index.html` diretamente: o protocolo `file://` bloqueia fetch,');
  lines.push('   WASM, workers, Rive, modulos JavaScript e varias animacoes modernas.');
  lines.push('2. Para recriar numa IA, abra o `AI_CONTEXT.md`: o topo traz um **prompt pronto** para colar (com a stack e a paleta ja preenchidas). Anexe este .zip na sua ferramenta (Lovable, v0, Bolt, Cursor, Claude, ChatGPT etc.) e cole o prompt.');
  lines.push('3. Se algum arquivo faltar, abra o `RELATORIO-DE-CAPTURA.txt`: ele explica, em linguagem simples, o que nao veio e por que.');
  lines.push('');
  lines.push('## Limitacoes conhecidas');
  lines.push('- Captura apenas o **front-end entregue ao navegador**. Backend, banco e APIs privadas nao sao acessiveis.');
  lines.push('- Backend, banco, login privado, WebSocket e APIs autenticadas continuam pertencendo ao servidor original.');
  lines.push('- DRM, streaming protegido e recursos que nem a pagina original conseguiu carregar nao podem ser incorporados.');
  lines.push('- Consulte `VALIDACAO-DE-ANIMACOES.txt` antes de considerar o clone completo.');
  if (state.usesEsModules) {
    lines.push('- Modulos JavaScript modernos precisam do `ABRIR-SITE.cmd`; o duplo clique no `index.html` usa `file://` e bloqueia recursos.');
  }
  if (state.errors.length) {
    lines.push('');
    lines.push(`## Assets que falharam (${state.errors.length})`);
    for (const e of state.errors.slice(0, 200)) lines.push(`- ${e.url} — ${e.reason}`);
  } else {
    lines.push('');
    lines.push('## Assets que falharam');
    lines.push('Nenhum. Captura completa.');
  }
  lines.push('');
  return lines.join('\n');
}

function buildMasterPrompt(meta, startUrl) {
  const stack = (meta.stack && meta.stack.length) ? meta.stack.join(', ') : 'nao identificada';
  const palette = (meta.palette && meta.palette.length) ? meta.palette.slice(0, 6).join(', ') : 'ver AI_CONTEXT.md';
  const fonts = (meta.fonts && meta.fonts.length) ? meta.fonts.slice(0, 4).join(', ') : 'ver AI_CONTEXT.md';
  const bps = (meta.breakpoints && meta.breakpoints.length) ? meta.breakpoints.join(', ') : 'mobile / tablet / desktop';
  const P = [];
  P.push('# ▶ COMECE AQUI — cole este prompt na sua IA');
  P.push('');
  P.push('> Anexe o `.zip` (ou arraste a pasta descompactada) na sua ferramenta de IA favorita');
  P.push('> — Lovable, v0, Bolt, Cursor, Replit, Claude ou ChatGPT — e cole o texto abaixo.');
  P.push('');
  P.push('---');
  P.push('');
  P.push('Você é um engenheiro front-end sênior. Vou te entregar a **exportação estática de um site já existente** (arquivos HTML, CSS, JS e assets: imagens, fontes, ícones e mídia), gerada por uma extensão de clonagem. No pacote há um `AI_CONTEXT.md` com a stack, a paleta, a tipografia e a estrutura de seções da página.');
  P.push('');
  P.push(`- **Site de origem:** ${startUrl}`);
  P.push(`- **Stack detectada na origem:** ${stack}`);
  P.push(`- **Paleta principal:** ${palette}`);
  P.push(`- **Tipografia:** ${fonts}`);
  P.push(`- **Breakpoints:** ${bps}`);
  P.push('');
  P.push('**Objetivo:** reconstruir este site como um projeto limpo, editável e responsivo — fiel ao visual original, mas com código organizado que eu consiga evoluir.');
  P.push('');
  P.push('Faça nesta ordem:');
  P.push('1. Leia o `AI_CONTEXT.md` e o `index.html` para entender layout, seções, paleta e fontes.');
  P.push('2. Recrie a página **seção por seção** (header, hero, conteúdo, rodapé) mantendo posição, proporções, espaçamentos, cores e tipografia o mais próximo possível do original.');
  P.push('3. Use os **assets do pacote** (`/assets`, `/css`, `/js`). Referencie as imagens, ícones, fontes e vídeos que vieram junto — não invente novos.');
  P.push('4. Estruture em **componentes reutilizáveis** (usando a stack que eu indicar, ou a padrão do seu ambiente). Priorize HTML semântico e acessibilidade: foco visível, `alt` nas imagens, bom contraste.');
  P.push('5. Deixe **responsivo**, respeitando os breakpoints acima.');
  P.push('6. **Mantenha os textos e o conteúdo reais** que estão no clone.');
  P.push('7. Onde houver formulário, login, busca ou dados que dependam de backend, deixe a interface pronta e marque com `TODO` — não invente backend.');
  P.push('');
  P.push('Regras:');
  P.push('- Não adicione seções, páginas ou recursos que não existem no original.');
  P.push('- Na dúvida sobre algum detalhe, siga o que o `AI_CONTEXT.md` descreve.');
  P.push('- Entregue código limpo, com comentários onde ajudarem.');
  P.push('');
  P.push('Depois de reconstruir fielmente, aplique as mudanças que eu quero:');
  P.push('');
  P.push('```');
  P.push('[DESCREVA AQUI O QUE VOCÊ QUER MUDAR]');
  P.push('Exemplos:');
  P.push('- Trocar a paleta para as cores da minha marca (#______, #______).');
  P.push('- Reescrever o texto do hero para: "____________".');
  P.push('- Remover a seção de preços e adicionar uma seção de depoimentos.');
  P.push('- Adaptar o conteúdo para o meu produto: ____________.');
  P.push('```');
  P.push('');
  P.push('Comece confirmando em 2-3 linhas o que você entendeu do site e da stack; depois mãos à obra.');
  P.push('');
  P.push('---');
  P.push('');
  return P.join('\n');
}

function buildAiContext(meta, startUrl) {
  const L = [];
  L.push(buildMasterPrompt(meta, startUrl));
  L.push('# Briefing para reconstrucao por IA');
  L.push('');
  L.push('Voce recebeu um clone **estatico** de uma pagina web. Use esta descricao como');
  L.push('REFERENCIA de layout e estilo para reconstruir a interface como componentes na');
  L.push('ferramenta/stack de sua preferencia. Nao trate os arquivos como import direto — o');
  L.push('objetivo e recriar fielmente o visual e a estrutura, com codigo limpo.');
  L.push('');
  L.push('## Identidade da pagina');
  L.push(`- **URL de origem:** ${startUrl}`);
  if (meta.title) L.push(`- **Titulo:** ${meta.title}`);
  if (meta.description) L.push(`- **Descricao:** ${meta.description}`);
  if (meta.lang) L.push(`- **Idioma:** ${meta.lang}`);
  if (meta.viewport) L.push(`- **Viewport:** ${meta.viewport}`);
  L.push('');
  if (meta.stack && meta.stack.length) {
    L.push('## Stack detectada');
    L.push('Tecnologias identificadas na pagina de origem (use como pista para a reconstrucao):');
    meta.stack.forEach((s) => L.push(`- ${s}`));
    L.push('');
  }
  if (meta.palette && meta.palette.length) {
    L.push('## Paleta de cores (mais frequentes)');
    meta.palette.forEach((c) => L.push(`- \`${c}\``));
    L.push('');
  }
  if (meta.fonts && meta.fonts.length) {
    L.push('## Tipografia');
    meta.fonts.forEach((f) => L.push(`- ${f}`));
    L.push('');
  }
  if (meta.breakpoints && meta.breakpoints.length) {
    L.push('## Breakpoints observados');
    L.push(meta.breakpoints.join(', '));
    L.push('');
  }
  if (meta.sections && meta.sections.length) {
    L.push('## Estrutura / secoes (na ordem do DOM)');
    meta.sections.forEach((s, i) => {
      const label = s.label ? ` — "${s.label}"` : '';
      const cls = s.cls ? ` [class: ${s.cls}]` : '';
      L.push(`${i + 1}. <${s.tag}>${label}${cls} · ${s.childBlocks} blocos filhos`);
    });
    L.push('');
  }
  if (meta.headings && meta.headings.length) {
    L.push('## Outline de titulos');
    meta.headings.forEach((h) => L.push(`- ${h.level.toUpperCase()}: ${h.text}`));
    L.push('');
  }
  if (meta.counts) {
    L.push('## Contagem de elementos');
    L.push(`- Imagens: ${meta.counts.images} · Links: ${meta.counts.links} · Scripts: ${meta.counts.scripts} · Formularios: ${meta.counts.forms}`);
    L.push('');
  }
  L.push('## Instrucao sugerida para a IA');
  L.push('> Reconstrua esta pagina como uma interface responsiva, seguindo a paleta, a');
  L.push('> tipografia e a ordem de secoes acima. Priorize semantica, acessibilidade e');
  L.push('> codigo limpo. Consulte os arquivos HTML/CSS do clone para detalhes visuais.');
  L.push('');
  return L.join('\n');
}

// Modulos ES (type="module") sao bloqueados pelo navegador quando a pagina e aberta
// direto do disco (file://) — restricao de seguranca do proprio Chrome/Firefox, nao
// falha da captura. Como isso silenciosamente quebra animacoes/interatividade em sites
// modernos (Framer, Vite, etc.), avisamos quem abrir localmente com um banner que so
// aparece nesse cenario. O script e comum (nao "type=module"), entao roda sempre.
function injectFileProtocolNotice(html) {
  const banner = `
<script>(function(){
  try {
    if (location.protocol !== 'file:') return;
    var b = document.createElement('div');
    b.textContent = 'Este clone precisa do servidor local incluido no pacote. Feche esta aba e de dois cliques em ABRIR-SITE.cmd.';
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#0a0d14;color:#eef1f7;font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;padding:10px 44px 10px 14px;box-shadow:0 -4px 20px rgba(0,0,0,.35)';
    var x = document.createElement('button');
    x.textContent = '\\u2715';
    x.setAttribute('aria-label','Fechar aviso');
    x.style.cssText = 'position:absolute;right:8px;top:6px;background:transparent;border:0;color:#9aa4b6;font-size:15px;cursor:pointer;padding:4px 8px;line-height:1';
    x.onclick = function(){ b.remove(); };
    b.appendChild(x);
    (document.body || document.documentElement).appendChild(b);
  } catch (e) {}
})();</script>
`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, banner + '</body>');
  return html + banner;
}

// ------------------------------------------------------------------ mensageria com content
function sendToTab(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(resp);
    });
  });
}

async function ensureContentScript(tabId, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const r = await sendToTab(tabId, { action: 'ping' });
      if (r && r.ok) return;
    } catch (e) {
      lastError = e;
    }

    // Injeta manualmente em paginas abertas antes da instalacao ou quando
    // o Chrome reteve o content script. content.js possui guarda contra
    // dupla inicializacao, portanto repetir a injecao e seguro.
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      const r = await sendToTab(tabId, { action: 'ping' });
      if (r && r.ok) return;
    } catch (e) {
      lastError = e;
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 220 * (attempt + 1)));
    }
  }

  const message = String(lastError && lastError.message || lastError || 'content script indisponivel');
  const lower = message.toLowerCase();
  if (
    lower.includes('cannot access contents') ||
    lower.includes('respective host') ||
    lower.includes('host permission') ||
    lower.includes('not allowed')
  ) {
    throw new Error(`host_permission_missing: ${message}`);
  }
  throw new Error(`content_script_unavailable: ${message}`);
}

// roda no contexto REAL da pagina (world MAIN) para ler globals de framework
function stackProbeMain() {
  const w = window;
  const out = [];
  const has = (k) => { try { return typeof w[k] !== 'undefined' && w[k] !== null; } catch { return false; } };
  if (has('React') || has('__REACT_DEVTOOLS_GLOBAL_HOOK__') || has('__NEXT_DATA__')) out.push('React');
  if (has('__NEXT_DATA__')) out.push('Next.js');
  if (has('Vue') || has('__VUE__') || has('__NUXT__') || has('__VUE_HMR_RUNTIME__')) out.push('Vue');
  if (has('__NUXT__')) out.push('Nuxt');
  if (has('ng') || has('getAllAngularRootElements')) out.push('Angular');
  if (has('__svelte') || has('__SVELTEKIT__')) out.push('Svelte');
  if (has('Alpine')) out.push('Alpine.js');
  if (has('gsap') || has('TweenMax') || has('TweenLite')) out.push('GSAP');
  if (has('jQuery')) out.push('jQuery');
  if (has('THREE')) out.push('Three.js');
  if (has('Swiper')) out.push('Swiper');
  if (has('Shopify')) out.push('Shopify');
  if (has('Webflow')) out.push('Webflow');
  if (has('lottie') || has('bodymovin')) out.push('Lottie');
  if (has('rive') || has('Rive') || has('rivejs')) out.push('Rive');
  if (has('Lenis') || has('lenis')) out.push('Lenis');
  if (has('barba')) out.push('Barba.js');
  if (has('ScrollMagic')) out.push('ScrollMagic');
  if (has('LocomotiveScroll')) out.push('Locomotive Scroll');
  return out;
}

// ordem de exibicao (frameworks -> css -> libs)
const STACK_ORDER = [
  'Next.js', 'Nuxt', 'React', 'Vue', 'Angular', 'Svelte', 'Astro', 'Alpine.js',
  'Webflow', 'Framer', 'WordPress', 'Elementor', 'Wix', 'Squarespace', 'Shopify',
  'Tailwind CSS', 'Bootstrap',
  'GSAP', 'Three.js', 'Rive', 'Lottie', 'Lenis', 'Swiper', 'AOS', 'Locomotive Scroll', 'ScrollMagic', 'Barba.js', 'jQuery',
];

async function detectStack(tabId) {
  const set = new Set();
  await ensureContentScript(tabId);
  // 1) globals no contexto da pagina
  try {
    const res = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: stackProbeMain });
    if (res && res[0] && Array.isArray(res[0].result)) res[0].result.forEach((s) => set.add(s));
  } catch { /* CSP ou pagina restrita */ }
  // 2) sinais do DOM (via content script)
  try {
    const r = await sendToTab(tabId, { action: 'domStack' });
    if (r && r.ok && Array.isArray(r.stack)) r.stack.forEach((s) => set.add(s));
  } catch { /* ignore */ }
  // ordena
  const arr = Array.from(set);
  arr.sort((a, b) => {
    const ia = STACK_ORDER.indexOf(a), ib = STACK_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return arr;
}

// ------------------------------------------------------------------ download robusto
let _offscreenCreating = null;

async function ensureOffscreen() {
  try {
    if (chrome.offscreen.hasDocument) {
      const has = await chrome.offscreen.hasDocument();
      if (has) return true;
    }
  } catch {}
  try {
    if (_offscreenCreating) { await _offscreenCreating; return true; }
    _offscreenCreating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Gerar o link de download do arquivo .zip clonado.',
    });
    await _offscreenCreating;
    _offscreenCreating = null;
    return true;
  } catch (e) {
    _offscreenCreating = null;
    // se ja existir (corrida), tudo bem
    if (String(e && e.message || e).includes('Only a single offscreen')) return true;
    return false;
  }
}

function triggerDownload(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: true }, (id) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(id);
    });
  });
}

// Salva o zip. Caminho principal: offscreen + Blob, transferido em PEDACOS PEQUENOS
// (nunca uma string base64 unica com o zip inteiro — isso e o que lancava
// "Invalid string length" em sites com muito video/imagem). Fallback: data: URL,
// usado so quando o zip e pequeno o suficiente para ser seguro.
const TRANSFER_CHUNK_BYTES = 4 * 1024 * 1024; // 4MB por mensagem — bem abaixo de qualquer limite
const SAFE_DATA_URL_BYTES = 25 * 1024 * 1024;  // acima disso, so tentamos o caminho em pedacos

async function saveZip(zipBytes, filename, onProgress) {
  // caminho principal: offscreen, em pedacos
  try {
    const ok = await ensureOffscreen();
    if (ok) {
      await chrome.runtime.sendMessage({ target: 'offscreen', action: 'zip-start' });
      for (let i = 0; i < zipBytes.length; i += TRANSFER_CHUNK_BYTES) {
        const slice = zipBytes.subarray(i, i + TRANSFER_CHUNK_BYTES);
        const b64 = toBase64(slice); // seguro: no maximo ~4MB por vez, nunca o zip inteiro
        const r = await chrome.runtime.sendMessage({ target: 'offscreen', action: 'zip-chunk', b64 });
        if (!r || !r.ok) throw new Error('offscreen_chunk_failed');
        if (onProgress) onProgress(Math.min(i + TRANSFER_CHUNK_BYTES, zipBytes.length), zipBytes.length);
      }
      const fin = await chrome.runtime.sendMessage({ target: 'offscreen', action: 'zip-finish' });
      if (fin && fin.ok && fin.url) {
        const id = await triggerDownload(fin.url, filename);
        const onChanged = (delta) => {
          if (delta.id === id && delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
            chrome.runtime.sendMessage({ target: 'offscreen', action: 'revoke', url: fin.url }).catch(() => {});
            chrome.downloads.onChanged.removeListener(onChanged);
          }
        };
        chrome.downloads.onChanged.addListener(onChanged);
        return;
      }
    }
  } catch (e) {
    // cai para o fallback abaixo (so seguro para zips pequenos)
  }

  // fallback: data URL — so tentamos se o zip for pequeno o bastante para nao
  // repetir o mesmo problema (string unica gigante)
  if (zipBytes.length > SAFE_DATA_URL_BYTES) {
    throw new Error('zip_too_large_no_offscreen');
  }
  const dataUrl = `data:application/zip;base64,${toBase64(zipBytes)}`;
  await triggerDownload(dataUrl, filename);
}

// ------------------------------------------------------------------ fluxo principal
async function runClone(tabId, opts, progress, sourceUrlHint = '') {
  const state = newState();
  let captureTabId = null;
  let pageOpsTabId = tabId;

  try {
    let originalHtml = '';
    let capturedPageUrl = '';
    let networkRecords = [];

    // 1) A aba auxiliar é aberta normalmente, mas toda leitura/injeção
    // posterior usa Chrome Debugger/CDP, fora do caminho de host permission.
    progress({ phase: 'recording', message: 'Preparando captura avançada das animações…' });
    try {
      let sourceUrl = sourceUrlHint;
      if (!sourceUrl) {
        try {
          const sourceTab = await chrome.tabs.get(tabId);
          sourceUrl = sourceTab && sourceTab.url ? sourceTab.url : '';
        } catch {}
      }
      if (!/^https?:/i.test(sourceUrl || '')) throw new Error('source_url_unavailable');

      const captureTab = await chrome.tabs.create({ url: sourceUrl, active: false });
      if (!captureTab || !captureTab.id) throw new Error('helper_tab_create_failed');
      captureTabId = captureTab.id;
      pageOpsTabId = captureTab.id;

      const captured = await captureNetworkSession(captureTab.id, {
        progress,
        primePage: async () => primePageViaAttachedDebugger(captureTab.id),
      });
      originalHtml = captured.documentHtml || '';
      capturedPageUrl = captured.documentUrl || '';
      networkRecords = captured.records || [];
      state.captureMode = originalHtml ? 'network-original' : 'network-with-dom-fallback';
      state.captureWarnings = captured.warnings || [];
      for (const failure of captured.failed || []) {
        if (!state.errors.some((item) => item.url === failure.url)) state.errors.push(failure);
      }
    } catch (e) {
      if (captureTabId) {
        try { await chrome.tabs.remove(captureTabId); } catch {}
        captureTabId = null;
      }
      pageOpsTabId = tabId;
      state.captureMode = 'compatibility';
      state.captureWarnings.push({ url: '', reason: `captura avançada indisponível: ${String(e && e.message || e)}` });
    }

    const callPage = async (message) => {
      try {
        return await callPageBridgeViaDebugger(pageOpsTabId, message);
      } catch (firstError) {
        if (pageOpsTabId !== tabId) {
          state.captureWarnings.push({
            url: '',
            reason: `bridge da aba auxiliar indisponível; usando aba original: ${String(firstError && firstError.message || firstError)}`,
          });
          pageOpsTabId = tabId;
          return await callPageBridgeViaDebugger(tabId, message);
        }
        throw firstError;
      }
    };

    // 2) coleta DOM e metadados via CDP, sem content-script messaging.
    progress({ phase: 'scanning', message: 'Analisando estrutura e componentes…' });
    const collectResp = await callPage({
      action: 'collect',
      options: { prime: state.captureMode === 'compatibility' },
    });
    if (!collectResp || !collectResp.ok) {
      throw new Error(`cdp_collect_failed: ${collectResp && collectResp.error ? collectResp.error : 'sem resposta'}`);
    }
    const { assets, meta } = collectResp.data;
    const pageUrl = capturedPageUrl || collectResp.data.pageUrl || sourceUrlHint;

    try {
      const stackResp = await callPage({ action: 'domStack' });
      meta.stack = stackResp && stackResp.ok && Array.isArray(stackResp.stack) ? stackResp.stack : [];
    } catch { meta.stack = []; }
    state.stack = meta.stack;

    // 3) registra primeiro tudo que a propria pagina recebeu. Isso inclui scripts
    // que dariam 403 num segundo download e arquivos dinamicos fora do DOM.
    let done = 0;
    const cssToProcess = [];
    const jsToProcess = [];
    registerNetworkRecords(networkRecords, state, cssToProcess, jsToProcess);

    // 4) completa o que nao apareceu na rede usando o coletor tradicional.
    const totalAssets = assets.length;
    for (const { url, kind } of assets) {
      if (state.fetched.has(url) || state.pathMap[url]) { done++; continue; }
      state.fetched.add(url);
      progress({
        phase: 'downloading',
        message: `Completando arquivos… ${done + 1} de ${totalAssets}`,
        count: state.files.length,
        bytes: state.bytes,
        totalAssets,
        percent: totalAssets ? Math.round(((done + 1) / totalAssets) * 100) : null,
      });
      try {
        const { buf, contentType } = await fetchAsset(url);
        const realKind = (kind === 'asset') ? guessKind(contentType, url) : kind;
        if (realKind === 'css' || contentType === 'text/css') {
          const path = registerFileText(url, 'css', buf, state);
          cssToProcess.push({ url, path, text: new TextDecoder().decode(buf) });
        } else if (realKind === 'js' || /javascript|ecmascript/.test(contentType) || /\.m?js$/i.test(url)) {
          const path = registerFileText(url, 'js', buf, state);
          jsToProcess.push({ url, path, text: new TextDecoder().decode(buf) });
        } else {
          registerFile(url, realKind, buf, contentType, state);
        }
      } catch (e) {
        state.errors.push({ url, reason: String(e && e.message || e) });
      }
      done++;
    }

    // 5) resolve dependencias internas de CSS e JavaScript.
    progress({ phase: 'processing', message: 'Organizando estilos, fontes e mídia…', count: state.files.length, bytes: state.bytes });
    for (const css of cssToProcess) {
      const rewritten = await processCss(css.text, css.url, css.path, state, () => {
        progress({ phase: 'processing', message: 'Resolvendo dependências visuais…', count: state.files.length, bytes: state.bytes });
      });
      replaceFileText(css.path, rewritten, state);
    }

    if (jsToProcess.length) {
      progress({ phase: 'processing', message: 'Reconectando animações e recursos dinâmicos…', count: state.files.length, bytes: state.bytes });
      for (const js of jsToProcess) {
        let rewritten = await processJsModule(js.text, js.url, js.path, state, () => {
          progress({ phase: 'processing', message: 'Resolvendo módulos e workers…', count: state.files.length, bytes: state.bytes });
        });
        rewritten = rewriteKnownJsAssets(rewritten, js.url, js.path, state);
        if (rewritten !== js.text) replaceFileText(js.path, rewritten, state);
      }
    }

    // 6) usa a resposta HTML original, anterior a GSAP/SplitText/Three. O DOM
    // renderizado fica apenas como fallback para paginas sem documento capturavel.
    progress({ phase: 'processing', message: 'Montando HTML limpo…', count: state.files.length, bytes: state.bytes });
    const rewriteResp = await callPage({
      action: 'rewrite',
      pathMap: state.pathMap,
      options: { sourceHtml: originalHtml, pageUrl },
    });
    let mainHtml = (rewriteResp && rewriteResp.ok) ? rewriteResp.html : '<!-- falha na reescrita -->';
    state.validation = rewriteResp && rewriteResp.ok ? {
      remainingRemote: rewriteResp.remainingRemote || [],
      stats: rewriteResp.stats || {},
    } : { remainingRemote: [], stats: {} };
    state.usesEsModules = /<script[^>]+type=["']module["']/i.test(mainHtml) || state.files.some((f) => /\.mjs$/i.test(f.name));
    state.hasDynamicRuntime = jsToProcess.length > 0 || (state.stack || []).some((s) => ['GSAP', 'Three.js', 'Rive', 'Lottie', 'Lenis', 'Framer'].includes(s));
    if (state.usesEsModules || state.hasDynamicRuntime) mainHtml = injectFileProtocolNotice(mainHtml);
    state.files.push({ name: 'index.html', data: new TextEncoder().encode(mainHtml) });

    // 7) crawl opcional das paginas internas. A pagina principal continua sendo
    // a captura de alta fidelidade; as paginas extras usam o modo estatico.
    if (opts.scope === 'site') {
    progress({ phase: 'crawling', message: 'Explorando o site…', count: state.files.length, bytes: state.bytes });
    const pages = await crawlSameOrigin(pageUrl, Math.max(1, Math.min(3, opts.depth || 1)), state,
      (u) => progress({ phase: 'crawling', message: 'Explorando páginas…', count: state.files.length, bytes: state.bytes }));

    // baixa assets novos referenciados nessas paginas (via regex)
    for (const pg of pages) {
      const fileName = pageFileName(pg.url, pageUrl, state);
      if (fileName === null) continue; // e a raiz, ja temos index.html
      const assetRe = /(?:href|src)\s*=\s*(['"])(.*?)\1/gi;
      let am;
      const pageAssets = [];
      while ((am = assetRe.exec(pg.html))) {
        const a = absUrl(am[2], pg.url);
        if (!a) continue;
        if (/\.(css|js|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|mp3)(\?|$)/i.test(a)) pageAssets.push(a);
      }
      for (const a of pageAssets) {
        if (state.pathMap[a] || state.fetched.has(a)) continue;
        state.fetched.add(a);
        try {
          const { buf, contentType } = await fetchAsset(a);
          if (contentType === 'text/css') {
            const p = registerFileText(a, 'css', buf, state);
            const rw = await processCss(new TextDecoder().decode(buf), a, p, state);
            replaceFileText(p, rw, state);
          } else {
            registerFile(a, guessKind(contentType, a), buf, contentType, state);
          }
        } catch (e) {
          state.errors.push({ url: a, reason: String(e && e.message || e) });
        }
      }
      const rewritten = rewriteRawHtml(pg.html, pg.url, state, fileName);
      state.files.push({ name: fileName, data: new TextEncoder().encode(rewritten) });
    }
    }

    // 8) launcher local, documentos e validacao.
    state.validation.dependencyGaps = animationDependencyGaps(state);
    state.files.push(...getPreviewPackageFiles());
    state.files.push({ name: 'README.md', data: new TextEncoder().encode(buildReadme(pageUrl, state, opts)) });
    state.files.push({ name: 'RELATORIO-DE-CAPTURA.txt', data: new TextEncoder().encode(buildFailureReport(pageUrl, state)) });
    state.files.push({ name: 'VALIDACAO-DE-ANIMACOES.txt', data: new TextEncoder().encode(buildAnimationValidation(pageUrl, state)) });
    if (opts.aiContext) {
      state.files.push({ name: 'AI_CONTEXT.md', data: new TextEncoder().encode(buildAiContext(meta, pageUrl)) });
    }

    // 9) zip + download.
    progress({ phase: 'zipping', message: 'Finalizando o pacote…', count: state.files.length, bytes: state.bytes });
    const zipBytes = await buildZip(state.files);

    const host = (() => { try { return new URL(pageUrl).hostname.replace(/^www\./, ''); } catch { return 'site'; } })();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `devclone_${sanitizeSegment(host)}_${stamp}.zip`;

    await saveZip(zipBytes, filename, (sent, total) => {
      progress({
        phase: 'zipping',
        message: `Preparando o download… ${Math.round((sent / total) * 100)}%`,
        count: state.files.length,
        bytes: state.bytes,
      });
    });

    return {
      fileCount: state.files.length,
      bytes: state.bytes,
      zipBytes: zipBytes.length,
      errors: state.errors,
      filename,
      captureMode: state.captureMode,
      remainingRemote: state.validation ? state.validation.remainingRemote.length : 0,
    };
  } finally {
    if (captureTabId) {
      try { await chrome.tabs.remove(captureTabId); } catch {}
    }
  }
}

// ------------------------------------------------------------------ listener do popup
// Traduz erros tecnicos residuais em mensagens que fazem sentido pra quem nao e dev.
function friendlyCloneError(err) {
  const raw = String((err && err.message) || err || '');
  const r = raw.toLowerCase();
  if (r.includes('invalid string length') || r.includes('zip_too_large_no_offscreen') || r.includes('allocation') || r.includes('out of memory')) {
    return 'Este site é grande demais (muitos vídeos/imagens) para exportar de uma vez. Tente clonar só "Página atual" em vez de "Site inteiro", ou tente novamente — às vezes libera memória e funciona.';
  }
  if (r.includes('offscreen_chunk_failed')) {
    return 'Falha ao preparar o arquivo para download. Tente novamente — se persistir, reinicie o navegador.';
  }
  if (r.includes('quota') || r.includes('storage')) {
    return 'Sem espaço suficiente para gerar o arquivo. Libere espaço em disco e tente novamente.';
  }
  if (r.includes('another debugger')) {
    return 'O Chrome já está usando o depurador nessa aba. Feche o DevTools da página e tente novamente.';
  }
  if (r.includes('cdp_bridge') || r.includes('cdp_collect_failed')) {
    return 'O motor interno de captura não conseguiu ler a página. Recarregue o site e tente novamente. Se persistir, envie o endereço do site ao suporte.';
  }
  if (r.includes('host_permission_missing') || r.includes('cannot access contents of the page') || r.includes('respective host')) {
    return 'O Chrome bloqueou o acesso desta aba mesmo após as tentativas automáticas do DevClone. Recarregue a página e clique em Tentar de novo. Se continuar, abra o menu da extensão nesta aba e permita o acesso ao site.';
  }
  if (r.includes('content_script_unavailable')) {
    return 'A página mudou ou recarregou durante o início da captura. Recarregue o site e clique em Tentar de novo.';
  }
  return raw || 'Não foi possível concluir o clone. Tente novamente.';
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.action !== 'string') return false;

  if (msg.action === 'detectStack') {
    // Responde imediatamente e publica a stack depois, sem manter canal aberto.
    sendResponse({ ok: true, stack: [], pending: true });
    detectStack(msg.tabId)
      .then((stack) => chrome.runtime.sendMessage({ action: 'stackDetected', tabId: msg.tabId, stack }).catch(() => {}))
      .catch(() => {});
    return false;
  }

  if (msg.action !== 'startClone') return false;
  const { tabId, options, sourceUrl } = msg;
  sendResponse({ ok: true, started: true });

  const progress = (p) => {
    chrome.runtime.sendMessage({ action: 'progress', payload: p }).catch(() => {});
  };

  runClone(tabId, options || {}, progress, sourceUrl || '')
    .then((result) => chrome.runtime.sendMessage({ action: 'done', payload: result }).catch(() => {}))
    .catch((err) => chrome.runtime.sendMessage({ action: 'error', payload: { message: friendlyCloneError(err) } }).catch(() => {}));

  return false;
});
