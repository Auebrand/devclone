/**
 * Bridge de DOM via Chrome Debugger/CDP.
 * Não depende de host_permissions, chrome.scripting ou tabs.sendMessage.
 */
const CDP_VERSION = '1.3';
let sourcePromise = null;

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
  return new Promise((resolve) => chrome.debugger.detach(debuggee, () => resolve()));
}

function exceptionText(result) {
  const details = result && result.exceptionDetails;
  if (!details) return '';
  return (details.exception && details.exception.description) || details.text || 'erro no contexto da página';
}

async function source() {
  if (!sourcePromise) {
    sourcePromise = fetch(chrome.runtime.getURL('content.js')).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} ao carregar content.js`);
      return response.text();
    });
  }
  return sourcePromise;
}

async function ensureBridge(debuggee) {
  await cdp(debuggee, 'Runtime.enable');
  let check = await cdp(debuggee, 'Runtime.evaluate', {
    expression: 'typeof window.__devclonePageBridge === "function"',
    returnByValue: true,
  });
  if (check && check.result && check.result.value === true) return;

  const js = await source();
  const injected = await cdp(debuggee, 'Runtime.evaluate', {
    expression: `${js}\n//# sourceURL=devclone-cdp-page-bridge.js`,
    returnByValue: false,
    userGesture: true,
  });
  const error = exceptionText(injected);
  if (error) throw new Error(`cdp_bridge_injection_failed: ${error}`);

  check = await cdp(debuggee, 'Runtime.evaluate', {
    expression: 'typeof window.__devclonePageBridge === "function"',
    returnByValue: true,
  });
  if (!check || !check.result || check.result.value !== true) throw new Error('cdp_bridge_unavailable');
}

export async function callPageBridgeViaDebugger(tabId, message) {
  const debuggee = { tabId };
  let attached = false;
  try {
    await attach(debuggee);
    attached = true;
    await ensureBridge(debuggee);
    const bridge = await cdp(debuggee, 'Runtime.evaluate', {
      expression: 'window.__devclonePageBridge',
      returnByValue: false,
    });
    const lookupError = exceptionText(bridge);
    if (lookupError) throw new Error(`cdp_bridge_lookup_failed: ${lookupError}`);
    const objectId = bridge && bridge.result && bridge.result.objectId;
    if (!objectId) throw new Error('cdp_bridge_object_missing');

    const result = await cdp(debuggee, 'Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: 'function(message) { return this(message); }',
      arguments: [{ value: message }],
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    const callError = exceptionText(result);
    if (callError) throw new Error(`cdp_bridge_call_failed: ${callError}`);
    return result && result.result ? result.result.value : undefined;
  } finally {
    if (attached) await detach(debuggee);
  }
}

// captureNetworkSession já está com debugger anexado ao chamar este callback.
export async function primePageViaAttachedDebugger(tabId) {
  const debuggee = { tabId };
  const expression = `
    (async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
      return true;
    })()
  `;
  const result = await cdp(debuggee, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  const error = exceptionText(result);
  if (error) throw new Error(`cdp_prime_failed: ${error}`);
}
