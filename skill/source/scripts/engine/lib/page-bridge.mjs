/**
 * page-bridge.mjs — injeta uma cópia vendorizada e não modificada de
 * content.js na página do Playwright e fala com ela exatamente como
 * cdp-bridge.js faz na extensão (Runtime.evaluate/callFunctionOn ->
 * aqui, page.addScriptTag + page.evaluate).
 *
 * content.js já se expõe como window.__devclonePageBridge, sem depender
 * de chrome.runtime para as ações 'collect' e 'rewrite' — por isso pode
 * ser reutilizado sem nenhuma alteração fora do contexto da extensão.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_JS_PATH = path.join(__dirname, '..', 'vendor', 'content.js');

let contentJsSourceCache = null;
async function loadContentJsSource() {
  if (!contentJsSourceCache) contentJsSourceCache = await readFile(CONTENT_JS_PATH, 'utf8');
  return contentJsSourceCache;
}

export async function ensureBridge(page) {
  const already = await page.evaluate(() => typeof window.__devclonePageBridge === 'function').catch(() => false);
  if (already) return;
  const source = await loadContentJsSource();
  await page.addScriptTag({ content: source });
  const ok = await page.evaluate(() => typeof window.__devclonePageBridge === 'function');
  if (!ok) throw new Error('content_bridge_unavailable');
}

export async function callBridge(page, message) {
  await ensureBridge(page);
  return page.evaluate((msg) => window.__devclonePageBridge(msg), message);
}
