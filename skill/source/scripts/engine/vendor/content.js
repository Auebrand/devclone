/**
 * content.js — roda dentro da pagina (injetado via page.addScriptTag).
 * Responsabilidades:
 *  1) 'collect'  -> varre o DOM, devolve lista de assets + metadados p/ a IA.
 *  2) 'rewrite'  -> recebe o mapa (urlAbsoluta -> caminhoLocal) e devolve o HTML final.
 * Cópia byte-a-byte do content.js da extensão Chrome — não depende de
 * chrome.runtime para funcionar, então roda igual dentro ou fora dela.
 */

(() => {
  if (window.__devcloneLoaded) return;
  window.__devcloneLoaded = true;

  const abs = (url) => {
    try { return new URL(url, document.baseURI).href; } catch { return null; }
  };

  // Extrai todas as URLs de um valor CSS (url(...) e image-set)
  function urlsFromCss(text) {
    const out = [];
    if (!text) return out;
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    let m;
    while ((m = re.exec(text))) {
      const u = m[2].trim();
      if (u && !u.startsWith('data:') && !u.startsWith('blob:')) out.push(u);
    }
    return out;
  }

  // Expande srcset -> [urls]
  function urlsFromSrcset(srcset) {
    if (!srcset) return [];
    return srcset.split(',')
      .map((s) => s.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Rola a pagina em passos para disparar lazy-load de imagens, videos e animacoes,
  // forca o carregamento de videos, e volta ao topo.
  async function primePage() {
    try {
      const vh = window.innerHeight || 800;
      const fullH = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0
      );
      if (fullH > vh * 1.15) {
        const step = Math.max(vh * 0.85, 400);
        const max = Math.min(fullH, vh * 50); // limite de seguranca
        for (let y = 0; y < max; y += step) {
          window.scrollTo(0, y);
          await sleep(110);
        }
        window.scrollTo(0, 0);
        await sleep(220);
      }
      // forca metadados/poster de videos
      document.querySelectorAll('video').forEach((v) => {
        try { v.preload = 'auto'; v.load && v.load(); } catch {}
      });
      await sleep(150);
    } catch {}
  }

  // ---------------------------------------------------------------- COLLECT
  async function collect(options = {}) {
    if (options.prime !== false) await primePage();
    const assets = new Map(); // url -> kind
    const add = (rawUrl, kind) => {
      const u = abs(rawUrl);
      if (!u) return;
      if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('javascript:')) return;
      // primeiro kind "vence", mas icon/font/css/js tem prioridade sobre 'img'
      if (!assets.has(u)) assets.set(u, kind);
    };

    // CSS linkado
    document.querySelectorAll('link[rel~="stylesheet"i][href]').forEach((l) => add(l.href, 'css'));
    // Icones / manifest
    document.querySelectorAll('link[rel~="icon"i][href], link[rel="apple-touch-icon"i][href], link[rel="mask-icon"i][href], link[rel="manifest"i][href]').forEach((l) => add(l.href, 'icon'));
    // preload de fontes/imagens
    document.querySelectorAll('link[rel="preload"i][href]').forEach((l) => {
      const as = (l.getAttribute('as') || '').toLowerCase();
      if (as === 'font') add(l.href, 'font');
      else if (as === 'image') add(l.href, 'img');
      else if (as === 'style') add(l.href, 'css');
      else if (as === 'script') add(l.href, 'js');
    });

    // Scripts externos
    document.querySelectorAll('script[src]').forEach((s) => add(s.src, 'js'));

    // Imagens
    document.querySelectorAll('img').forEach((img) => {
      if (img.currentSrc) add(img.currentSrc, 'img');
      if (img.getAttribute('src')) add(img.getAttribute('src'), 'img');
      urlsFromSrcset(img.getAttribute('srcset')).forEach((u) => add(u, 'img'));
    });
    document.querySelectorAll('picture source, source[srcset]').forEach((s) => {
      urlsFromSrcset(s.getAttribute('srcset')).forEach((u) => add(u, 'img'));
      if (s.getAttribute('src')) add(s.getAttribute('src'), 'media');
    });

    // Video / audio
    document.querySelectorAll('video, audio').forEach((v) => {
      if (v.getAttribute('src')) add(v.getAttribute('src'), 'media');
      if (v.getAttribute('poster')) add(v.getAttribute('poster'), 'img');
    });
    document.querySelectorAll('video source[src], audio source[src]').forEach((s) => add(s.getAttribute('src'), 'media'));

    // <object>, <embed>, <track>
    document.querySelectorAll('object[data]').forEach((o) => add(o.getAttribute('data'), 'media'));
    document.querySelectorAll('embed[src]').forEach((e) => add(e.getAttribute('src'), 'media'));
    document.querySelectorAll('track[src]').forEach((t) => add(t.getAttribute('src'), 'media'));

    // <use href> de SVG externo
    document.querySelectorAll('use[href], use[*|href]').forEach((u) => {
      const h = u.getAttribute('href') || u.getAttribute('xlink:href');
      if (h && !h.startsWith('#')) add(h.split('#')[0], 'img');
    });

    // Video: fonte efetivamente tocando (currentSrc) + preload
    document.querySelectorAll('video').forEach((v) => {
      if (v.currentSrc) add(v.currentSrc, 'media');
    });

    // Animacoes Lottie / players declarativos
    document.querySelectorAll('lottie-player[src], dotlottie-player[src], [data-animation-path], [data-lottie], [data-src$=".json"], [data-src$=".lottie"]').forEach((el) => {
      const src = el.getAttribute('src') || el.getAttribute('data-animation-path') || el.getAttribute('data-lottie') || el.getAttribute('data-src');
      if (src) add(src, 'anim');
    });

    // Lazy-load: atributos data-* comuns (imagens, videos, backgrounds)
    const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-image', 'data-poster', 'data-video', 'data-thumb'];
    const LAZY_SRCSET = ['data-srcset', 'data-lazy-srcset'];
    const LAZY_BG = ['data-bg', 'data-background', 'data-background-image'];
    document.querySelectorAll(
      LAZY_ATTRS.concat(LAZY_SRCSET, LAZY_BG).map((a) => `[${a}]`).join(',')
    ).forEach((el) => {
      LAZY_ATTRS.forEach((a) => { if (el.hasAttribute(a)) add(el.getAttribute(a), 'asset'); });
      LAZY_SRCSET.forEach((a) => { if (el.hasAttribute(a)) urlsFromSrcset(el.getAttribute(a)).forEach((u) => add(u, 'img')); });
      LAZY_BG.forEach((a) => {
        if (el.hasAttribute(a)) {
          const v = el.getAttribute(a);
          const inUrl = urlsFromCss(v);
          if (inUrl.length) inUrl.forEach((u) => add(u, 'asset'));
          else add(v, 'asset');
        }
      });
    });

    // url() em <style> inline
    document.querySelectorAll('style').forEach((st) => {
      urlsFromCss(st.textContent).forEach((u) => add(u, 'asset'));
    });

    // url() em atributos style=""
    document.querySelectorAll('[style]').forEach((el) => {
      urlsFromCss(el.getAttribute('style')).forEach((u) => add(u, 'asset'));
    });

    // Folhas same-origin acessiveis: capta url() das regras (cross-origin lanca e ignoramos)
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (rule.style && rule.style.cssText) urlsFromCss(rule.style.cssText).forEach((u) => add(u, 'asset'));
        if (rule.cssText && /@font-face/i.test(rule.cssText)) urlsFromCss(rule.cssText).forEach((u) => add(u, 'font'));
      }
    }

    return {
      pageUrl: location.href,
      title: document.title || '',
      assets: Array.from(assets, ([url, kind]) => ({ url, kind })),
      meta: buildMeta(),
    };
  }

  // ---------------------------------------------------------------- META (p/ IA)
  function buildMeta() {
    const pick = (sel) => document.querySelector(sel);
    const desc = pick('meta[name="description"]');
    const vp = pick('meta[name="viewport"]');

    // paleta: amostra cores computadas de elementos-chave
    const colorSet = new Map();
    const bump = (c) => {
      if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent') return;
      colorSet.set(c, (colorSet.get(c) || 0) + 1);
    };
    const sampleEls = document.querySelectorAll('body, header, nav, main, footer, section, h1, h2, h3, a, button, p');
    let count = 0;
    for (const el of sampleEls) {
      if (count++ > 400) break;
      const cs = getComputedStyle(el);
      bump(cs.color);
      bump(cs.backgroundColor);
    }
    const palette = Array.from(colorSet.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c]) => c);

    // fontes
    const fonts = new Set();
    let fcount = 0;
    for (const el of document.querySelectorAll('body, h1, h2, h3, p, a, button, span')) {
      if (fcount++ > 200) break;
      const ff = getComputedStyle(el).fontFamily;
      if (ff) fonts.add(ff.split(',')[0].replace(/["']/g, '').trim());
    }

    // estrutura de secoes (landmarks + headings)
    const sections = [];
    document.querySelectorAll('header, nav, main, section, aside, footer, [role="banner"], [role="navigation"], [role="main"], [role="contentinfo"]').forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const heading = el.querySelector('h1, h2, h3');
      const cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 3).join(' ');
      sections.push({
        tag,
        label: heading ? heading.textContent.trim().slice(0, 80) : '',
        cls: cls.slice(0, 80),
        childBlocks: el.children.length,
      });
    });

    // headings (outline)
    const headings = [];
    document.querySelectorAll('h1, h2, h3').forEach((h) => {
      headings.push({ level: h.tagName.toLowerCase(), text: h.textContent.trim().slice(0, 100) });
    });

    // @media breakpoints (same-origin apenas)
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

    return {
      title: document.title || '',
      description: desc ? desc.getAttribute('content') : '',
      viewport: vp ? vp.getAttribute('content') : '',
      lang: document.documentElement.getAttribute('lang') || '',
      palette,
      fonts: Array.from(fonts).slice(0, 12),
      sections: sections.slice(0, 40),
      headings: headings.slice(0, 60),
      breakpoints: Array.from(breakpoints).sort((a, b) => parseInt(a) - parseInt(b)),
      counts: {
        images: document.images.length,
        links: document.links.length,
        scripts: document.scripts.length,
        forms: document.forms.length,
      },
    };
  }

  // ---------------------------------------------------------------- REWRITE
  // pathMap: { urlAbsoluta: 'css/arquivo.css' } (caminho relativo a raiz do zip)
  function rewrite(pathMap, options = {}) {
    // IMPORTANTE: nao usar cloneNode do DOM vivo. Ao trocar o src de um <img>/<video>
    // clonado, o navegador tenta carregar o novo caminho na hora, resolvendo o caminho
    // local ("assets/img/...") contra a URL do site -> centenas de 404 fantasma no
    // console. Um documento criado por DOMParser e INERTE: mexer em src/href nao
    // dispara nenhuma requisicao de rede.
    let doc;
    try {
      const serialized = options.sourceHtml || document.documentElement.outerHTML;
      const parsed = new DOMParser().parseFromString(serialized, 'text/html');
      doc = parsed.documentElement;
    } catch {
      doc = document.documentElement.cloneNode(true); // fallback seguro
    }

    const sourceBase = options.pageUrl || document.baseURI;
    const resolveSourceUrl = (rawUrl) => {
      try { return new URL(rawUrl, sourceBase).href; } catch { return null; }
    };

    const mapUrl = (rawUrl) => {
      const u = resolveSourceUrl(rawUrl);
      if (u && pathMap[u]) return pathMap[u];
      return null;
    };

    const rewriteSrcset = (val) => {
      if (!val) return val;
      return val.split(',').map((part) => {
        const seg = part.trim();
        const sp = seg.split(/\s+/);
        const mapped = mapUrl(sp[0]);
        if (mapped) sp[0] = mapped;
        return sp.join(' ');
      }).join(', ');
    };

    const rewriteCssText = (text) => {
      if (!text) return text;
      return text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, q, u) => {
        if (u.startsWith('data:') || u.startsWith('blob:')) return full;
        const mapped = mapUrl(u);
        return mapped ? `url("${mapped}")` : full;
      });
    };

    // href/src simples
    doc.querySelectorAll('[href], [src], [data], [poster]').forEach((el) => {
      ['href', 'src', 'data', 'poster'].forEach((attr) => {
        if (!el.hasAttribute(attr)) return;
        const mapped = mapUrl(el.getAttribute(attr));
        if (mapped) el.setAttribute(attr, mapped);
      });
    });
    // srcset
    doc.querySelectorAll('[srcset]').forEach((el) => {
      el.setAttribute('srcset', rewriteSrcset(el.getAttribute('srcset')));
    });
    // <use href>
    doc.querySelectorAll('use').forEach((u) => {
      const h = u.getAttribute('href') || u.getAttribute('xlink:href');
      if (h && !h.startsWith('#')) {
        const [base, frag] = h.split('#');
        const mapped = mapUrl(base);
        if (mapped) {
          const nv = frag ? `${mapped}#${frag}` : mapped;
          if (u.hasAttribute('href')) u.setAttribute('href', nv);
          if (u.hasAttribute('xlink:href')) u.setAttribute('xlink:href', nv);
        }
      }
    });
    // <style> inline
    doc.querySelectorAll('style').forEach((st) => { st.textContent = rewriteCssText(st.textContent); });
    // style="" inline
    doc.querySelectorAll('[style]').forEach((el) => {
      el.setAttribute('style', rewriteCssText(el.getAttribute('style')));
    });

    // Lazy-load: mapeia data-* e ativa o src real para funcionar offline
    const LAZY_SINGLE = ['data-src', 'data-lazy-src', 'data-original', 'data-image', 'data-video', 'data-thumb'];
    doc.querySelectorAll(LAZY_SINGLE.map((a) => `[${a}]`).join(',')).forEach((el) => {
      for (const a of LAZY_SINGLE) {
        if (!el.hasAttribute(a)) continue;
        const mapped = mapUrl(el.getAttribute(a));
        if (mapped) {
          el.setAttribute(a, mapped);
          if (!el.getAttribute('src')) el.setAttribute('src', mapped);
        }
      }
    });
    doc.querySelectorAll('[data-srcset], [data-lazy-srcset]').forEach((el) => {
      ['data-srcset', 'data-lazy-srcset'].forEach((a) => {
        if (!el.hasAttribute(a)) return;
        const rw = rewriteSrcset(el.getAttribute(a));
        el.setAttribute(a, rw);
        if (!el.getAttribute('srcset')) el.setAttribute('srcset', rw);
      });
    });
    doc.querySelectorAll('[data-bg], [data-background], [data-background-image]').forEach((el) => {
      ['data-bg', 'data-background', 'data-background-image'].forEach((a) => {
        if (!el.hasAttribute(a)) return;
        const raw = el.getAttribute(a);
        const urls = rewriteCssText(/url\(/i.test(raw) ? raw : `url(${raw})`);
        el.setAttribute(a, urls);
        const cur = el.getAttribute('style') || '';
        if (!/background/i.test(cur)) el.setAttribute('style', `${cur};background-image:${urls}`.replace(/^;/, ''));
      });
    });
    // Lottie / players declarativos
    doc.querySelectorAll('lottie-player, dotlottie-player, [data-animation-path], [data-lottie]').forEach((el) => {
      ['src', 'data-animation-path', 'data-lottie'].forEach((a) => {
        if (!el.hasAttribute(a)) return;
        const mapped = mapUrl(el.getAttribute(a));
        if (mapped) el.setAttribute(a, mapped);
      });
    });

    // Remove integrity/crossorigin que quebrariam o carregamento offline
    doc.querySelectorAll('[integrity]').forEach((el) => el.removeAttribute('integrity'));
    doc.querySelectorAll('link[crossorigin], script[crossorigin]').forEach((el) => el.removeAttribute('crossorigin'));

    // CSP e <base> da origem impedem scripts e caminhos locais no clone.
    doc.querySelectorAll('meta[http-equiv="Content-Security-Policy" i], base').forEach((el) => el.remove());

    // Residuos comuns injetados por outras extensoes. No modo de captura pela
    // resposta original eles nem existem; esta limpeza protege o fallback DOM.
    doc.querySelectorAll([
      'mozbar-toolbar', 'grammarly-desktop-integration',
      '#html-to-elementor-content-root', '[data-wxt-shadow-root]',
      '[data-lastpass-icon-root]', '[data-1password-root]',
    ].join(',')).forEach((el) => el.remove());
    doc.querySelectorAll('style').forEach((st) => {
      const t = st.textContent || '';
      if (/imageye-selected|mozbar-toolbar|html-to-elementor-content-root/i.test(t)) st.remove();
    });

    // Remapeia requisicoes criadas em runtime (fetch/XHR/Worker), caso bibliotecas
    // como Rive e WebAssembly montem a URL depois que o HTML ja carregou.
    const runtimeMap = {};
    for (const [url, local] of Object.entries(pathMap || {})) {
      if (/^https?:/i.test(url) && local) runtimeMap[url.split('#')[0]] = local;
    }
    if (Object.keys(runtimeMap).length) {
      const script = doc.ownerDocument.createElement('script');
      script.setAttribute('data-devclone-runtime-map', '');
      const mapJson = JSON.stringify(runtimeMap).replace(/</g, '\\u003c');
      const baseJson = JSON.stringify(sourceBase).replace(/</g, '\\u003c');
      script.textContent = `(function(M,B){
        function key(v){try{return new URL(String(v),B).href.split('#')[0]}catch(e){return String(v)}}
        function local(v){return M[key(v)]||v}
        if(window.fetch){var F=window.fetch;window.fetch=function(input,init){try{if(input instanceof Request){var m=local(input.url);if(m!==input.url)input=new Request(m,input)}else input=local(input)}catch(e){}return F.call(this,input,init)}}
        if(window.XMLHttpRequest){var O=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url){arguments[1]=local(url);return O.apply(this,arguments)}}
        if(window.Worker){var W=window.Worker;var SW=function(url,opts){return new W(local(url),opts)};SW.prototype=W.prototype;window.Worker=SW}
        function patch(P,n){try{var d=Object.getOwnPropertyDescriptor(P,n);if(!d||!d.set)return;Object.defineProperty(P,n,{configurable:d.configurable,enumerable:d.enumerable,get:d.get,set:function(v){return d.set.call(this,local(v))}})}catch(e){}}
        if(window.HTMLImageElement)patch(HTMLImageElement.prototype,'src');
        if(window.HTMLMediaElement)patch(HTMLMediaElement.prototype,'src');
        if(window.HTMLSourceElement)patch(HTMLSourceElement.prototype,'src');
        window.__DEVCLONE_ASSET_MAP__=M;
      })(${mapJson},${baseJson});`;
      const head = doc.querySelector('head') || doc;
      head.insertBefore(script, head.firstChild);
    }

    const remainingRemote = Array.from(doc.querySelectorAll(
      'script[src],link[rel~="stylesheet" i][href],img[src],source[src],video[src],audio[src],object[data],embed[src]'
    )).map((el) => el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('data'))
      .filter((u) => /^(https?:)?\/\//i.test(u || ''));

    const doctype = document.doctype ? `<!DOCTYPE ${document.doctype.name}>\n` : '<!DOCTYPE html>\n';
    return {
      html: doctype + doc.outerHTML,
      remainingRemote: Array.from(new Set(remainingRemote)),
      stats: {
        source: options.sourceHtml ? 'network-original' : 'rendered-dom-fallback',
        runtimeMappings: Object.keys(runtimeMap).length,
      },
    };
  }

  // ---------------------------------------------------------------- STACK (via DOM)
  function detectStackDOM() {
    const found = new Set();
    const html = document.documentElement;
    const genMeta = document.querySelector('meta[name="generator"]');
    const gen = (genMeta ? genMeta.getAttribute('content') || '' : '').toLowerCase();
    const q = (sel) => { try { return document.querySelector(sel); } catch { return null; } };
    const scripts = Array.from(document.scripts).map((s) => (s.src || '').toLowerCase());
    const links = Array.from(document.querySelectorAll('link[href]')).map((l) => (l.href || '').toLowerCase());
    const allSrc = scripts.concat(links);
    const srcHas = (kw) => allSrc.some((u) => u.includes(kw));

    // Frameworks JS
    if (q('#__next') || q('script#__NEXT_DATA__')) found.add('Next.js');
    if (q('[data-reactroot]') || q('[data-reactid]') || found.has('Next.js')) found.add('React');
    if (q('#__nuxt') || q('[data-nuxt]') || gen.includes('nuxt')) { found.add('Nuxt'); found.add('Vue'); }
    if (q('[data-v-app]') || q('[data-server-rendered]')) found.add('Vue');
    if (q('[ng-version]')) found.add('Angular');
    if (q('astro-island') || q('[data-astro-cid]')) found.add('Astro');
    if (q('[x-data]') || q('[x-show]')) found.add('Alpine.js');
    if (Array.from(document.querySelectorAll('[class]')).slice(0, 400)
      .some((el) => /(^|\s)svelte-[a-z0-9]{4,}/.test(String(el.className)))) found.add('Svelte');

    // Builders / CMS
    if (gen.includes('wordpress') || srcHas('/wp-content/') || srcHas('/wp-includes/')) found.add('WordPress');
    if (q('[data-elementor-type]') || q('.elementor')) found.add('Elementor');
    if (gen.includes('webflow') || html.classList.contains('w-mod-js') || q('[data-wf-page]') || q('[data-wf-site]')) found.add('Webflow');
    if (gen.includes('framer') || q('[data-framer-name]') || srcHas('framerusercontent') || q('#__framer-badge-container')) found.add('Framer');
    if (gen.includes('wix') || srcHas('parastorage') || q('#SITE_CONTAINER')) found.add('Wix');
    if (gen.includes('squarespace') || srcHas('squarespace') || q('.sqs-block')) found.add('Squarespace');
    if (srcHas('cdn.shopify') || srcHas('cdn.shopifycdn') || q('[data-shopify]')) found.add('Shopify');

    // CSS
    let tw = false;
    for (const st of document.querySelectorAll('style')) { if (/--tw-/.test(st.textContent || '')) { tw = true; break; } }
    if (!tw && srcHas('tailwind')) tw = true;
    if (tw) found.add('Tailwind CSS');
    if (srcHas('bootstrap')) found.add('Bootstrap');

    // Bibliotecas de animacao / util
    if (srcHas('gsap') || srcHas('tweenmax') || srcHas('tweenlite')) found.add('GSAP');
    if (srcHas('jquery')) found.add('jQuery');
    if (srcHas('swiper') || q('.swiper-wrapper')) found.add('Swiper');
    if (srcHas('three.min') || srcHas('/three.') || srcHas('three.module')) found.add('Three.js');
    if (srcHas('lottie') || srcHas('bodymovin') || q('lottie-player') || q('dotlottie-player')) found.add('Lottie');
    if (srcHas('rive') || q('[data-rive-file]') || q('[data-rive-object]') || q('[data-rive-primary]')) found.add('Rive');
    if (q('canvas[data-engine*="three" i]') || q('[data-gl]')) found.add('Three.js');
    if (html.classList.contains('lenis') || q('[data-lenis-prevent]')) found.add('Lenis');
    if (srcHas('aos.js') || q('[data-aos]')) found.add('AOS');
    if (srcHas('locomotive') || q('[data-scroll-container]')) found.add('Locomotive Scroll');
    if (srcHas('barba')) found.add('Barba.js');
    if (srcHas('scrollmagic')) found.add('ScrollMagic');

    return Array.from(found);
  }

  // ---------------------------------------------------------------- MSG BRIDGE
  // Um único dispatcher serve tanto o content script normal quanto a bridge CDP.
  async function dispatchDevCloneMessage(msg) {
    try {
      if (!msg || typeof msg.action !== 'string') return { ok: false, ignored: true };
      if (msg.action === 'collect') return { ok: true, data: await collect(msg.options || {}) };
      if (msg.action === 'prime') { await primePage(); return { ok: true }; }
      if (msg.action === 'rewrite') {
        const result = rewrite(msg.pathMap || {}, msg.options || {});
        return { ok: true, ...result };
      }
      if (msg.action === 'domStack') return { ok: true, stack: detectStackDOM() };
      if (msg.action === 'ping') return { ok: true };
      return { ok: false, ignored: true };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  // Quando este source é executado via CDP ele roda no mundo da própria página.
  // Assim o background le e reescreve sem tabs.sendMessage e sem host access.
  try {
    Object.defineProperty(window, '__devclonePageBridge', {
      value: dispatchDevCloneMessage,
      configurable: true,
      writable: false,
      enumerable: false,
    });
  } catch {
    try { window.__devclonePageBridge = dispatchDevCloneMessage; } catch {}
  }

  // Mantém somente respostas síncronas no canal runtime (contexto de extensão,
  // quando presente; fora da extensão este bloco simplesmente não roda).
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        const action = msg && msg.action;
        if (!['rewrite', 'domStack', 'ping'].includes(action)) return false;
        if (action === 'ping') { sendResponse({ ok: true }); return false; }
        if (action === 'domStack') {
          try { sendResponse({ ok: true, stack: detectStackDOM() }); }
          catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
          return false;
        }
        try { sendResponse({ ok: true, ...rewrite(msg.pathMap || {}, msg.options || {}) }); }
        catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        return false;
      });
    }
  } catch {}
})();
