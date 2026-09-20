/**
 * animation-extract.mjs — NOVO módulo (Modo 2 / Harness).
 *
 * Localiza e extrai CÓDIGO REAL de animação/interação (não descrições) a
 * partir do CSS/JS já capturado em state.files: @keyframes, transitions,
 * transforms, e trechos de JS que usam bibliotecas conhecidas (GSAP,
 * ScrollTrigger, Lottie, Rive, Lenis, AOS, ScrollMagic, Barba.js) ou
 * padrões nativos (IntersectionObserver, requestAnimationFrame,
 * matchMedia + reduced-motion, scroll listeners).
 *
 * Produz arquivos reais para o pacote:
 *   animations/keyframes.css     -> todos os @keyframes encontrados
 *   animations/transitions.css   -> regras com transition/transform relevantes
 *   animations/interactions.js   -> trechos de JS de animação/interação
 *   ANIMACOES.md                 -> sumário do que foi encontrado e de onde
 */

const KEYFRAMES_RE = /@(?:-webkit-|-moz-)?keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi;

const LIB_SIGNATURES = [
  { name: 'GSAP', re: /\bgsap\.|TweenMax|TweenLite|ScrollTrigger|ScrollSmoother|SplitText/g },
  { name: 'Lottie', re: /\blottie\.(loadAnimation|play|pause)|bodymovin\./g },
  { name: 'Rive', re: /new\s+rive\.Rive\(|\bRive\(/g },
  { name: 'Lenis', re: /new\s+Lenis\(|\blenis\./g },
  { name: 'AOS', re: /\bAOS\.init\(/g },
  { name: 'ScrollMagic', re: /new\s+ScrollMagic\.(Controller|Scene)\(/g },
  { name: 'Barba.js', re: /\bbarba\.init\(/g },
  { name: 'Swiper', re: /new\s+Swiper\(/g },
  { name: 'IntersectionObserver', re: /new\s+IntersectionObserver\(/g },
  { name: 'requestAnimationFrame', re: /requestAnimationFrame\(/g },
];

function findLineWindow(text, index, before = 4, after = 12) {
  const upto = text.slice(0, index);
  const startLine = Math.max(0, upto.split('\n').length - 1 - before);
  const lines = text.split('\n');
  const endLine = Math.min(lines.length, startLine + before + after);
  return lines.slice(startLine, endLine).join('\n');
}

/**
 * @param {Array<{name:string, data:Uint8Array}>} files arquivos já capturados (CSS/JS)
 */
export function extractAnimationCode(files) {
  const cssFiles = (files || []).filter((f) => /\.css$/i.test(f.name));
  const jsFiles = (files || []).filter((f) => /\.m?js$/i.test(f.name));

  const keyframesFound = [];
  const transitionRulesFound = [];
  const jsSnippetsFound = [];
  const libsDetected = new Set();

  for (const f of cssFiles) {
    let text;
    try { text = Buffer.from(f.data).toString('utf8'); } catch { continue; }

    const kf = text.match(KEYFRAMES_RE) || [];
    for (const block of kf) keyframesFound.push({ source: f.name, code: block });

    // Regras com transition/transform relevantes (bloco completo, não a folha toda)
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = ruleRe.exec(text))) {
      const selector = m[1].trim();
      const body = m[2];
      if (/@/.test(selector)) continue; // já tratado por @keyframes acima
      if (/transition\s*:|transform\s*:|animation\s*:|will-change\s*:/i.test(body)) {
        const relevantDecls = body
          .split(';')
          .map((d) => d.trim())
          .filter((d) => /^(transition|transform|animation|will-change)\s*:/i.test(d));
        if (relevantDecls.length) {
          transitionRulesFound.push({ source: f.name, selector, declarations: relevantDecls });
        }
      }
    }
  }

  for (const f of jsFiles) {
    let text;
    try { text = Buffer.from(f.data).toString('utf8'); } catch { continue; }
    if (text.length > 400000) continue; // arquivo gigante/minificado — pouco proveitoso para extrair "trecho legível"

    for (const lib of LIB_SIGNATURES) {
      lib.re.lastIndex = 0;
      let match;
      let hits = 0;
      while ((match = lib.re.exec(text)) && hits < 3) {
        libsDetected.add(lib.name);
        jsSnippetsFound.push({
          source: f.name,
          library: lib.name,
          code: findLineWindow(text, match.index),
        });
        hits++;
      }
    }
  }

  return { keyframesFound, transitionRulesFound, jsSnippetsFound, libsDetected: Array.from(libsDetected) };
}

export function buildAnimationFiles(extraction) {
  const encoder = new TextEncoder();
  const files = [];

  if (extraction.keyframesFound.length) {
    const L = ['/* animations/keyframes.css — @keyframes reais extraídos do site original */', ''];
    for (const k of extraction.keyframesFound) {
      L.push(`/* origem: ${k.source} */`);
      L.push(k.code);
      L.push('');
    }
    files.push({ name: 'animations/keyframes.css', data: encoder.encode(L.join('\n')) });
  }

  if (extraction.transitionRulesFound.length) {
    const L = ['/* animations/transitions.css — regras de transition/transform/animation reais, por seletor */', ''];
    for (const r of extraction.transitionRulesFound.slice(0, 400)) {
      L.push(`/* origem: ${r.source} */`);
      L.push(`${r.selector} {`);
      for (const d of r.declarations) L.push(`  ${d};`);
      L.push('}');
      L.push('');
    }
    files.push({ name: 'animations/transitions.css', data: encoder.encode(L.join('\n')) });
  }

  if (extraction.jsSnippetsFound.length) {
    const L = [
      '/* animations/interactions.js — trechos reais de JS de animação/interação */',
      '/* Cada bloco é um recorte do arquivo original ao redor de uma chamada de */',
      '/* biblioteca de animação identificada. Não é um arquivo executável isolado */',
      '/* — use como referência de implementação real, adaptando ao novo projeto. */',
      '',
    ];
    for (const s of extraction.jsSnippetsFound.slice(0, 200)) {
      L.push(`/* ---- ${s.library} — origem: ${s.source} ---- */`);
      L.push(s.code);
      L.push('');
    }
    files.push({ name: 'animations/interactions.js', data: encoder.encode(L.join('\n')) });
  }

  return files;
}

export function buildAnimationDoc(extraction, startUrl) {
  const L = [];
  L.push('# ANIMACOES.md — Animações e interações reais extraídas (Modo 2 · Harness)');
  L.push('');
  L.push(`- **Origem:** ${startUrl}`);
  L.push(`- **Gerado em:** ${new Date().toISOString()}`);
  L.push('');
  L.push('## Bibliotecas de animação detectadas em uso');
  L.push('');
  L.push(extraction.libsDetected.length ? extraction.libsDetected.map((l) => `- ${l}`).join('\n') : '_nenhuma biblioteca de animação conhecida foi detectada em uso no JS capturado._');
  L.push('');
  L.push('## O que foi extraído');
  L.push('');
  L.push(`- **@keyframes reais:** ${extraction.keyframesFound.length} bloco(s) — ver \`animations/keyframes.css\`.`);
  L.push(`- **Regras de transition/transform/animation:** ${extraction.transitionRulesFound.length} regra(s) — ver \`animations/transitions.css\`.`);
  L.push(`- **Trechos de JS de animação/interação:** ${extraction.jsSnippetsFound.length} trecho(s) — ver \`animations/interactions.js\`.`);
  L.push('');
  if (!extraction.keyframesFound.length && !extraction.transitionRulesFound.length && !extraction.jsSnippetsFound.length) {
    L.push('## Observação');
    L.push('');
    L.push('Não foram encontradas animações/interações via CSS (@keyframes, transition,');
    L.push('transform) nem via bibliotecas de animação conhecidas no JavaScript');
    L.push('capturado. Isso pode significar que o site não usa animações relevantes,');
    L.push('ou que elas são geradas por um bundle fortemente ofuscado/minificado onde a');
    L.push('assinatura da biblioteca não pôde ser localizada por padrão de texto.');
    L.push('');
  } else {
    L.push('## Como usar');
    L.push('');
    L.push('- `animations/keyframes.css` e `animations/transitions.css` podem ser');
    L.push('  importados diretamente em um novo projeto — são CSS real, não inventado.');
    L.push('- `animations/interactions.js` traz recortes de JS ao redor de cada chamada');
    L.push('  de biblioteca identificada — sirva como referência de implementação real');
    L.push('  ao recriar a interação em um novo projeto (adapte seletores/contexto).');
    L.push('- O `harness/` (Visual Harness) já referencia esses arquivos para demonstrar');
    L.push('  as animações funcionando ao vivo — abra via `ABRIR-SITE.cmd`/`.command`.');
    L.push('');
  }
  return L.join('\n');
}
