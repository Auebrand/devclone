/**
 * harness-build.mjs — NOVO módulo (Modo 2 / Harness).
 *
 * Constrói o VISUAL HARNESS: um pequeno projeto HTML/CSS/JS funcional que
 * demonstra ao vivo, no navegador, os tokens extraídos (paleta, tipografia,
 * espaçamento, radius, sombras), os componentes (botões com estados reais,
 * inputs, cards, navegação) e as animações/interações reais extraídas por
 * animation-extract.mjs. NÃO é um clone do site — é um laboratório de
 * referência visual, gerado a partir do DESIGN-SYSTEM.md.
 */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pickPrimary(tokens) {
  const roleP = tokens.roleHints?.primary?.[0];
  if (roleP) return roleP;
  return tokens.palette?.[0]?.value || '#3b82f6';
}
function pickSecondary(tokens) {
  const roleS = tokens.roleHints?.secondary?.[0];
  if (roleS) return roleS;
  return tokens.palette?.[1]?.value || '#6b7280';
}
function pickNeutralBg(tokens) {
  const bodyColor = tokens.typeScale?.find((t) => t.selector === 'body');
  return tokens.palette?.find((p) => /^rgb\(2[0-5][0-9]|^rgb\(255|^#f|^white/i.test(p.value))?.value || '#ffffff';
}
function pickTextColor(tokens) {
  return tokens.palette?.find((p) => /rgb\(([0-4][0-9]|[0-9]),/.test(p.value))?.value || '#111111';
}

function firstKeyframeNames(keyframesFound) {
  const names = [];
  for (const k of keyframesFound || []) {
    const m = /@(?:-webkit-|-moz-)?keyframes\s+([\w-]+)/.exec(k.code);
    if (m && !names.includes(m[1])) names.push(m[1]);
    if (names.length >= 2) break;
  }
  return names;
}

export function buildHarnessProject(tokens, extraction, meta, startUrl) {
  const encoder = new TextEncoder();
  const primary = pickPrimary(tokens);
  const secondary = pickSecondary(tokens);
  const bg = pickNeutralBg(tokens);
  const text = pickTextColor(tokens);
  const fontFamily = (tokens.fontFamilies && tokens.fontFamilies[0]) || 'system-ui, sans-serif';
  const radius = tokens.radii?.[0]?.value || '8px';
  const shadow = tokens.shadows?.[0]?.value || '0 4px 16px rgba(0,0,0,.12)';
  const spacingScale = (tokens.spacingScale && tokens.spacingScale.length ? tokens.spacingScale : [{ px: 4 }, { px: 8 }, { px: 12 }, { px: 16 }, { px: 24 }, { px: 32 }, { px: 48 }]);
  const kfNames = firstKeyframeNames(extraction?.keyframesFound);
  const hasAnimFiles = !!(extraction && (extraction.keyframesFound.length || extraction.transitionRulesFound.length));

  // ---------------------------------------------------------------- CSS
  const cssLines = [];
  cssLines.push('/* harness/harness.css — gerado a partir dos tokens extraídos (DESIGN-SYSTEM.md) */');
  cssLines.push(':root {');
  cssLines.push(`  --color-primary: ${primary};`);
  cssLines.push(`  --color-secondary: ${secondary};`);
  cssLines.push(`  --color-bg: ${bg};`);
  cssLines.push(`  --color-text: ${text};`);
  cssLines.push(`  --font-family: ${fontFamily};`);
  cssLines.push(`  --radius: ${radius};`);
  cssLines.push(`  --shadow: ${shadow};`);
  spacingScale.forEach((s, i) => cssLines.push(`  --space-${i + 1}: ${s.px}px;`));
  cssLines.push('}');
  cssLines.push('');
  cssLines.push('* { box-sizing: border-box; }');
  cssLines.push('body { margin: 0; font-family: var(--font-family); background: var(--color-bg); color: var(--color-text); line-height: 1.5; }');
  cssLines.push('.harness-header { padding: var(--space-4) var(--space-5); border-bottom: 1px solid rgba(0,0,0,.08); position: sticky; top: 0; background: var(--color-bg); z-index: 10; }');
  cssLines.push('.harness-header h1 { margin: 0 0 4px; font-size: 20px; }');
  cssLines.push('.harness-header p { margin: 0; opacity: .65; font-size: 13px; }');
  cssLines.push('.section { padding: var(--space-5); max-width: 1040px; margin: 0 auto; }');
  cssLines.push('.section h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; opacity: .55; margin: 0 0 var(--space-3); }');
  cssLines.push('.swatches { display: flex; flex-wrap: wrap; gap: var(--space-3); }');
  cssLines.push('.swatch { width: 96px; }');
  cssLines.push('.swatch-color { height: 56px; border-radius: var(--radius); box-shadow: var(--shadow); border: 1px solid rgba(0,0,0,.06); }');
  cssLines.push('.swatch code { display: block; font-size: 11px; margin-top: 4px; word-break: break-all; opacity: .7; }');
  cssLines.push('.type-row { display: flex; align-items: baseline; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px dashed rgba(0,0,0,.08); }');
  cssLines.push('.type-row .tag { font-size: 11px; opacity: .5; width: 60px; flex: none; }');
  cssLines.push('.btn { display: inline-flex; align-items: center; justify-content: center; border-radius: var(--radius); padding: 10px 20px; font-family: inherit; font-size: 14px; font-weight: 600; border: 1px solid transparent; cursor: pointer; transition: background .18s ease, transform .12s ease, box-shadow .18s ease; }');
  cssLines.push('.btn--primary { background: var(--color-primary); color: #fff; }');
  cssLines.push('.btn--primary:hover { filter: brightness(0.92); transform: translateY(-1px); box-shadow: var(--shadow); }');
  cssLines.push('.btn--secondary { background: transparent; color: var(--color-secondary); border-color: var(--color-secondary); }');
  cssLines.push('.btn--secondary:hover { background: var(--color-secondary); color: #fff; }');
  cssLines.push('.btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }');
  cssLines.push('.row { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }');
  cssLines.push('.field { display: flex; flex-direction: column; gap: 6px; max-width: 280px; }');
  cssLines.push('.field label { font-size: 12px; opacity: .65; }');
  cssLines.push('.field input, .field textarea, .field select { font-family: inherit; font-size: 14px; padding: 10px 12px; border-radius: var(--radius); border: 1px solid rgba(0,0,0,.18); background: #fff; color: var(--color-text); transition: border-color .15s ease, box-shadow .15s ease; }');
  cssLines.push('.field input:focus, .field textarea:focus, .field select:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 25%, transparent); }');
  cssLines.push('.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); }');
  cssLines.push('.card { border-radius: var(--radius); box-shadow: var(--shadow); padding: var(--space-4); background: #fff; }');
  cssLines.push('.card h3 { margin: 0 0 6px; font-size: 15px; }');
  cssLines.push('.card p { margin: 0; font-size: 13px; opacity: .7; }');
  cssLines.push('.nav-demo { display: flex; gap: var(--space-4); padding: var(--space-3) var(--space-4); border-radius: var(--radius); background: rgba(0,0,0,.03); }');
  cssLines.push('.nav-demo a { color: var(--color-text); text-decoration: none; font-size: 14px; font-weight: 500; }');
  cssLines.push('.nav-demo a:hover { color: var(--color-primary); }');
  cssLines.push('.demo-reveal { opacity: 0; transform: translateY(16px); transition: opacity .5s ease, transform .5s ease; }');
  cssLines.push('.demo-reveal.is-visible { opacity: 1; transform: translateY(0); }');
  if (kfNames.length) {
    cssLines.push('.demo-reveal.is-visible.use-keyframe { animation-name: ' + kfNames[0] + '; animation-duration: .7s; animation-fill-mode: both; }');
  }
  cssLines.push('.token-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: var(--space-2); font-size: 13px; }');
  cssLines.push('.token-list .chip { background: rgba(0,0,0,.04); border-radius: 6px; padding: 6px 10px; }');
  cssLines.push('.harness-footer { padding: var(--space-5); text-align: center; font-size: 12px; opacity: .5; }');

  // ---------------------------------------------------------------- HTML
  const paletteSwatches = (tokens.palette || []).slice(0, 12).map((c) => `
      <div class="swatch">
        <div class="swatch-color" style="background:${esc(c.value)}"></div>
        <code>${esc(c.value)}</code>
      </div>`).join('');

  const typeRows = (tokens.typeScale || []).map((t) => `
      <div class="type-row">
        <span class="tag">${esc(t.selector)}</span>
        <${t.selector === 'p' || t.selector === 'blockquote' || t.selector === 'small' ? 'span' : esc(t.selector)} style="font-size:${esc(t.fontSize)};font-weight:${esc(t.fontWeight)};line-height:${esc(t.lineHeight)};letter-spacing:${esc(t.letterSpacing)};text-transform:${esc(t.textTransform)};margin:0;">
          Texto de exemplo — ${esc(t.selector)}
        </${t.selector === 'p' || t.selector === 'blockquote' || t.selector === 'small' ? 'span' : esc(t.selector)}>
      </div>`).join('');

  const spacingChips = spacingScale.map((s, i) => `<span class="chip">--space-${i + 1}: ${s.px}px</span>`).join('\n        ');
  const radiusChips = (tokens.radii || []).map((r) => `<span class="chip">${esc(r.value)}</span>`).join('\n        ');
  const shadowChips = (tokens.shadows || []).map((s) => `<span class="chip">${esc(s.value)}</span>`).join('\n        ');

  const cardsHtml = (tokens.cardTokens && tokens.cardTokens.length ? tokens.cardTokens : [{ selector: 'card genérico' }, { selector: 'card genérico' }]).slice(0, 3).map((c, i) => `
      <div class="card demo-reveal">
        <h3>Card ${i + 1}</h3>
        <p>Componente de referência (${esc(c.selector || 'card')}) usando radius, sombra e espaçamento extraídos.</p>
      </div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DevClone — Visual Harness</title>
<link rel="stylesheet" href="harness.css" />
${hasAnimFiles ? '<link rel="stylesheet" href="../animations/keyframes.css" />\n<link rel="stylesheet" href="../animations/transitions.css" />' : ''}
</head>
<body>
  <header class="harness-header">
    <h1>DevClone · Visual Harness (Modo 2)</h1>
    <p>DNA visual extraído de ${esc(startUrl)} — laboratório de referência, não é o site clonado. Ver <code>DESIGN-SYSTEM.md</code>.</p>
  </header>

  <section class="section">
    <h2>Paleta de cores</h2>
    <div class="swatches">${paletteSwatches || '<p>Nenhuma cor dominante identificada.</p>'}</div>
  </section>

  <section class="section">
    <h2>Tipografia</h2>
    <div>${typeRows || '<p>Nenhuma escala tipográfica identificada.</p>'}</div>
  </section>

  <section class="section">
    <h2>Espaçamento</h2>
    <div class="token-list">
        ${spacingChips}
    </div>
  </section>

  <section class="section">
    <h2>Border-radius e sombras</h2>
    <div class="token-list">
        ${radiusChips}
        ${shadowChips}
    </div>
  </section>

  <section class="section">
    <h2>Botões</h2>
    <div class="row">
      <button class="btn btn--primary">Botão primário</button>
      <button class="btn btn--secondary">Botão secundário</button>
      <button class="btn btn--primary" disabled style="opacity:.5;cursor:not-allowed;">Desabilitado</button>
    </div>
  </section>

  <section class="section">
    <h2>Inputs</h2>
    <div class="row">
      <div class="field">
        <label for="h-name">Nome</label>
        <input id="h-name" type="text" placeholder="Digite algo…" />
      </div>
      <div class="field">
        <label for="h-select">Seleção</label>
        <select id="h-select"><option>Opção 1</option><option>Opção 2</option></select>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Cards</h2>
    <div class="cards">${cardsHtml}</div>
  </section>

  <section class="section">
    <h2>Navegação</h2>
    <nav class="nav-demo">
      <a href="#">Início</a>
      <a href="#">Produto</a>
      <a href="#">Sobre</a>
      <a href="#">Contato</a>
    </nav>
  </section>

  <section class="section">
    <h2>Animações/interações reais${hasAnimFiles ? '' : ' (nenhuma extraída)'}</h2>
    <div class="cards">
      <div class="card demo-reveal${kfNames.length ? ' use-keyframe' : ''}">
        <h3>Reveal ao rolar</h3>
        <p>${kfNames.length ? `Usa o @keyframes real \`${esc(kfNames[0])}\` extraído do site original.` : 'Nenhum @keyframes extraído — transição genérica de fade/translate aplicada via IntersectionObserver.'}</p>
      </div>
      <div class="card demo-reveal">
        <h3>Fade + translate</h3>
        <p>Reveal com transition (opacity/transform) ao entrar na viewport.</p>
      </div>
    </div>
  </section>

  <footer class="harness-footer">Gerado por DevClone (Modo 2 · Visual Harness) — laboratório de referência, não é o site original.</footer>

  <script src="harness.js"></script>
</body>
</html>
`;

  // ---------------------------------------------------------------- JS
  const jsLines = [];
  jsLines.push("'use strict';");
  jsLines.push('// harness/harness.js — interações do laboratório visual (reveal ao rolar,');
  jsLines.push('// clique-para-copiar nos tokens). Não depende de bibliotecas externas.');
  jsLines.push('(function () {');
  jsLines.push('  var els = document.querySelectorAll(".demo-reveal");');
  jsLines.push('  if ("IntersectionObserver" in window) {');
  jsLines.push('    var io = new IntersectionObserver(function (entries) {');
  jsLines.push('      entries.forEach(function (entry) {');
  jsLines.push('        if (entry.isIntersecting) entry.target.classList.add("is-visible");');
  jsLines.push('      });');
  jsLines.push('    }, { threshold: 0.2 });');
  jsLines.push('    els.forEach(function (el) { io.observe(el); });');
  jsLines.push('  } else {');
  jsLines.push('    els.forEach(function (el) { el.classList.add("is-visible"); });');
  jsLines.push('  }');
  jsLines.push('  document.querySelectorAll(".swatch code, .chip").forEach(function (el) {');
  jsLines.push('    el.style.cursor = "pointer";');
  jsLines.push('    el.title = "Clique para copiar";');
  jsLines.push('    el.addEventListener("click", function () {');
  jsLines.push('      var text = el.textContent.trim();');
  jsLines.push('      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});');
  jsLines.push('      var prev = el.textContent;');
  jsLines.push('      el.textContent = "copiado!";');
  jsLines.push('      setTimeout(function () { el.textContent = prev; }, 900);');
  jsLines.push('    });');
  jsLines.push('  });');
  jsLines.push('})();');

  return [
    { name: 'harness/index.html', data: encoder.encode(html) },
    { name: 'harness/harness.css', data: encoder.encode(cssLines.join('\n')) },
    { name: 'harness/harness.js', data: encoder.encode(jsLines.join('\n')) },
  ];
}

export function buildHarnessReadme(meta, startUrl, extraction) {
  const L = [];
  L.push('# DevClone — Modo 2 · Visual Harness (DNA visual)');
  L.push('');
  L.push(`- **Origem:** ${startUrl}`);
  L.push(`- **Gerado em:** ${new Date().toISOString()}`);
  L.push('');
  L.push('## O que é este pacote');
  L.push('');
  L.push('Este pacote NÃO é um clone do site. Ele contém o **sistema visual e');
  L.push('interativo** extraído do site de origem, para servir de base a um novo');
  L.push('projeto — sem carregar o conteúdo, as páginas ou os textos originais.');
  L.push('');
  L.push('## Estrutura');
  L.push('```');
  L.push('/DESIGN-SYSTEM.md      documentação técnica com valores concretos (cores,');
  L.push('                       tipografia, espaçamento, radius, sombras, botões,');
  L.push('                       inputs, cards, navegação, grid, breakpoints)');
  L.push('/ANIMACOES.md          sumário das animações/interações reais extraídas');
  L.push('/animations/           código real: keyframes.css, transitions.css, interactions.js');
  L.push('/harness/              laboratório visual navegável (abra ABRIR-SITE.cmd/.command)');
  L.push('```');
  L.push('');
  L.push('## Como usar');
  L.push('1. Extraia o ZIP e abra `ABRIR-SITE.cmd` (Windows) ou `ABRIR-SITE.command` (macOS).');
  L.push('   O harness abre automaticamente no navegador via servidor local.');
  L.push('2. Leia `DESIGN-SYSTEM.md` para os valores concretos do sistema visual.');
  L.push('3. Leia `ANIMACOES.md` e use os arquivos em `animations/` para reaproveitar');
  L.push('   as animações/interações reais em um novo projeto.');
  L.push('4. Para reconstruir um SITE NOVO com essa identidade, anexe este .zip numa');
  L.push('   IA (Claude, ChatGPT, Cursor etc.) e peça para seguir o `DESIGN-SYSTEM.md`');
  L.push('   como guia de estilo — não peça para "recriar o site", pois o conteúdo');
  L.push('   original não está neste pacote.');
  L.push('');
  return L.join('\n');
}
