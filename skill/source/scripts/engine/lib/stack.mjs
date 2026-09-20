/**
 * stack.mjs — portado de background.js (detectStack/stackProbeMain) e do
 * detectStackDOM() exposto por content.js via a ponte. Combina globals do
 * contexto principal da página com sinais de DOM.
 */
import { callBridge } from './page-bridge.mjs';

const STACK_ORDER = [
  'Next.js', 'Nuxt', 'React', 'Vue', 'Angular', 'Svelte', 'Astro', 'Alpine.js',
  'Webflow', 'Framer', 'WordPress', 'Elementor', 'Wix', 'Squarespace', 'Shopify',
  'Tailwind CSS', 'Bootstrap',
  'GSAP', 'Three.js', 'Rive', 'Lottie', 'Lenis', 'Swiper', 'AOS', 'Locomotive Scroll', 'ScrollMagic', 'Barba.js', 'jQuery',
];

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

export async function detectStack(page) {
  const set = new Set();
  try {
    const mainWorldStack = await page.evaluate(stackProbeMain);
    (mainWorldStack || []).forEach((s) => set.add(s));
  } catch { /* CSP ou pagina restrita */ }
  try {
    const r = await callBridge(page, { action: 'domStack' });
    if (r && r.ok && Array.isArray(r.stack)) r.stack.forEach((s) => set.add(s));
  } catch { /* ignore */ }
  const arr = Array.from(set);
  arr.sort((a, b) => {
    const ia = STACK_ORDER.indexOf(a);
    const ib = STACK_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return arr;
}
