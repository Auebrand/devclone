// Detecção de inteligência de stack local para DevClone

async function probeProjectSignals() {
  const scripts = Array.from(document.scripts || []).map((el) => el.src || '').filter(Boolean).slice(0, 120);
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((el) => el.href || '').filter(Boolean).slice(0, 80);
  const generators = Array.from(document.querySelectorAll('meta[name="generator"]')).map((el) => el.content || '').filter(Boolean).slice(0, 20);
  const markers = [];
  const w = window;
  const has = (key) => { try { return typeof w[key] !== 'undefined' && w[key] !== null; } catch { return false; } };

  if (has('__NEXT_DATA__')) markers.push('__NEXT_DATA__');
  if (has('__NUXT__')) markers.push('__NUXT__');
  if (has('__REACT_DEVTOOLS_GLOBAL_HOOK__')) markers.push('__REACT_DEVTOOLS_GLOBAL_HOOK__');
  if (has('__VUE__')) markers.push('__VUE__');
  if (document.querySelector('astro-island')) markers.push('astro-island');
  if (document.querySelector('[data-wf-page]')) markers.push('data-wf-page');
  if (document.querySelector('#__next')) markers.push('#__next');
  if (document.querySelector('#__nuxt')) markers.push('#__nuxt');
  if (document.querySelector('[data-reactroot], #root, #app')) markers.push('app-root');
  if (document.querySelector('script[type="module"]')) markers.push('type=module');

  const fingerprintRules = [
    ['bundle:react', /react-dom|createRoot\s*\(|react\/jsx-runtime|react\.production/i],
    ['bundle:vite', /modulepreload|vite\/preload-helper|__vite__|vitepreload/i],
    ['bundle:framer-motion', /MotionConfig|whileInView|motionValue|framer-motion/i],
    ['bundle:gsap', /ScrollTrigger|\bgsap\b|TweenMax|TweenLite/i],
    ['bundle:three', /WebGLRenderer|three\.module|\bTHREE\./i],
    ['bundle:swiper', /swiper-slide|Swiper\s*\(/i],
    ['bundle:lenis', /\bLenis\b|data-lenis/i],
  ];

  const sameOriginScripts = scripts.filter((src) => {
    try { return new URL(src, location.href).origin === location.origin; } catch { return false; }
  }).slice(0, 5);
  for (const src of sameOriginScripts) {
    try {
      const response = await fetch(src, { credentials: 'same-origin', cache: 'force-cache' });
      if (!response.ok) continue;
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 4 * 1024 * 1024) continue;
      const text = (await response.text()).slice(0, 2_500_000);
      for (const [marker, pattern] of fingerprintRules) {
        if (pattern.test(text) && !markers.includes(marker)) markers.push(marker);
      }
    } catch {}
  }

  const elements = Array.from(document.querySelectorAll('*')).filter((el) => el instanceof HTMLElement).slice(0, 1600);
  let flexCount = 0;
  let gridCount = 0;
  let complexGridCount = 0;
  let absoluteCount = 0;
  let fixedCount = 0;
  let stickyCount = 0;
  let zIndexCount = 0;
  let cssTransitions = 0;
  let cssAnimations = 0;

  const countTracks = (value) => {
    if (!value || value === 'none') return 0;
    const repeat = String(value).match(/repeat\(\s*(\d+)\s*,/i);
    if (repeat) return Number(repeat[1]) || 0;
    return String(value).trim().split(/\s+/).filter(Boolean).length;
  };

  for (const el of elements) {
    let style;
    try { style = getComputedStyle(el); } catch { continue; }
    if (style.display === 'flex' || style.display === 'inline-flex') flexCount++;
    if (style.display === 'grid' || style.display === 'inline-grid') {
      gridCount++;
      if (countTracks(style.gridTemplateColumns) >= 4 || countTracks(style.gridTemplateRows) >= 4) complexGridCount++;
    }
    if (style.position === 'absolute') absoluteCount++;
    else if (style.position === 'fixed') fixedCount++;
    else if (style.position === 'sticky') stickyCount++;
    if (style.zIndex !== 'auto' && Number.isFinite(Number(style.zIndex))) zIndexCount++;
    if (style.transitionDuration && style.transitionDuration !== '0s') cssTransitions++;
    if (style.animationName && style.animationName !== 'none') cssAnimations++;
  }

  let webgl = false;
  const canvases = Array.from(document.querySelectorAll('canvas')).slice(0, 30);
  for (const canvas of canvases) {
    try {
      if (canvas.getContext('webgl') || canvas.getContext('webgl2')) { webgl = true; break; }
    } catch {}
  }

  const dynamicDom = Boolean(document.querySelector('[data-framer-name], [data-motion], [style*="transform"], [style*="opacity"]')) || markers.includes('bundle:framer-motion');
  const scrollDriven = Boolean(document.querySelector('[data-scroll], [data-scroll-section], [data-lenis], [data-aos]')) || markers.includes('bundle:gsap') || markers.includes('bundle:framer-motion');

  return {
    url: location.href,
    scripts,
    styles,
    generators,
    markers,
    layout: { flexCount, gridCount, complexGridCount, absoluteCount, fixedCount, stickyCount, zIndexCount },
    animation: {
      cssTransitions,
      cssAnimations,
      canvasCount: canvases.length,
      webgl,
      dynamicDom,
      scrollDriven,
    },
    interactions: {
      navCount: document.querySelectorAll('nav, [role="navigation"]').length,
      carouselCount: document.querySelectorAll('.swiper, .swiper-container, [class*="carousel"], [aria-roledescription="carousel"]').length,
      dialogCount: document.querySelectorAll('dialog, [role="dialog"]').length,
    },
  };
}

async function getLocalStack(tabId) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const out = [];
        const w = window;
        const has = (key) => { try { return typeof w[key] !== 'undefined' && w[key] !== null; } catch { return false; } };
        if (has('__NEXT_DATA__')) out.push('Next.js', 'React');
        else if (has('React') || has('__REACT_DEVTOOLS_GLOBAL_HOOK__')) out.push('React');
        if (has('__NUXT__')) out.push('Nuxt', 'Vue');
        else if (has('Vue') || has('__VUE__')) out.push('Vue');
        if (has('gsap')) out.push('GSAP');
        if (has('THREE')) out.push('Three.js');
        if (has('Swiper')) out.push('Swiper');
        return out;
      },
    });
    return Array.isArray(result?.[0]?.result) ? result[0].result : [];
  } catch {
    return [];
  }
}

async function analyzeTab(tabId, url) {
  if (!tabId || !/^https?:/i.test(String(url || ''))) return null;
  let signals;
  try {
    const result = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: probeProjectSignals });
    signals = result?.[0]?.result || null;
  } catch {
    return null;
  }
  if (!signals) return null;

  const localStack = await getLocalStack(tabId);
  signals.stack = localStack;

  const stack = [...localStack];
  try { await chrome.runtime.sendMessage({ action: 'stackDetected', tabId, stack }); } catch {}
  return { stack };
}

async function analyzeActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab?.url) await analyzeTab(tab.id, tab.url);
  } catch {}
}

chrome.runtime.onInstalled.addListener(() => { analyzeActiveTab(); });
chrome.runtime.onStartup.addListener(() => { analyzeActiveTab(); });
chrome.tabs.onActivated.addListener(() => { setTimeout(analyzeActiveTab, 350); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active && tab.url) setTimeout(() => analyzeTab(tabId, tab.url), 450);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action !== 'projectIntelligence') return false;
  const tabId = msg.tabId || sender.tab?.id;
  const url = msg.url || sender.tab?.url;
  analyzeTab(tabId, url).then((intelligence) => sendResponse({ ok: Boolean(intelligence), intelligence })).catch(() => sendResponse({ ok: false }));
  return true;
});

analyzeActiveTab();
