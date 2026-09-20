/* offscreen.js — recebe o .zip em pedacos pequenos (nunca uma string unica gigante,
   que e o que causava "Invalid string length" em sites com muito video/imagem) e
   monta o Blob a partir dos pedacos. Necessario porque o service worker do MV3 nao
   tem URL.createObjectURL. */

const alive = new Set();
let chunks = [];

function b64ToBytes(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return false;
  try {
    if (msg.action === 'zip-start') {
      chunks = [];
      sendResponse({ ok: true });
      return false;
    }
    if (msg.action === 'zip-chunk') {
      chunks.push(b64ToBytes(msg.b64));
      sendResponse({ ok: true });
      return false;
    }
    if (msg.action === 'zip-finish') {
      const blob = new Blob(chunks, { type: 'application/zip' });
      chunks = [];
      const url = URL.createObjectURL(blob);
      alive.add(url);
      sendResponse({ ok: true, url });
      return false;
    }
    if (msg.action === 'revoke') {
      try { URL.revokeObjectURL(msg.url); } catch {}
      alive.delete(msg.url);
      sendResponse({ ok: true });
      return false;
    }
    sendResponse({ ok: false, error: 'unknown_offscreen_action' });
  } catch (e) {
    chunks = [];
    sendResponse({ ok: false, error: String((e && e.message) || e) });
  }
  return false;
});
