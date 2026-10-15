// Chrome and Edge only: a hidden extension page that reads text from pictures (OCR) and copies it.
'use strict';
chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (!msg || msg.target !== 'tg-offscreen') return;
  (async () => {
    if (msg.type === 'ocr') return await tgRecognise(msg.job);
    if (msg.type === 'copy') return { ok: await tgCopy(msg.text) };
    return { ok: false, error: 'unknown' };
  })().then(send, (e) => send({ ok: false, error: String(e && e.message || e) }));
  return true;
});
