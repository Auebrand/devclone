/* popup.js — UI, opcoes e comunicacao com o service worker */

const $ = (id) => document.getElementById(id);
const els = {
  host: $('siteHost'),
  stackRow: $('stackRow'),
  chips: $('chips'),
  opts: $('opts'),
  scopeSeg: $('scopeSeg'),
  depthRow: $('depthRow'),
  depthSeg: $('depthSeg'),
  aiContext: $('aiContext'),
  cloneBtn: $('cloneBtn'),
  progress: $('progress'),
  ring: $('ring'),
  ringVal: $('ringVal'),
  phaseMsg: $('phaseMsg'),
  elapsed: $('elapsed'),
  statFiles: $('statFiles'),
  statSize: $('statSize'),
  result: $('result'),
  resultSub: $('resultSub'),
  errToggle: $('errToggle'),
  errCount: $('errCount'),
  errList: $('errList'),
  againBtn: $('againBtn'),
  errorBox: $('errorBox'),
  errorMsg: $('errorMsg'),
  retryBtn: $('retryBtn'),
};

let options = { scope: 'page', depth: 2, aiContext: true };
let activeTab = null;
let cloneStartedAt = 0;
let progressClock = null;
let projectIntelligenceRecord = null;

// ------- inicializa host e restaura preferencias -------
(async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;
    if (tab && tab.url) {
      try { els.host.textContent = new URL(tab.url).hostname; }
      catch { els.host.textContent = tab.url.slice(0, 40); }
    }
    if (tab && /^(chrome|edge|about|chrome-extension|devtools):/i.test(tab.url || '')) {
      els.host.textContent = 'pagina interna — nao clonavel';
      els.cloneBtn.disabled = true;
    } else if (tab) {
      detectStack(tab.id);
      chrome.runtime.sendMessage({ action: 'projectIntelligence', tabId: tab.id, url: tab.url || '' }, (resp) => {
        if (chrome.runtime.lastError) return;
        if (resp && resp.ok) {
          projectIntelligenceRecord = { tabId: tab.id, intelligence: resp.intelligence };
        }
      });
    }
  } catch { /* ignore */ }

  const saved = await chrome.storage.local.get(['opts']);
  if (saved.opts) {
    options = { ...options, ...saved.opts };
    syncOptionUI();
  }
})();

// ------- deteccao de stack (chips) -------
const STACK_CAT = {
  'React': 'fw', 'Next.js': 'fw', 'Vue': 'fw', 'Nuxt': 'fw', 'Angular': 'fw',
  'Svelte': 'fw', 'Astro': 'fw', 'Alpine.js': 'fw',
  'Webflow': 'builder', 'Framer': 'builder', 'WordPress': 'builder', 'Elementor': 'builder',
  'Wix': 'builder', 'Squarespace': 'builder', 'Shopify': 'builder',
  'Tailwind CSS': 'css', 'Bootstrap': 'css', 'Vite': 'lib', 'Webpack': 'lib',
};
const CAT_COLOR = { fw: '#6c8cff', builder: '#9a6bff', css: '#46e5c8', lib: '#f5b567' };

function renderStack(stack) {
  els.chips.innerHTML = '';
  if (!stack || !stack.length) {
    const c = document.createElement('span');
    c.className = 'chip muted';
    c.innerHTML = '<span class="dot"></span>nao identificada';
    els.chips.appendChild(c);
  } else {
    stack.slice(0, 8).forEach((name, i) => {
      const cat = STACK_CAT[name] || 'lib';
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.setProperty('--cdot', CAT_COLOR[cat]);
      chip.style.animationDelay = `${i * 40}ms`;
      const dot = document.createElement('span'); dot.className = 'dot';
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(name));
      els.chips.appendChild(chip);
    });
  }
  els.stackRow.hidden = false;
}

function detectStack(tabId) {
  chrome.runtime.sendMessage({ action: 'detectStack', tabId }, (resp) => {
    if (chrome.runtime.lastError) return;
    if (resp && resp.ok) renderStack(resp.stack);
  });
}

function syncOptionUI() {
  els.scopeSeg.querySelectorAll('.seg-btn').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.scope === options.scope));
  els.depthRow.hidden = options.scope !== 'site';
  els.depthSeg.querySelectorAll('.seg-btn').forEach((b) =>
    b.classList.toggle('is-active', Number(b.dataset.depth) === options.depth));
  els.aiContext.checked = options.aiContext;
}

function saveOpts() { chrome.storage.local.set({ opts: options }); }

// ------- handlers de opcoes -------
els.scopeSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn'); if (!btn) return;
  options.scope = btn.dataset.scope;
  syncOptionUI(); saveOpts();
});
els.depthSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn'); if (!btn) return;
  options.depth = Number(btn.dataset.depth);
  syncOptionUI(); saveOpts();
});
els.aiContext.addEventListener('change', () => {
  options.aiContext = els.aiContext.checked; saveOpts();
});

// ------- fmt -------
function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes}<small>B</small>`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}<small>KB</small>`;
  return `${(bytes / 1024 / 1024).toFixed(1)}<small>MB</small>`;
}

// ------- estados de UI -------
function setRingIndeterminate() {
  els.ring.classList.add('indet');
  els.ring.style.removeProperty('--p');
  const elapsed = cloneStartedAt ? formatElapsed(Date.now() - cloneStartedAt) : '00:00';
  els.ringVal.innerHTML = `<span class="ring-time">${elapsed}</span>`;
}
function setRingPercent(pct) {
  els.ring.classList.remove('indet');
  els.ring.style.setProperty('--p', String(pct));
  els.ringVal.textContent = `${pct}%`;
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function stopProgressClock() {
  if (progressClock) clearInterval(progressClock);
  progressClock = null;
}

function startProgressClock() {
  stopProgressClock();
  cloneStartedAt = Date.now();
  const update = () => {
    const text = formatElapsed(Date.now() - cloneStartedAt);
    if (els.elapsed) els.elapsed.textContent = `${text} em execução`;
    if (els.ring.classList.contains('indet')) {
      els.ringVal.innerHTML = `<span class="ring-time">${text}</span>`;
    }
  };
  update();
  progressClock = setInterval(update, 1000);
}

function showPhase() {
  els.opts.style.display = 'none';
  els.cloneBtn.style.display = 'none';
  els.progress.hidden = false;
  els.result.hidden = true;
  els.errorBox.hidden = true;
  startProgressClock();
  setRingIndeterminate();
}
function catOf(url) {
  const u = (url || '').toLowerCase().split('?')[0];
  if (/\.(png|jpe?g|webp|avif|gif|svg|ico|bmp)$/.test(u)) return 'imagens';
  if (/\.(mp4|webm|mov|m4v|ogv|mp3|ogg|wav|aac)$/.test(u)) return 'vídeos';
  if (/\.(woff2?|ttf|otf|eot)$/.test(u)) return 'fontes';
  return 'outros';
}

function showResult(r) {
  stopProgressClock();
  els.progress.hidden = true;
  const kb = r.zipBytes / 1024;
  const size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
  const mode = r.captureMode === 'network-original' ? 'captura avançada' : 'modo compatível';
  const remote = r.remainingRemote ? ` · ${r.remainingRemote} referência(s) externa(s)` : '';
  els.resultSub.textContent = `${r.fileCount} itens · ${size} · ${mode}${remote} · baixado`;
  if (r.errors && r.errors.length) {
    const counts = {};
    r.errors.forEach((e) => { const c = catOf(e.url); counts[c] = (counts[c] || 0) + 1; });
    const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`);
    els.errToggle.hidden = false;
    els.errCount.textContent = `${r.errors.length} sem permissão de acesso (${parts.join(', ')})`;
    els.errList.innerHTML =
      '<li class="err-note">Estes arquivos foram bloqueados pelo site. Veja o RELATORIO-TECNICO-DE-CAPTURA.txt dentro do .zip para os detalhes e o que fazer.</li>' +
      r.errors.slice(0, 200)
        .map((e) => `<li>${escapeHtml((e.url.split('/').pop() || e.url).split('?')[0])}</li>`).join('');
  } else {
    els.errToggle.hidden = true;
  }
  els.result.hidden = false;
}
function showError(msg) {
  stopProgressClock();
  els.progress.hidden = true;
  els.errorMsg.textContent = msg;
  els.errorBox.hidden = false;
}
function resetToStart() {
  stopProgressClock();
  cloneStartedAt = 0;
  els.opts.style.display = '';
  els.cloneBtn.style.display = '';
  els.progress.hidden = true;
  els.result.hidden = true;
  els.errorBox.hidden = true;
  els.errList.hidden = true;
  els.errToggle.classList.remove('open');
  els.statFiles.textContent = '0';
  els.statSize.innerHTML = '0<small>KB</small>';
  els.phaseMsg.textContent = 'Preparando…';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ------- aba ativa / disparo -------
function queryActiveTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0] || null);
}

els.cloneBtn.addEventListener('click', async () => {
  els.cloneBtn.disabled = true;
  try {
    const tab = await queryActiveTab();
    activeTab = tab;
    if (!tab || !tab.id || !/^https?:/i.test(tab.url || '')) {
      throw new Error('Esta página não pode ser clonada. Abra um site http ou https em uma aba normal do navegador.');
    }

    showPhase();
    const intelligentOptions = { ...options };
    if (projectIntelligenceRecord?.tabId === tab.id && projectIntelligenceRecord?.intelligence?.strategy) {
      intelligentOptions.captureProfile = projectIntelligenceRecord.intelligence.strategy.profile;
      intelligentOptions.remoteRulesVersion = projectIntelligenceRecord.intelligence.rulesVersion;
    }
    chrome.runtime.sendMessage(
      { action: 'startClone', tabId: tab.id, sourceUrl: tab.url || '', options: intelligentOptions },
      (resp) => {
        const err = chrome.runtime.lastError;
        if (err) {
          showError(`Falha ao iniciar o motor de captura: ${err.message}`);
          return;
        }
        if (!resp || !resp.ok) {
          showError((resp && resp.error) || 'O motor de captura não respondeu. Recarregue a extensão e tente novamente.');
        }
      }
    );
  } catch (e) {
    showError(String((e && e.message) || e || 'Não foi possível iniciar a clonagem.'));
  } finally {
    els.cloneBtn.disabled = false;
  }
});

els.errToggle.addEventListener('click', () => {
  const open = els.errList.hidden;
  els.errList.hidden = !open;
  els.errToggle.classList.toggle('open', open);
});
els.againBtn.addEventListener('click', resetToStart);
els.retryBtn.addEventListener('click', resetToStart);

// ------- progresso vindo do background -------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'stackDetected') {
    if (!activeTab || !msg.tabId || msg.tabId === activeTab.id) renderStack(msg.stack || []);
  } else if (msg.action === 'progress') {
    const p = msg.payload;
    if (p.message) els.phaseMsg.textContent = p.message;
    if (typeof p.count === 'number') els.statFiles.textContent = String(p.count);
    if (typeof p.bytes === 'number') els.statSize.innerHTML = fmtSize(p.bytes);
    if (typeof p.percent === 'number' && p.percent >= 0) setRingPercent(Math.min(100, p.percent));
    else if (p.phase && p.phase !== 'downloading') setRingIndeterminate();
  } else if (msg.action === 'done') {
    setRingPercent(100);
    showResult(msg.payload);
  } else if (msg.action === 'error') {
    showError(msg.payload.message);
  }
});