#!/usr/bin/env node
/**
 * clone.mjs — engine standalone do DevClone (Node + Playwright).
 *
 * Modo 1 (--mode full, default): clone completo, comportamento original —
 * porta runClone() (background.js da extensão) sem nenhuma alteração de
 * lógica: mesma captura de rede via CDP/Playwright, mesma coleta/reescrita
 * de DOM, mesma resolução recursiva de CSS/JS, os mesmos relatórios e o
 * mesmo empacotador ZIP.
 *
 * Modo 2 (--mode harness): NÃO clona o site. Extrai o DNA visual/interativo
 * (design-system.mjs + animation-extract.mjs) e monta um Visual Harness
 * funcional (harness-build.mjs) — ver seção "Modo 2" no SKILL.md.
 *
 * Uso:
 *   node clone.mjs <url> [opções]
 *
 * Opções:
 *   --mode full|harness        (default: full)
 *   --scope page|site          (default: page)
 *   --depth 1-3                (default: 2, só com --scope site)
 *   --ai-context / --no-ai-context   (default: ativado, só --mode full)
 *   --mobile-pass / --no-mobile-pass (default: ativado)
 *   --headless / --headed      (default: headless)
 *   --out <arquivo.zip>        (default: devclone_<host>_<data>.zip no cwd)
 *   --cookies <arquivo.json>   (opcional: cookies do Playwright p/ sessão logada)
 *   --timeout <ms>             (default: 60000, navegação inicial)
 */
import { chromium } from 'playwright';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { captureNetworkSession, primePage } from './lib/capture-cdp.mjs';
import { callBridge } from './lib/page-bridge.mjs';
import { detectStack } from './lib/stack.mjs';
import {
  newState, sanitizeSegment, fetchAsset, registerFileText, replaceFileText,
  registerFile, registerNetworkRecords, registerNetworkRecordsForHarness,
  processCss, processCssForHarness, processJsModule,
  rewriteKnownJsAssets, guessKind, crawlSameOrigin, pageFileName,
  rewriteRawHtml, animationDependencyGaps, absUrl,
} from './lib/asset-pipeline.mjs';
import { buildReadme, buildFailureReport, buildAnimationValidation, buildAiContext, injectFileProtocolNotice } from './lib/reports.mjs';
import { getPreviewPackageFiles } from './lib/preview-files.mjs';
import { buildZip } from './lib/zip.mjs';
import { extractDesignTokens, buildDesignSystemDoc } from './lib/design-system.mjs';
import { extractAnimationCode, buildAnimationFiles, buildAnimationDoc } from './lib/animation-extract.mjs';
import { buildHarnessProject, buildHarnessReadme } from './lib/harness-build.mjs';

function log(...args) { process.stderr.write(args.join(' ') + '\n'); }

function makeProgress() {
  let last = 0;
  return (p) => {
    const now = Date.now();
    if (now - last < 400 && p.phase !== 'zipping') return;
    last = now;
    const bits = [p.phase, p.message].filter(Boolean);
    if (typeof p.count === 'number') bits.push(`(${p.count} arquivos)`);
    log('•', bits.join(' '));
  };
}

function friendlyCloneError(err) {
  const raw = String((err && err.message) || err || '');
  const r = raw.toLowerCase();
  if (r.includes('cdp_bridge') || r.includes('cdp_collect_failed') || r.includes('content_bridge_unavailable')) {
    return 'O motor interno de captura não conseguiu ler a página. Tente novamente; se persistir, confira se a URL está acessível publicamente.';
  }
  if (r.includes('capture_empty_document') || r.includes('capture_invalid_final_url')) {
    return 'Não foi possível carregar a página de origem (documento vazio ou URL final inválida).';
  }
  if (r.includes('timeout')) {
    return 'A página demorou demais para responder. Tente novamente ou aumente --timeout.';
  }
  return raw || 'Não foi possível concluir o clone.';
}

// =========================================================================
// MODO 1 — Clone completo (comportamento original, sem alterações)
// =========================================================================
async function runClone(url, opts) {
  const state = newState();
  const progress = makeProgress();
  const browser = await chromium.launch({ headless: opts.headless });
  const context = await browser.newContext(
    opts.cookies ? {} : undefined
  );
  if (opts.cookies) {
    const cookies = JSON.parse(await readFile(opts.cookies, 'utf8'));
    await context.addCookies(cookies);
  }
  const page = await context.newPage();

  try {
    let originalHtml = '';
    let capturedPageUrl = '';
    let networkRecords = [];

    progress({ phase: 'recording', message: 'Preparando captura avançada das animações…' });
    try {
      const captured = await captureNetworkSession(page, url, {
        progress,
        primePage: opts.mobilePass === false ? undefined : primePage,
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
      state.captureMode = 'compatibility';
      state.captureWarnings.push({ url: '', reason: `captura avançada indisponível: ${String((e && e.message) || e)}` });
      // fallback: navegação simples, sem CDP
      await page.goto(url, { waitUntil: 'load', timeout: opts.timeout }).catch(() => {});
    }

    progress({ phase: 'scanning', message: 'Analisando estrutura e componentes…' });
    const collectResp = await callBridge(page, {
      action: 'collect',
      options: { prime: state.captureMode === 'compatibility' },
    });
    if (!collectResp || !collectResp.ok) {
      throw new Error(`collect_failed: ${collectResp && collectResp.error ? collectResp.error : 'sem resposta'}`);
    }
    const { assets, meta } = collectResp.data;
    const pageUrl = capturedPageUrl || collectResp.data.pageUrl || url;

    meta.stack = await detectStack(page).catch(() => []);
    state.stack = meta.stack;

    let done = 0;
    const cssToProcess = [];
    const jsToProcess = [];
    registerNetworkRecords(networkRecords, state, cssToProcess, jsToProcess);

    const totalAssets = assets.length;
    for (const { url: assetUrl, kind } of assets) {
      if (state.fetched.has(assetUrl) || state.pathMap[assetUrl]) { done++; continue; }
      state.fetched.add(assetUrl);
      progress({
        phase: 'downloading',
        message: `Completando arquivos… ${done + 1} de ${totalAssets}`,
        count: state.files.length,
        bytes: state.bytes,
      });
      try {
        const { buf, contentType } = await fetchAsset(assetUrl);
        const realKind = (kind === 'asset') ? guessKind(contentType, assetUrl) : kind;
        if (realKind === 'css' || contentType === 'text/css') {
          const p = registerFileText(assetUrl, 'css', buf, state);
          cssToProcess.push({ url: assetUrl, path: p, text: Buffer.from(buf).toString('utf8') });
        } else if (realKind === 'js' || /javascript|ecmascript/.test(contentType) || /\.m?js$/i.test(assetUrl)) {
          const p = registerFileText(assetUrl, 'js', buf, state);
          jsToProcess.push({ url: assetUrl, path: p, text: Buffer.from(buf).toString('utf8') });
        } else {
          registerFile(assetUrl, realKind, buf, contentType, state);
        }
      } catch (e) {
        state.errors.push({ url: assetUrl, reason: String((e && e.message) || e) });
      }
      done++;
    }

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

    progress({ phase: 'processing', message: 'Montando HTML limpo…', count: state.files.length, bytes: state.bytes });
    const rewriteResp = await callBridge(page, {
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

    if (opts.scope === 'site') {
      progress({ phase: 'crawling', message: 'Explorando o site…', count: state.files.length, bytes: state.bytes });
      const pages = await crawlSameOrigin(pageUrl, Math.max(1, Math.min(3, opts.depth || 1)), state,
        () => progress({ phase: 'crawling', message: 'Explorando páginas…', count: state.files.length, bytes: state.bytes }));

      for (const pg of pages) {
        const fileName = pageFileName(pg.url, pageUrl, state);
        if (fileName === null) continue;
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
              const rw = await processCss(Buffer.from(buf).toString('utf8'), a, p, state);
              replaceFileText(p, rw, state);
            } else {
              registerFile(a, guessKind(contentType, a), buf, contentType, state);
            }
          } catch (e) {
            state.errors.push({ url: a, reason: String((e && e.message) || e) });
          }
        }
        const rewritten = rewriteRawHtml(pg.html, pg.url, state, fileName);
        state.files.push({ name: fileName, data: new TextEncoder().encode(rewritten) });
      }
    }

    state.validation.dependencyGaps = animationDependencyGaps(state);
    state.files.push(...getPreviewPackageFiles());
    state.files.push({ name: 'README.md', data: new TextEncoder().encode(buildReadme(pageUrl, state, opts)) });
    state.files.push({ name: 'RELATORIO-DE-CAPTURA.txt', data: new TextEncoder().encode(buildFailureReport(pageUrl, state)) });
    state.files.push({ name: 'VALIDACAO-DE-ANIMACOES.txt', data: new TextEncoder().encode(buildAnimationValidation(pageUrl, state)) });
    if (opts.aiContext) {
      state.files.push({ name: 'AI_CONTEXT.md', data: new TextEncoder().encode(buildAiContext(meta, pageUrl)) });
    }

    progress({ phase: 'zipping', message: 'Finalizando o pacote…', count: state.files.length, bytes: state.bytes });
    const zipBytes = await buildZip(state.files);

    const host = (() => { try { return new URL(pageUrl).hostname.replace(/^www\./, ''); } catch { return 'site'; } })();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = opts.out || `devclone_${sanitizeSegment(host)}_${stamp}.zip`;
    await writeFile(filename, zipBytes);

    return {
      mode: 'full',
      outputPath: path.resolve(filename),
      fileCount: state.files.length,
      bytes: state.bytes,
      zipBytes: zipBytes.length,
      errors: state.errors,
      captureMode: state.captureMode,
      remainingRemote: state.validation ? state.validation.remainingRemote.length : 0,
      stack: state.stack,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

// =========================================================================
// MODO 2 — Visual Harness (DNA visual/interativo, NÃO clona o site)
// =========================================================================
async function runHarnessClone(url, opts) {
  const state = newState();
  const progress = makeProgress();
  const browser = await chromium.launch({ headless: opts.headless });
  const context = await browser.newContext(
    opts.cookies ? {} : undefined
  );
  if (opts.cookies) {
    const cookies = JSON.parse(await readFile(opts.cookies, 'utf8'));
    await context.addCookies(cookies);
  }
  const page = await context.newPage();

  try {
    let networkRecords = [];

    progress({ phase: 'recording', message: 'Capturando CSS/JS para extrair o DNA visual…' });
    try {
      const captured = await captureNetworkSession(page, url, {
        progress,
        primePage: opts.mobilePass === false ? undefined : primePage,
      });
      networkRecords = captured.records || [];
      state.captureMode = 'network-original';
      state.captureWarnings = captured.warnings || [];
    } catch (e) {
      state.captureMode = 'compatibility';
      state.captureWarnings.push({ url: '', reason: `captura avançada indisponível: ${String((e && e.message) || e)}` });
      await page.goto(url, { waitUntil: 'load', timeout: opts.timeout }).catch(() => {});
    }

    // Modo 2 só registra CSS/JS — nenhuma imagem, vídeo, fonte ou página é
    // baixada (ver ff0178d7: "não baixar HTML completo, todas as páginas,
    // conteúdo textual completo, imagens, vídeos, estrutura completa").
    const cssToProcess = [];
    const jsToProcess = [];
    registerNetworkRecordsForHarness(networkRecords, state, cssToProcess, jsToProcess);

    progress({ phase: 'scanning', message: 'Detectando stack e resolvendo CSS importado…' });
    const meta = { stack: await detectStack(page).catch(() => []) };
    state.stack = meta.stack;

    // Segue @import em CSS same-origin/acessível para não perder @keyframes
    // definidos em folhas importadas — sem baixar url() de imagem/fonte.
    for (const css of cssToProcess) {
      await processCssForHarness(css.text, css.url, state, (discoveredUrl, discoveredText) => {
        cssToProcess.push({ url: discoveredUrl, path: `css/_imported_${cssToProcess.length}.css`, text: discoveredText });
      });
    }

    progress({ phase: 'extracting', message: 'Extraindo tokens de design (cores, tipografia, espaçamento)…' });
    const tokens = await extractDesignTokens(page);

    progress({ phase: 'extracting', message: 'Extraindo animações e interações reais…' });
    // Usa o texto já capturado (não os arquivos no zip — no Modo 2 o CSS/JS
    // bruto normalmente não entra no pacote, só o que for extraído dele).
    const virtualFiles = [
      ...cssToProcess.map((c) => ({ name: c.path.endsWith('.css') ? c.path : `${c.path}.css`, data: new TextEncoder().encode(c.text) })),
      ...jsToProcess.map((j) => ({ name: j.path.endsWith('.js') ? j.path : `${j.path}.js`, data: new TextEncoder().encode(j.text) })),
    ];
    const extraction = extractAnimationCode(virtualFiles);

    progress({ phase: 'building', message: 'Montando o Visual Harness…' });
    const harnessFiles = buildHarnessProject(tokens, extraction, meta, url);
    const animationFiles = buildAnimationFiles(extraction);

    const finalFiles = [];
    finalFiles.push({ name: 'DESIGN-SYSTEM.md', data: new TextEncoder().encode(buildDesignSystemDoc(tokens, meta, url)) });
    finalFiles.push({ name: 'ANIMACOES.md', data: new TextEncoder().encode(buildAnimationDoc(extraction, url)) });
    finalFiles.push({ name: 'README.md', data: new TextEncoder().encode(buildHarnessReadme(meta, url, extraction)) });
    finalFiles.push(...animationFiles);
    finalFiles.push(...harnessFiles);
    finalFiles.push(...getPreviewPackageFiles().map((f) => {
      // Os launchers/servidor local do Modo 1 servem qualquer pasta com
      // index.html — no Modo 2 o index.html fica em harness/, então os
      // launchers precisam apontar para lá.
      if (f.name === 'servidor-local.js') {
        const text = new TextDecoder().decode(f.data).replace(
          "const ROOT = path.resolve(__dirname);",
          "const ROOT = path.resolve(__dirname, 'harness');"
        );
        return { name: f.name, data: new TextEncoder().encode(text) };
      }
      return f;
    }));

    let totalBytes = 0;
    for (const f of finalFiles) totalBytes += f.data.length;

    progress({ phase: 'zipping', message: 'Finalizando o pacote do harness…' });
    const zipBytes = await buildZip(finalFiles);

    const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'site'; } })();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = opts.out || `devclone_harness_${sanitizeSegment(host)}_${stamp}.zip`;
    await writeFile(filename, zipBytes);

    return {
      mode: 'harness',
      outputPath: path.resolve(filename),
      fileCount: finalFiles.length,
      bytes: totalBytes,
      zipBytes: zipBytes.length,
      errors: state.errors,
      captureMode: state.captureMode,
      stack: state.stack,
      animationsFound: {
        keyframes: extraction.keyframesFound.length,
        transitionRules: extraction.transitionRulesFound.length,
        jsSnippets: extraction.jsSnippetsFound.length,
        libraries: extraction.libsDetected,
      },
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      mode: { type: 'string', default: 'full' },
      scope: { type: 'string', default: 'page' },
      depth: { type: 'string', default: '2' },
      'ai-context': { type: 'boolean', default: true },
      'no-ai-context': { type: 'boolean', default: false },
      'mobile-pass': { type: 'boolean', default: true },
      'no-mobile-pass': { type: 'boolean', default: false },
      headless: { type: 'boolean', default: true },
      headed: { type: 'boolean', default: false },
      out: { type: 'string' },
      cookies: { type: 'string' },
      timeout: { type: 'string', default: '60000' },
    },
  });
  const url = positionals[0];
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('Uso: node clone.mjs <url http(s)> [--mode full|harness] [--scope page|site] [--depth 1-3] [--no-ai-context] [--headed] [--out arquivo.zip] [--cookies arquivo.json]');
  }
  const mode = values.mode === 'harness' ? 'harness' : 'full';
  return {
    url,
    mode,
    scope: values.scope === 'site' ? 'site' : 'page',
    depth: Math.max(1, Math.min(3, Number(values.depth) || 2)),
    aiContext: values['no-ai-context'] ? false : values['ai-context'] !== false,
    mobilePass: values['no-mobile-pass'] ? false : values['mobile-pass'] !== false,
    headless: values.headed ? false : values.headless !== false,
    out: values.out,
    cookies: values.cookies,
    timeout: Number(values.timeout) || 60000,
  };
}

async function main() {
  let opts;
  try {
    opts = parseCli(process.argv.slice(2));
  } catch (e) {
    log(String((e && e.message) || e));
    process.exit(2);
  }

  const modeLabel = opts.mode === 'harness' ? 'Visual Harness (Modo 2 — DNA visual, sem clonar o site)' : `clone completo (Modo 1${opts.scope === 'site' ? `, escopo site, profundidade ${opts.depth}` : ''})`;
  log(`DevClone engine — ${opts.url} — ${modeLabel}`);
  try {
    const result = opts.mode === 'harness' ? await runHarnessClone(opts.url, opts) : await runClone(opts.url, opts);
    log('');
    if (result.mode === 'harness') {
      log(`OK — harness com ${result.fileCount} arquivos, ${(result.bytes / 1024).toFixed(0)} KB.`);
      log(`Animações extraídas: ${result.animationsFound.keyframes} keyframes, ${result.animationsFound.transitionRules} regras de transition/transform, ${result.animationsFound.jsSnippets} trechos de JS.`);
      if (result.animationsFound.libraries.length) log(`Bibliotecas detectadas: ${result.animationsFound.libraries.join(', ')}`);
    } else {
      log(`OK — ${result.fileCount} arquivos, ${(result.bytes / 1024).toFixed(0)} KB, modo: ${result.captureMode}`);
      if (result.errors.length) log(`${result.errors.length} asset(s) falharam — ver RELATORIO-DE-CAPTURA.txt dentro do zip.`);
      if (result.remainingRemote) log(`${result.remainingRemote} referência(s) ainda remotas — ver VALIDACAO-DE-ANIMACOES.txt.`);
    }
    if (result.stack && result.stack.length) log(`Stack detectada: ${result.stack.join(', ')}`);
    log(`Arquivo: ${result.outputPath}`);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    log('');
    log('ERRO: ' + friendlyCloneError(e));
    process.exitCode = 1;
  }
}

main();
