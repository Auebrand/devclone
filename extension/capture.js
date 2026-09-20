/**
 * Captura de rede de alta fidelidade via Chrome DevTools Protocol.
 *
 * O download direto feito por um service worker nao reproduz todos os headers,
 * cookies e regras de origem usados pela aba. Aqui registramos as respostas que
 * o proprio site recebeu durante um reload controlado. Isso preserva scripts
 * protegidos, Rive, WASM, workers, JSON e recursos criados em tempo de execucao.
 */

const CDP_VERSION = '1.3';
const MAX_RESOURCE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 350 * 1024 * 1024;
const NETWORK_IDLE_MS = 2000;
const CAPTURE_TIMEOUT_MS = 45000;

// Assets comuns de engines WebGL/WebGPU, Rive, Lottie e fontes MSDF. Esses
// arquivos costumam chegar como Fetch/Other, nao como Image ou Script.
const FRONTEND_ASSET_RE = /\.(?:m?js|css|wasm|riv|lottie|glb|gltf|bin|ktx2?|basis|hdr|exr|dds|tga|obj|fbx|mtl|ply|stl|dae|meshopt|png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mov|m4v|ogv|mp3|ogg|wav|aac)$/i;
const SENSITIVE_ENDPOINT_RE = /\/(?:api|graphql|rpc|auth|account|checkout|payments?|sessions?|users?)(?:\/|$)/i;

function cdp(debuggee, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(debuggee, method, params, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result || {});
    });
  });
}

function attach(debuggee) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(debuggee, CDP_VERSION, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function detach(debuggee) {
  return new Promise((resolve) => {
    chrome.debugger.detach(debuggee, () => resolve());
  });
}

function fromBase64(value) {
  const raw = atob(value || '');
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function textBytes(value) {
  return new TextEncoder().encode(value || '');
}

function normalizedUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return url || '';
  }
}

async function waitForHttpTabUrl(tabId, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastUrl = '';
  while (Date.now() < deadline) {
    try {
      const tab = await chrome.tabs.get(tabId);
      lastUrl = normalizedUrl((tab && tab.url) || '');
      if (/^https?:/i.test(lastUrl)) return lastUrl;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`capture_tab_never_reached_http:${lastUrl || 'empty'}`);
}

function shouldCapture(meta) {
  if (!meta || !/^https?:/i.test(meta.url || '')) return false;
  if (meta.status < 200 || meta.status >= 400) return false;
  if (meta.type === 'Document') return true;
  if (['Stylesheet', 'Script', 'Image', 'Media', 'Font', 'Manifest'].includes(meta.type)) return true;
  // Nao arquiva respostas arbitrarias de API, que podem conter dados pessoais.
  // Fetch/XHR/Other entram apenas quando parecem um asset de front-end.
  const mime = meta.mimeType || '';
  const url = (meta.url || '').split('?')[0].toLowerCase();
  if (/^(text\/css|text\/javascript|application\/(javascript|wasm)|image\/|font\/|video\/|audio\/)/.test(mime)) return true;
  if (FRONTEND_ASSET_RE.test(url)) return true;
  // Fontes MSDF/BMFont, manifests 3D e configuracoes de animação tambem sao
  // JSON. Limitamos a arquivos nomeados fora de endpoints tipicos de API.
  if (/\.json$/.test(url) && meta.type !== 'XHR' && !SENSITIVE_ENDPOINT_RE.test(url)) return true;
  return false;
}

/**
 * @returns {{records:Array, documentHtml:string, documentUrl:string, warnings:Array, failed:Array}}
 */
export async function captureNetworkSession(tabId, { progress, primePage } = {}) {
  const debuggee = { tabId };
  const requestMeta = new Map();
  const requestAliases = new Map();
  const records = new Map();
  const capturingUrls = new Set();
  const pendingBodies = new Set();
  const warnings = [];
  const failed = [];
  let attached = false;
  let totalBytes = 0;
  let lastActivity = Date.now();
  let loadResolve;
  let nextLoadResolve;
  let loadTimer;

  const storeBody = async (requestId, meta) => {
    if (!shouldCapture(meta) || records.has(meta.url) || capturingUrls.has(meta.url)) return;
    capturingUrls.add(meta.url);
    try {
      const body = await cdp(debuggee, 'Network.getResponseBody', { requestId });
      const bytes = body.base64Encoded ? fromBase64(body.body) : textBytes(body.body);
      if (bytes.length > MAX_RESOURCE_BYTES) {
        warnings.push({ url: meta.url, reason: `recurso acima de ${MAX_RESOURCE_BYTES / 1024 / 1024} MB` });
        return;
      }
      if (totalBytes + bytes.length > MAX_TOTAL_BYTES) {
        warnings.push({ url: meta.url, reason: 'limite de memoria da captura dinamica atingido' });
        return;
      }
      totalBytes += bytes.length;
      records.set(meta.url, { ...meta, bytes });
      if (progress) {
        progress({
          phase: 'recording',
          message: `Registrando animações e recursos… ${records.size}`,
          count: records.size,
          bytes: totalBytes,
        });
      }
    } catch (e) {
      // Respostas servidas de cache especial, redirects e streams podem nao ter corpo.
      // O fluxo principal tenta baixa-las novamente depois.
      warnings.push({ url: meta.url, reason: String(e && e.message || e) });
    } finally {
      capturingUrls.delete(meta.url);
    }
  };

  const onEvent = (source, method, params) => {
    if (!source || source.tabId !== tabId) return;
    lastActivity = Date.now();
    if (method === 'Page.loadEventFired') {
      if (loadResolve) {
        loadResolve();
        loadResolve = null;
      }
      if (nextLoadResolve) {
        nextLoadResolve();
        nextLoadResolve = null;
      }
      return;
    }
    if (method === 'Network.responseReceived') {
      const r = params.response || {};
      const url = normalizedUrl(r.url);
      requestMeta.set(params.requestId, {
        requestId: params.requestId,
        url,
        mimeType: (r.mimeType || '').split(';')[0].toLowerCase(),
        status: r.status || 0,
        type: params.type || 'Other',
        fromDiskCache: !!r.fromDiskCache,
        fromServiceWorker: !!r.fromServiceWorker,
        aliases: requestAliases.get(params.requestId) || [],
      });
      return;
    }
    if (method === 'Network.requestWillBeSent') {
      const url = normalizedUrl(params.request && params.request.url);
      if (url) {
        const aliases = requestAliases.get(params.requestId) || [];
        if (!aliases.includes(url)) aliases.push(url);
        requestAliases.set(params.requestId, aliases);
        const previous = requestMeta.get(params.requestId) || {};
        requestMeta.set(params.requestId, {
          ...previous,
          requestId: params.requestId,
          url,
          type: params.type || previous.type || 'Other',
          status: previous.status || 0,
        });
      }
      return;
    }
    if (method === 'Network.loadingFinished') {
      const meta = requestMeta.get(params.requestId);
      if (!meta) return;
      const job = storeBody(params.requestId, meta).finally(() => pendingBodies.delete(job));
      pendingBodies.add(job);
      return;
    }
    if (method === 'Network.loadingFailed') {
      const meta = requestMeta.get(params.requestId);
      const aliases = requestAliases.get(params.requestId) || [];
      const url = normalizedUrl((meta && meta.url) || aliases[aliases.length - 1] || '');
      const plainUrl = url.split('?')[0];
      const relevantJson = /\.json$/i.test(plainUrl)
        && (!meta || meta.type !== 'XHR')
        && !SENSITIVE_ENDPOINT_RE.test(plainUrl);
      if (url && (FRONTEND_ASSET_RE.test(plainUrl) || relevantJson)) {
        failed.push({
          url,
          reason: params.errorText || (params.blockedReason ? `bloqueado: ${params.blockedReason}` : 'falha de rede'),
        });
      }
    }
  };

  try {
    await attach(debuggee);
    attached = true;
    chrome.debugger.onEvent.addListener(onEvent);
    await cdp(debuggee, 'Network.enable', {
      maxTotalBufferSize: MAX_TOTAL_BYTES,
      maxResourceBufferSize: MAX_RESOURCE_BYTES,
      maxPostDataSize: 0,
    });
    await cdp(debuggee, 'Network.setCacheDisabled', { cacheDisabled: true });
    await cdp(debuggee, 'Page.enable');

    if (progress) progress({ phase: 'recording', message: 'Preparando a página para capturar as animações…' });

    // tabs.create({url}) devolve a aba antes de a navegacao necessariamente ter
    // sido commitada. Na 1.2.5, stopLoading/reload podia acontecer nesse intervalo
    // e transformar a aba auxiliar em about:blank. Esperamos uma URL HTTP real
    // antes de qualquer reload controlado.
    await waitForHttpTabUrl(tabId);

    const loaded = new Promise((resolve) => { loadResolve = resolve; });
    loadTimer = setTimeout(() => {
      if (loadResolve) {
        const resolve = loadResolve;
        loadResolve = null;
        resolve();
      }
    }, CAPTURE_TIMEOUT_MS);
    await cdp(debuggee, 'Page.reload', { ignoreCache: true });
    await loaded;
    clearTimeout(loadTimer);

    // Pequena folga para scripts defer/async e fontes iniciarem antes da rolagem.
    await new Promise((r) => setTimeout(r, 650));
    if (primePage) {
      try { await primePage(); } catch (e) { warnings.push({ url: '', reason: `rolagem assistida: ${String(e && e.message || e)}` }); }
    }

    const waitForNetworkIdle = async (maxMs = 20000, label = 'Finalizando a captura desktop') => {
      // Cenas Three.js podem iniciar texturas, HDR e fontes somente depois que
      // o canvas e o preloader foram montados. A janela maior evita cortar essa
      // segunda onda de requisicoes.
      const idleDeadline = Date.now() + maxMs;
      let nextHeartbeat = 0;
      while (Date.now() < idleDeadline && Date.now() - lastActivity < NETWORK_IDLE_MS) {
        if (progress && Date.now() >= nextHeartbeat) {
          progress({
            phase: 'recording',
            message: `${label}… ${records.size} recursos`,
            count: records.size,
            bytes: totalBytes,
          });
          nextHeartbeat = Date.now() + 1200;
        }
        await new Promise((r) => setTimeout(r, 180));
      }
      await Promise.allSettled(Array.from(pendingBodies));
    };
    await waitForNetworkIdle();

    // Segunda passagem em viewport movel. Muitos sites escolhem KTX2, modelos,
    // Rive e imagens diferentes por breakpoint; uma unica largura nao consegue
    // observar essas dependencias. Como esta e uma aba auxiliar, a viewport da
    // aba original do usuario nao e alterada.
    try {
      if (progress) progress({ phase: 'recording', message: 'Capturando também os recursos da versão móvel…', count: records.size, bytes: totalBytes });
      await cdp(debuggee, 'Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true,
      });
      lastActivity = Date.now();
      const nextLoaded = new Promise((resolve) => { nextLoadResolve = resolve; });
      await cdp(debuggee, 'Page.reload', { ignoreCache: true });
      await Promise.race([
        nextLoaded,
        new Promise((resolve) => setTimeout(resolve, CAPTURE_TIMEOUT_MS)),
      ]);
      await new Promise((r) => setTimeout(r, 650));
      if (primePage) await primePage();
      await waitForNetworkIdle(20000, 'Finalizando a captura móvel');
      await cdp(debuggee, 'Emulation.clearDeviceMetricsOverride');
    } catch (e) {
      warnings.push({ url: '', reason: `passagem móvel: ${String(e && e.message || e)}` });
      try { await cdp(debuggee, 'Emulation.clearDeviceMetricsOverride'); } catch {}
    }
    await Promise.allSettled(Array.from(pendingBodies));
  } finally {
    if (loadTimer) clearTimeout(loadTimer);
    try { chrome.debugger.onEvent.removeListener(onEvent); } catch {}
    if (attached) await detach(debuggee);
  }

  const tab = await chrome.tabs.get(tabId);
  const pageUrl = normalizedUrl(tab.url || '');
  if (!/^https?:/i.test(pageUrl)) {
    throw new Error(`capture_invalid_final_url:${pageUrl || 'empty'}`);
  }
  let documentRecord = records.get(pageUrl);
  if (!documentRecord) {
    documentRecord = Array.from(records.values()).find((r) => r.type === 'Document') || null;
  }
  let documentHtml = '';
  if (documentRecord && documentRecord.bytes) {
    try { documentHtml = new TextDecoder().decode(documentRecord.bytes); } catch {}
  }

  const compactHtml = documentHtml.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
  if (records.size <= 1 && (!compactHtml || /^<!doctype html>\s*<html[^>]*>\s*<head>\s*<\/head>\s*<body>\s*<\/body>\s*<\/html>$/i.test(compactHtml))) {
    throw new Error('capture_empty_document');
  }

  return {
    records: Array.from(records.values()),
    documentHtml,
    documentUrl: documentRecord ? documentRecord.url : pageUrl,
    warnings,
    failed,
    totalBytes,
  };
}
