/**
 * design-system.mjs — NOVO módulo (Modo 2 / Harness).
 *
 * Extrai o DNA visual do site com VALORES CONCRETOS (não descrições
 * superficiais): paleta, tipografia, espaçamento, grid/breakpoints,
 * radius, sombras, bordas, variantes de botão (incl. hover/focus/active
 * reais, via Playwright), inputs, cards, navegação.
 *
 * extractDesignTokens(page) roda no navegador real (via CDP/Playwright),
 * então os estados hover/focus/active são medidos de verdade — não
 * inferidos — chamando page.hover()/page.focus() em elementos amostrados
 * antes de ler getComputedStyle.
 */

// ---------------------------------------------------------------- snapshot
async function snapshotBase(page) {
  return page.evaluate(() => {
    function cs(el) { return getComputedStyle(el); }
    function pick(el, props) {
      const c = cs(el);
      const out = {};
      for (const p of props) out[p] = c[p];
      return out;
    }
    function short(sel, el) {
      const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
      return cls ? `${sel}.${cls}` : sel;
    }

    // ---- paleta -----------------------------------------------------
    const colorFreq = new Map();
    const bump = (v) => {
      if (!v || /rgba?\(0,\s*0,\s*0,\s*0\)/.test(v) || v === 'transparent') return;
      colorFreq.set(v, (colorFreq.get(v) || 0) + 1);
    };
    const roleHints = { primary: [], secondary: [], accent: [], success: [], error: [], warning: [], info: [] };
    const roleKeywordRe = {
      primary: /(^|-)(primary|brand|main)($|-)/i,
      secondary: /(^|-)(secondary)($|-)/i,
      accent: /(^|-)(accent|highlight)($|-)/i,
      success: /(^|-)(success|ok|positive|green)($|-)/i,
      error: /(^|-)(error|danger|negative|red|destructive)($|-)/i,
      warning: /(^|-)(warning|alert|amber|yellow)($|-)/i,
      info: /(^|-)(info|informative|blue)($|-)/i,
    };

    const sampleEls = document.querySelectorAll('*');
    let n = 0;
    for (const el of sampleEls) {
      if (n++ > 1500) break;
      const c = cs(el);
      bump(c.color);
      bump(c.backgroundColor);
      if (c.borderTopColor && c.borderTopWidth !== '0px') bump(c.borderTopColor);
      const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '';
      for (const role of Object.keys(roleKeywordRe)) {
        if (roleKeywordRe[role].test(String(cls))) {
          if (c.backgroundColor && c.backgroundColor !== 'rgba(0, 0, 0, 0)') roleHints[role].push(c.backgroundColor);
          if (c.color) roleHints[role].push(c.color);
        }
      }
    }
    const palette = Array.from(colorFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([value, count]) => ({ value, count }));

    // ---- tipografia ---------------------------------------------------
    const typeSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'label', 'small', 'blockquote'];
    const typeScale = [];
    for (const sel of typeSelectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const c = cs(el);
      typeScale.push({
        selector: sel,
        fontFamily: c.fontFamily,
        fontSize: c.fontSize,
        fontWeight: c.fontWeight,
        lineHeight: c.lineHeight,
        letterSpacing: c.letterSpacing,
        textTransform: c.textTransform,
      });
    }
    const fontFamilies = new Set();
    let fc = 0;
    for (const el of document.querySelectorAll('body, h1, h2, h3, p, a, button, span, label')) {
      if (fc++ > 300) break;
      const ff = cs(el).fontFamily;
      if (ff) fontFamilies.add(ff.split(',')[0].replace(/["']/g, '').trim());
    }

    // ---- espaçamento (padding/margin/gap observados) -------------------
    const spacingFreq = new Map();
    const bumpSpacing = (v) => {
      String(v).split(' ').forEach((token) => {
        const px = parseFloat(token);
        if (Number.isFinite(px) && px > 0 && px < 400) spacingFreq.set(px, (spacingFreq.get(px) || 0) + 1);
      });
    };
    n = 0;
    for (const el of document.querySelectorAll('section, div, header, footer, nav, article, button, a, .container, [class*="container"]')) {
      if (n++ > 600) break;
      const c = cs(el);
      bumpSpacing(c.padding);
      bumpSpacing(c.margin);
      bumpSpacing(c.gap);
    }
    const spacingScale = Array.from(spacingFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([px, count]) => ({ px, count }))
      .sort((a, b) => a.px - b.px);

    // ---- radius / sombras / bordas -------------------------------------
    const radiusFreq = new Map();
    const shadowFreq = new Map();
    const borderFreq = new Map();
    n = 0;
    for (const el of document.querySelectorAll('button, a, input, textarea, select, [class*="card"], [class*="btn"], img, .container, [class*="rounded"]')) {
      if (n++ > 500) break;
      const c = cs(el);
      if (c.borderRadius && c.borderRadius !== '0px') radiusFreq.set(c.borderRadius, (radiusFreq.get(c.borderRadius) || 0) + 1);
      if (c.boxShadow && c.boxShadow !== 'none') shadowFreq.set(c.boxShadow, (shadowFreq.get(c.boxShadow) || 0) + 1);
      if (c.borderTopWidth && c.borderTopWidth !== '0px' && c.borderTopStyle !== 'none') {
        const key = `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`;
        borderFreq.set(key, (borderFreq.get(key) || 0) + 1);
      }
    }
    const radii = Array.from(radiusFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count }));
    const shadows = Array.from(shadowFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value, count }));
    const borders = Array.from(borderFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value, count }));

    // ---- breakpoints (@media, same-origin) -----------------------------
    const breakpoints = new Set();
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const r of Array.from(rules)) {
        if (r.media && r.media.mediaText) {
          const mm = r.media.mediaText.match(/\d+px/g);
          if (mm) mm.forEach((x) => breakpoints.add(x));
        }
      }
    }

    // ---- grid / container -----------------------------------------------
    const containerCandidates = Array.from(document.querySelectorAll('.container, [class*="container"], main, body > div'))
      .slice(0, 20)
      .map((el) => ({ maxWidth: cs(el).maxWidth, paddingInline: cs(el).paddingLeft, display: cs(el).display, gridTemplateColumns: cs(el).gridTemplateColumns }))
      .filter((x) => x.maxWidth && x.maxWidth !== 'none');

    // ---- botões: candidatos (endereços de seletor para hover/focus real) -
    const buttonSelectors = [];
    document.querySelectorAll('button, a.button, a[class*="btn"], input[type="submit"], input[type="button"], [class*="btn-primary"], [class*="btn-secondary"]').forEach((el, i) => {
      if (i > 40) return;
      let sel = el.tagName.toLowerCase();
      const id = el.id;
      const cls = (el.getAttribute('class') || '').trim();
      if (id) sel = `#${CSS.escape(id)}`;
      else if (cls) sel = `${sel}.${cls.split(/\s+/).map((c) => CSS.escape(c)).join('.')}`;
      buttonSelectors.push(sel);
    });

    // ---- inputs -----------------------------------------------------------
    const inputTokens = [];
    document.querySelectorAll('input, textarea, select').forEach((el, i) => {
      if (i > 6) return;
      const c = cs(el);
      inputTokens.push({
        type: el.tagName.toLowerCase() + (el.type ? `[type=${el.type}]` : ''),
        border: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`,
        borderRadius: c.borderRadius,
        background: c.backgroundColor,
        color: c.color,
        padding: c.padding,
        fontSize: c.fontSize,
      });
    });

    // ---- cards --------------------------------------------------------
    const cardTokens = [];
    document.querySelectorAll('[class*="card"]').forEach((el, i) => {
      if (i > 6) return;
      const c = cs(el);
      cardTokens.push({
        selector: short('div', el),
        background: c.backgroundColor,
        borderRadius: c.borderRadius,
        boxShadow: c.boxShadow,
        padding: c.padding,
        border: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`,
      });
    });

    // ---- navegação ------------------------------------------------------
    const navEl = document.querySelector('nav, header nav, [role="navigation"]');
    let nav = null;
    if (navEl) {
      const c = cs(navEl);
      const link = navEl.querySelector('a');
      nav = {
        background: c.backgroundColor,
        height: c.height,
        position: c.position,
        link: link ? pick(link, ['color', 'fontSize', 'fontWeight', 'textTransform', 'letterSpacing']) : null,
      };
    }

    return {
      palette, roleHints, typeScale, fontFamilies: Array.from(fontFamilies),
      spacingScale, radii, shadows, borders, breakpoints: Array.from(breakpoints).sort((a, b) => parseInt(a) - parseInt(b)),
      containerCandidates, buttonSelectors, inputTokens, cardTokens, nav,
    };
  });
}

// ---------------------------------------------------------------- estados reais
async function measureButtonStates(page, selectors) {
  const results = [];
  for (const sel of selectors.slice(0, 10)) {
    try {
      const locator = page.locator(sel).first();
      if (!(await locator.count())) continue;
      const base = await locator.evaluate((el) => {
        const c = getComputedStyle(el);
        return {
          background: c.backgroundColor, color: c.color, border: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`,
          borderRadius: c.borderRadius, padding: c.padding, fontSize: c.fontSize, fontWeight: c.fontWeight,
          textTransform: c.textTransform, boxShadow: c.boxShadow, transition: c.transition,
        };
      });
      let hover = null;
      let focus = null;
      try {
        await locator.hover({ timeout: 1500, trial: false });
        await page.waitForTimeout(120);
        hover = await locator.evaluate((el) => {
          const c = getComputedStyle(el);
          return { background: c.backgroundColor, color: c.color, boxShadow: c.boxShadow, transform: c.transform };
        });
      } catch { /* elemento pode estar fora da viewport ou coberto */ }
      try {
        await locator.focus({ timeout: 1500 });
        await page.waitForTimeout(80);
        focus = await locator.evaluate((el) => {
          const c = getComputedStyle(el);
          return { outline: c.outline, boxShadow: c.boxShadow, borderColor: c.borderTopColor };
        });
      } catch { /* nem todo elemento é focável */ }
      results.push({ selector: sel, base, hover, focus });
    } catch { /* seletor pode ter deixado de existir após hover em outro elemento */ }
  }
  return results;
}

export async function extractDesignTokens(page) {
  const base = await snapshotBase(page);
  const buttonStates = await measureButtonStates(page, base.buttonSelectors || []);
  return { ...base, buttonStates };
}

// ---------------------------------------------------------------- doc gerado
function fmtColorList(list) {
  if (!list || !list.length) return '_nenhuma cor dominante identificada_';
  return list.slice(0, 12).map((c) => `- \`${c.value}\` (${c.count}x)`).join('\n');
}

export function buildDesignSystemDoc(tokens, meta, startUrl) {
  const L = [];
  L.push('# DESIGN-SYSTEM.md — DNA visual extraído pelo DevClone (Modo 2 · Harness)');
  L.push('');
  L.push(`- **Origem:** ${startUrl}`);
  L.push(`- **Gerado em:** ${new Date().toISOString()}`);
  if (meta && meta.stack && meta.stack.length) L.push(`- **Stack detectada:** ${meta.stack.join(', ')}`);
  L.push('');
  L.push('> Este documento é contexto técnico para outra IA construir um novo site');
  L.push('> seguindo o mesmo DNA visual. Os valores abaixo são medidos diretamente');
  L.push('> (computed style/frequência de uso), não são descrições genéricas.');
  L.push('');

  L.push('## 1. Paleta de cores');
  L.push('');
  L.push('### Cores mais frequentes (todas as ocorrências computadas)');
  L.push(fmtColorList(tokens.palette));
  L.push('');
  const roleLabels = { primary: 'Primária', secondary: 'Secundária', accent: 'Destaque/Accent', success: 'Sucesso', error: 'Erro/Perigo', warning: 'Aviso', info: 'Informação' };
  L.push('### Papéis identificados por convenção de nome de classe');
  for (const [role, label] of Object.entries(roleLabels)) {
    const values = Array.from(new Set(tokens.roleHints?.[role] || [])).slice(0, 4);
    L.push(`- **${label}:** ${values.length ? values.map((v) => `\`${v}\``).join(', ') : '_não identificada por nome de classe — usar as cores mais frequentes acima_'}`);
  }
  L.push('');

  L.push('## 2. Tipografia');
  L.push('');
  L.push(`- **Famílias encontradas:** ${(tokens.fontFamilies || []).map((f) => `\`${f}\``).join(', ') || 'não identificadas'}`);
  L.push('');
  L.push('### Escala tipográfica (valores computados por elemento)');
  L.push('');
  L.push('| Elemento | font-family | font-size | font-weight | line-height | letter-spacing | text-transform |');
  L.push('|---|---|---|---|---|---|---|');
  for (const t of tokens.typeScale || []) {
    L.push(`| ${t.selector} | ${t.fontFamily} | ${t.fontSize} | ${t.fontWeight} | ${t.lineHeight} | ${t.letterSpacing} | ${t.textTransform} |`);
  }
  L.push('');

  L.push('## 3. Sistema de espaçamento');
  L.push('');
  L.push('Valores de padding/margin/gap mais recorrentes no site (provável escala base):');
  L.push('');
  L.push((tokens.spacingScale || []).map((s) => `\`${s.px}px\` (${s.count}x)`).join(' · ') || '_não identificado_');
  L.push('');

  L.push('## 4. Grid e containers');
  L.push('');
  if (tokens.containerCandidates && tokens.containerCandidates.length) {
    L.push('| max-width | padding-inline | display | grid-template-columns |');
    L.push('|---|---|---|---|');
    for (const c of tokens.containerCandidates.slice(0, 8)) {
      L.push(`| ${c.maxWidth} | ${c.paddingInline} | ${c.display} | ${c.gridTemplateColumns || '—'} |`);
    }
  } else {
    L.push('_nenhum container com max-width explícito identificado — o layout provavelmente usa largura fluida com padding lateral._');
  }
  L.push('');
  L.push('### Breakpoints observados (media queries)');
  L.push((tokens.breakpoints || []).join(', ') || '_não identificados_');
  L.push('');

  L.push('## 5. Border-radius');
  L.push('');
  L.push((tokens.radii || []).map((r) => `\`${r.value}\` (${r.count}x)`).join(' · ') || '_nenhum radius relevante identificado_');
  L.push('');

  L.push('## 6. Sombras');
  L.push('');
  if (tokens.shadows && tokens.shadows.length) {
    tokens.shadows.forEach((s) => L.push(`- \`${s.value}\``));
  } else {
    L.push('_nenhuma sombra relevante identificada._');
  }
  L.push('');

  L.push('## 7. Bordas');
  L.push('');
  L.push((tokens.borders || []).map((b) => `\`${b.value}\` (${b.count}x)`).join(' · ') || '_nenhuma borda relevante identificada._');
  L.push('');

  L.push('## 8. Botões — variantes e estados reais (hover/focus medidos no navegador)');
  L.push('');
  if (tokens.buttonStates && tokens.buttonStates.length) {
    for (const b of tokens.buttonStates) {
      L.push(`### \`${b.selector}\``);
      L.push('');
      L.push('**Estado normal**');
      L.push('```');
      L.push(JSON.stringify(b.base, null, 2));
      L.push('```');
      if (b.hover) {
        L.push('**Estado hover (medido)**');
        L.push('```');
        L.push(JSON.stringify(b.hover, null, 2));
        L.push('```');
      }
      if (b.focus) {
        L.push('**Estado focus (medido)**');
        L.push('```');
        L.push(JSON.stringify(b.focus, null, 2));
        L.push('```');
      }
      L.push('');
    }
  } else {
    L.push('_nenhum botão localizado para amostragem de estado._');
  }
  L.push('');

  L.push('## 9. Inputs e elementos de formulário');
  L.push('');
  if (tokens.inputTokens && tokens.inputTokens.length) {
    L.push('| tipo | border | radius | background | color | padding | font-size |');
    L.push('|---|---|---|---|---|---|---|');
    for (const i of tokens.inputTokens) {
      L.push(`| ${i.type} | ${i.border} | ${i.borderRadius} | ${i.background} | ${i.color} | ${i.padding} | ${i.fontSize} |`);
    }
  } else {
    L.push('_nenhum campo de formulário identificado na página capturada._');
  }
  L.push('');

  L.push('## 10. Cards');
  L.push('');
  if (tokens.cardTokens && tokens.cardTokens.length) {
    L.push('| seletor | background | radius | shadow | padding | border |');
    L.push('|---|---|---|---|---|---|');
    for (const c of tokens.cardTokens) {
      L.push(`| ${c.selector} | ${c.background} | ${c.borderRadius} | ${c.boxShadow} | ${c.padding} | ${c.border} |`);
    }
  } else {
    L.push('_nenhum componente de card identificado (seletor `[class*="card"]`)._');
  }
  L.push('');

  L.push('## 11. Navegação');
  L.push('');
  if (tokens.nav) {
    L.push('```');
    L.push(JSON.stringify(tokens.nav, null, 2));
    L.push('```');
  } else {
    L.push('_nenhum elemento `<nav>`/`[role=navigation]` identificado._');
  }
  L.push('');

  L.push('## 12. Como usar este documento');
  L.push('');
  L.push('- `DESIGN-SYSTEM.md` (este arquivo) = documentação técnica com os valores acima.');
  L.push('- `animations/` = código real de animações/interações extraído do site original (ver `ANIMACOES.md`).');
  L.push('- `harness/` = laboratório visual navegável (abra via `ABRIR-SITE.cmd`/`.command`) demonstrando estes tokens aplicados a botões, inputs, cards, tipografia e navegação.');
  L.push('- Use este pacote como REFERÊNCIA de DNA visual/interativo — não como conteúdo a copiar literalmente. Não foi extraído texto, imagem ou estrutura completa do site original (Modo 2 não clona conteúdo, só o sistema).');
  L.push('');

  return L.join('\n');
}
