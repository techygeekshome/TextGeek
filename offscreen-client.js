// Chrome and Edge only: opens the hidden offscreen page that reads text from pictures, and closes it when idle.
'use strict';
let offscreenReady = null, offscreenIdle = null, offscreenBusy = 0;
async function ensureOffscreen() {
  if (offscreenReady) return offscreenReady;
  offscreenReady = (async () => {
    const have = chrome.runtime.getContexts ? await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }) : [];
    if (!have.length) {
      await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['WORKERS', 'CLIPBOARD'],
        justification: 'Read text from a picture on this computer and copy it to the clipboard.' });
    }
  })();
  try { await offscreenReady; } catch (e) { offscreenReady = null; throw e; }
  return offscreenReady;
}
function closeOffscreenLater() {
  clearTimeout(offscreenIdle);
  offscreenIdle = setTimeout(async () => {
    if (offscreenBusy) return;
    offscreenReady = null;
    try { await chrome.offscreen.closeDocument(); } catch (e) { /* already closed */ }
  }, 180000);
}
async function offscreenEngine(type, payload) {
  offscreenBusy++; clearTimeout(offscreenIdle);
  try {
    await ensureOffscreen();
    const r = await chrome.runtime.sendMessage(Object.assign({ target: 'tg-offscreen', type }, payload));
    if (!r) throw new Error('The text reader did not answer. Please try again.');
    return r;
  } finally { offscreenBusy--; closeOffscreenLater(); }
}
