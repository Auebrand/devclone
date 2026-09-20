/**
 * capture-cdp.mjs — captura de rede de alta fidelidade, portada de capture.js
 * (extensão Chrome MV3, permissão "debugger") para Playwright + CDPSession.
 *
 * Mesma lógica e os mesmos limites do capture.js original: allowlist de
 * tipos/mime de front-end, exclusão de endpoints sensíveis (api/auth/
 * checkout/sessions/users), limites de tamanho por recurso e por sessão,
 * duas passagens (desktop + mobile emulado), espera por rede ociosa.
 */

const CAPTURE_TIMEOUT_MS = 45000;
const NETWORK_IDLE_MS = 2000;
const MAX_RESOURCE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 350 * 1024 * 1024;

const FRONTEND_ASSET_RE = /\.(?:m?js|css|wasm|riv|lottie|glb|gltf|bin|ktx2?|basis|hdr|exr|dds|tga|obj|fbx|mtl|ply|stl|dae|meshopt|png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mov|m4v|ogv|mp3|ogg|wav|aac)$/i;
const SENSITIVE_ENDPOINT_RE = /\/(?:api|graphql|rpc|auth|account|checkout|payments?|sessions?|users?)(?:\/|$)/i;

function normalizedUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return url || '';
  }
}

function shouldCapture(meta) {
  if (!meta || !/^https?:/i.test(meta.url || '')) return false;
  if (meta.status < 200 || meta.status >= 400) return false;
  if (meta.type === 'Document') return true;
  if (['Stylesheet', 'Script', 'Image', 'Media', 'Font', 'Manifest'].includes(meta.type)) return true;
  const mime = meta.mimeType || '';
  const url = (meta.url || '').split('?')[0].toLowerCase();
  if (/^(text\/css|text\/javascript|application\/(javascript|wasm)|image\/|font\/|video\/|audio\/)/.test(mime)) return true;
  if (FRONTEND_ASSET_RE.test(url)) return true;
  if (/\.json$/.test(url) && meta.type !== 'XHR' && !SENSITIVE_ENDPOINT_RE.test(url)) return true;
  return false;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {import('playwright').Page} page
 * @param {string} targetUrl
 * @param {{progress?: Function, primePage?: (page:any)=>Promise<void>}} opts
 */
export async function captureNetworkSession(page, targetUrl, { progress, primePage } = {}) {
  const session = await page.context().newCDPSession(page);
  const requestMeta = new Map();
  const requestAliases = new Map();
  const records = new Map();
  const capturingUrls = new Set();
  const pendingBodies = new Set();
  const warnings = [];
  const failed = [];
  let totalBytes = 0;
  let lastActivity = Date.now();
  let loadResolve = null;
  let nextLoadResolve = null;

  const storeBody = async (requestId, meta) => {
    if (!shouldCapture(meta) || records.has(meta.url) || capturingUrls.has(meta.url)) return;
    capturingUrls.add(meta.url);
    try {
      const body = await session.send('Network.getResponseBody', { requestId });
      const bytes = body.base64Encoded
        ? new Uint8Array(Buffer.from(body.body, 'base64'))
        : new Uint8Array(Buffer.from(body.body, 'utf8'));
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
      progress?.({
        phase: 'recording',
        message: `Registrando animações e recursos… ${records.size}`,
        count: records.size,
        bytes: totalBytes,
      });
    } catch (e) {
      warnings.push({ url: meta.url, reason: String((e && e.message) || e) });
    } finally {
      capturingUrls.delete(meta.url);
    }
  };

  session.on('Network.responseReceived', (params) => {
    lastActivity = Date.now();
    const r = params.response || {};
    const url = normalizedUrl(r.url);
    requestMeta.set(params.requestId, {
      requestId: params.requestId,
      url,
      mimeType: (r.mimeType || '').split(';')[0].toLowerCase(),
      status: r.status || 0,
      type: params.type || 'Other',
      aliases: requestAliases.get(params.requestId) || [],
    });
  });

  session.on('Network.requestWillBeSent', (params) => {
    lastActivity = Date.now();
    const url = normalizedUrl(params.request && params.request.url);
    if (!url) return;
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
  });

  session.on('Network.loadingFinished', (params) => {
    lastActivity = Date.now();
    const meta = requestMeta.get(params.requestId);
    if (!meta) return;
    const job = storeBody(params.requestId, meta).finally(() => pendingBodies.delete(job));
    pendingBodies.add(job);
  });

  session.on('Network.loadingFailed', (params) => {
    lastActivity = Date.now();
    const meta = requestMeta.get(params.requestId);
    const aliases = requestAliases.get(params.requestId) || [];
    const url = normalizedUrl((meta && meta.url) || aliases[aliases.length - 1] || '');
    const plainUrl = url.split('?')[0];
    const relevantJson = /\.json$/i.test(plainUrl) && (!meta || meta.type !== 'XHR') && !SENSITIVE_ENDPOINT_RE.test(plainUrl);
    if (url && (FRONTEND_ASSET_RE.test(plainUrl) || relevantJson)) {
      failed.push({
        url,
        reason: params.errorText || (params.blockedReason ? `bloqueado: ${params.blockedReason}` : 'falha de rede'),
      });
    }
  });

  session.on('Page.loadEventFired', () => {
    lastActivity = Date.now();
    if (loadResolve) { const r = loadResolve; loadResolve = null; r(); }
    if (nextLoadResolve) { const r = nextLoadResolve; nextLoadResolve = null; r(); }
  });

  try {
    await session.send('Network.enable', {
      maxTotalBufferSize: MAX_TOTAL_BYTES,
      maxResourceBufferSize: MAX_RESOURCE_BYTES,
      maxPostDataSize: 0,
    });
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    await session.send('Page.enable');

    progress?.({ phase: 'recording', message: 'Preparando a página para capturar as animações…' });

    // Navegação inicial (garante que page.url() já reflita http(s) real)
    // seguida de um reload via CDP com cache ignorado — é essa passagem,
    // com os listeners já anexados, que é efetivamente capturada.
    await page.goto(targetUrl, { waitUntil: 'commit', timeout: CAPTURE_TIMEOUT_MS }).catch(() => {});

    const loaded = new Promise((resolve) => { loadResolve = resolve; });
    const loadTimer = setTimeout(() => {
      if (loadResolve) { const r = loadResolve; loadResolve = null; r(); }
    }, CAPTURE_TIMEOUT_MS);
    await session.send('Page.reload', { ignoreCache: true });
    await loaded;
    clearTimeout(loadTimer);

    await delay(650);
    if (primePage) {
      try { await primePage(page); } catch (e) { warnings.push({ url: '', reason: `rolagem assistida: ${String((e && e.message) || e)}` }); }
    }

    const waitForNetworkIdle = async (maxMs = 20000, label = 'Finalizando a captura desktop') => {
      const idleDeadline = Date.now() + maxMs;
      let nextHeartbeat = 0;
      while (Date.now() < idleDeadline && Date.now() - lastActivity < NETWORK_IDLE_MS) {
        if (progress && Date.now() >= nextHeartbeat) {
          progress({ phase: 'recording', message: `${label}… ${records.size} recursos`, count: records.size, bytes: totalBytes });
          nextHeartbeat = Date.now() + 1200;
        }
        await delay(180);
      }
      await Promise.allSettled(Array.from(pendingBodies));
    };
    await waitForNetworkIdle();

    // Segunda passagem em viewport móvel — mesmo racional do original:
    // breakpoints diferentes podem carregar imagens/modelos/Rive distintos.
    try {
      progress?.({ phase: 'recording', message: 'Capturando também os recursos da versão móvel…', count: records.size, bytes: totalBytes });
      await session.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      lastActivity = Date.now();
      const nextLoaded = new Promise((resolve) => { nextLoadResolve = resolve; });
      await session.send('Page.reload', { ignoreCache: true });
      await Promise.race([nextLoaded, delay(CAPTURE_TIMEOUT_MS)]);
      await delay(650);
      if (primePage) await primePage(page);
      await waitForNetworkIdle(20000, 'Finalizando a captura móvel');
      await session.send('Emulation.clearDeviceMetricsOverride');
    } catch (e) {
      warnings.push({ url: '', reason: `passagem móvel: ${String((e && e.message) || e)}` });
      try { await session.send('Emulation.clearDeviceMetricsOverride'); } catch {}
    }
    await Promise.allSettled(Array.from(pendingBodies));
  } finally {
    await session.detach().catch(() => {});
  }

  const pageUrl = normalizedUrl(page.url());
  if (!/^https?:/i.test(pageUrl)) {
    throw new Error(`capture_invalid_final_url:${pageUrl || 'empty'}`);
  }
  let documentRecord = records.get(pageUrl);
  if (!documentRecord) {
    documentRecord = Array.from(records.values()).find((r) => r.type === 'Document') || null;
  }
  let documentHtml = '';
  if (documentRecord && documentRecord.bytes) {
    try { documentHtml = Buffer.from(documentRecord.bytes).toString('utf8'); } catch {}
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

/** Equivalente a primePageViaAttachedDebugger (cdp-bridge.js), via page.evaluate. */
export async function primePage(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      const vh = window.innerHeight || 800;
      const fullH = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0
      );
      if (fullH > vh * 1.15) {
        const step = Math.max(vh * 0.85, 400);
        const max = Math.min(fullH, vh * 50);
        for (let y = 0; y < max; y += step) {
          window.scrollTo(0, y);
          await sleep(110);
        }
        window.scrollTo(0, 0);
        await sleep(220);
      }
      document.querySelectorAll('video').forEach((video) => {
        try { video.preload = 'auto'; if (video.load) video.load(); } catch {}
      });
      await sleep(150);
    } catch {}
  });
}
