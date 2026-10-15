// TextGeek page tool: the drag-a-box overlay and the small text panel. Added to a page only when you ask
// (toolbar button, shortcut or right-click menu). Lives in a closed shadow root so the page can't read it.
(() => {
  'use strict';
  if (window.__textgeekLoaded) return;
  window.__textgeekLoaded = true;
  const api = typeof browser !== 'undefined' ? browser : chrome;

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.ov { position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair; background-size: 100% 100%; background-repeat: no-repeat; user-select: none; touch-action: none; }
.dim { position: absolute; inset: 0; background: rgba(8, 20, 28, .42); }
.box { position: absolute; border: 2px solid #22d3ee; box-shadow: 0 0 0 9999px rgba(8, 20, 28, .42); border-radius: 3px; display: none; }
.box::after { content: ''; position: absolute; inset: 0; outline: 1px dashed rgba(255,255,255,.85); outline-offset: -5px; }
.hint { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); background: #0f1d24; color: #fff; padding: 9px 16px; border-radius: 999px;
  font: 600 14px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.35); pointer-events: none; white-space: nowrap; }
.hint b { color: #67e8f9; }
.panel { --bg: #fff; --text: #1a1a1a; --muted: #666; --line: #dfe6ea; --accent: #0891b2; --accent-text: #fff; --ok: #15803d; --bad: #c62828;
  position: fixed; z-index: 2147483647; width: 380px; max-width: calc(100vw - 24px); background: var(--bg); color: var(--text); border: 1px solid var(--line);
  border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.28); font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
@media (prefers-color-scheme: dark) {
  .panel { --bg: #18212a; --text: #eef4f6; --muted: #9aabb5; --line: #2b3a44; --accent: #22d3ee; --accent-text: #062a33; --ok: #4ade80; --bad: #f87171; }
}
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px 8px; }
.head img { width: 20px; height: 20px; }
.brand { font-weight: 800; color: var(--accent); letter-spacing: .02em; }
.status { flex: 1; color: var(--muted); font-weight: 600; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status.ok { color: var(--ok); } .status.bad { color: var(--bad); }
.x { all: unset; cursor: pointer; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 6px; color: var(--muted); font-size: 18px; line-height: 1; }
.x:hover { background: rgba(127,127,127,.15); color: var(--text); }
textarea { display: block; width: calc(100% - 24px); margin: 0 12px; min-height: 96px; max-height: 50vh; resize: vertical; padding: 8px 10px; border-radius: 9px;
  border: 1px solid var(--line); background: transparent; color: var(--text); font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.busy { display: flex; align-items: center; gap: 10px; margin: 2px 12px 4px; padding: 16px 12px; border-radius: 9px; border: 1px dashed var(--line); color: var(--muted); font-weight: 600; }
.spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line); border-top-color: var(--accent); animation: s .8s linear infinite; }
@keyframes s { to { transform: rotate(360deg); } }
.foot { display: flex; gap: 8px; align-items: center; padding: 10px 12px 12px; }
.foot .muted { color: var(--muted); font-size: 12px; flex: 1; }
button.b { all: unset; cursor: pointer; font-weight: 700; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--line); color: var(--text); }
button.b.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
button.b:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
[hidden] { display: none !important; }
`;

  let host = null, root = null, overlay = null, panel = null, lastRect = null, lastId = null;
  function ensureRoot() {
    if (host && host.isConnected) return;
    host = document.createElement('textgeek-ui');
    host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
    root = host.attachShadow({ mode: 'closed' });
    const st = document.createElement('style'); st.textContent = CSS; root.appendChild(st);
    (document.body || document.documentElement).appendChild(host);
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---------- the overlay ----------
  function closeOverlay() { if (overlay) { overlay.remove(); overlay = null; } document.removeEventListener('keydown', onKey, true); }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (overlay) { closeOverlay(); api.runtime.sendMessage({ type: 'tg-cancel', id: lastId }).catch(() => {}); }
      else closePanel();
    }
  }
  function showOverlay(id, shot) {
    ensureRoot(); closeOverlay(); closePanel(); lastId = id;
    overlay = el('div', 'ov');
    // Show the moment you clicked, frozen, so a moving video or animation holds still while you choose.
    overlay.style.backgroundImage = `url("${shot}")`;
    // The screenshot includes the scroll bar, so cover the whole window, not just the page area.
    overlay.style.width = window.innerWidth + 'px'; overlay.style.height = window.innerHeight + 'px';
    overlay.style.right = 'auto'; overlay.style.bottom = 'auto';
    const dim = el('div', 'dim'), box = el('div', 'box'), hint = el('div', 'hint');
    hint.append('Drag a box around the text. ', el('b', null, 'Esc'), ' to cancel.');
    overlay.append(dim, box, hint); root.appendChild(overlay);
    let sx = 0, sy = 0, drag = false;
    const rectOf = (x, y) => ({ x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) });
    overlay.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); drag = true; sx = e.clientX; sy = e.clientY;
      try { overlay.setPointerCapture(e.pointerId); } catch (x) { /* fine */ }
      dim.style.display = 'none'; box.style.display = 'block'; hint.style.display = 'none';
      Object.assign(box.style, { left: sx + 'px', top: sy + 'px', width: '0px', height: '0px' });
    });
    overlay.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = rectOf(e.clientX, e.clientY);
      Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    });
    overlay.addEventListener('pointerup', (e) => {
      if (!drag) return; drag = false;
      const r = rectOf(e.clientX, e.clientY);
      if (r.w < 6 || r.h < 6) { dim.style.display = ''; box.style.display = 'none'; hint.style.display = ''; return; }
      closeOverlay(); read(id, r);
    });
    overlay.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', onKey, true);
  }

  async function read(id, r) {
    lastRect = r;
    showPanel(r, 'busy');
    let res;
    try { res = await api.runtime.sendMessage({ type: 'tg-region', id, rect: r, vw: window.innerWidth }); }
    catch (e) { res = { ok: false, error: 'TextGeek stopped while reading. Please try again.' }; }
    showResult(res);
  }

  // ---------- the panel ----------
  function closePanel() { if (panel) { panel.remove(); panel = null; } if (!overlay) document.removeEventListener('keydown', onKey, true); }
  function place(r) {
    const W = Math.min(380, window.innerWidth - 24), gap = 10, H = 220;
    let x = r ? Math.min(Math.max(12, r.x), window.innerWidth - W - 12) : window.innerWidth - W - 16;
    let y = r ? r.y + r.h + gap : window.innerHeight - H - 16;
    if (r && y + H > window.innerHeight - 8) y = r.y - H - gap;
    if (y < 8) y = Math.max(8, window.innerHeight - H - 16);
    panel.style.left = x + 'px'; panel.style.top = y + 'px';
  }
  function showPanel(r, state) {
    ensureRoot(); closePanel();
    panel = el('div', 'panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'TextGeek');
    const head = el('div', 'head');
    const ic = el('img'); ic.src = 'data:image/png;base64,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';   // filled in by build.py (a data: address, so no file has to be web accessible) ic.alt = '';
    const status = el('div', 'status', 'Reading text...'); status.setAttribute('aria-live', 'polite');
    const x = el('button', 'x', '×'); x.title = 'Close (Esc)'; x.setAttribute('aria-label', 'Close'); x.onclick = closePanel;
    head.append(ic, el('span', 'brand', 'TextGeek'), status, x);
    const busy = el('div', 'busy'); busy.append(el('span', 'spin'), el('span', null, 'Reading the text on your computer...'));
    const ta = el('textarea'); ta.hidden = true; ta.spellcheck = false; ta.setAttribute('aria-label', 'Text found');
    const foot = el('div', 'foot'); foot.hidden = true;
    const info = el('span', 'muted');
    const again = el('button', 'b', 'Select again'); again.onclick = () => { closePanel(); api.runtime.sendMessage({ type: 'tg-again' }).catch(() => {}); };
    const copy = el('button', 'b primary', 'Copy'); copy.onclick = () => copyText(ta.value, status);
    foot.append(info, again, copy);
    panel.append(head, busy, ta, foot);
    root.appendChild(panel); place(r);
    panel._parts = { status, busy, ta, foot, info, again, copy };
    document.addEventListener('keydown', onKey, true);
  }
  function showResult(res) {
    if (!panel) showPanel(lastRect, 'busy');
    const p = panel._parts;
    p.busy.hidden = true; p.foot.hidden = false; p.again.hidden = !lastRect;
    if (!res || !res.ok) {
      p.status.textContent = 'Something went wrong'; p.status.className = 'status bad';
      p.ta.hidden = false; p.ta.value = (res && res.error) || 'The text could not be read.'; p.copy.hidden = true;
      return;
    }
    p.ta.hidden = false; p.ta.value = res.text;
    if (!res.text) {
      p.status.textContent = 'No text found'; p.status.className = 'status bad';
      p.ta.placeholder = 'No text was found here. Try a bigger box, or zoom the page in so the words are larger.';
      p.copy.hidden = true;
    } else {
      p.status.textContent = res.copied ? 'Copied to clipboard' : 'Ready to copy'; p.status.className = 'status' + (res.copied ? ' ok' : '');
      const words = res.text.split(/\s+/).filter(Boolean).length;
      p.info.textContent = `${words} word${words === 1 ? '' : 's'}` + (res.confidence ? `, ${res.confidence}% sure` : '');
      p.ta.focus(); p.ta.setSelectionRange(0, 0);
    }
    panel.dataset.state = res.text ? 'done' : 'empty';
  }
  async function copyText(text, status) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = false; }
    if (!ok) {
      try { const r = await api.runtime.sendMessage({ type: 'tg-copy', text }); ok = !!(r && r.ok); } catch (e) { ok = false; }
    }
    status.textContent = ok ? 'Copied to clipboard' : 'Could not copy: select the text and press Ctrl+C';
    status.className = 'status ' + (ok ? 'ok' : 'bad');
  }

  // ---------- right-click on a picture ----------
  function findImage(src) {
    const all = [...document.images, ...document.querySelectorAll('image, input[type=image]')];
    const match = all.filter((i) => i.currentSrc === src || i.src === src || (i.href && i.href.baseVal === src));
    const vis = match.find((i) => { const b = i.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > 0 && b.right > 0 && b.top < innerHeight && b.left < innerWidth; });
    return vis || match[0] || null;
  }
  function blobToDataUrl(b) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  }
  async function grab(src, img) {
    if (/^data:image\//i.test(src)) return src;
    try {
      const r = await fetch(src, { credentials: 'include' });
      if (r.ok) { const b = await r.blob(); if (b.size && (!b.type || /^image\//i.test(b.type))) return await blobToDataUrl(b); }
    } catch (e) { /* the server does not allow it: try another way */ }
    if (img && img.tagName === 'IMG' && img.complete && img.naturalWidth) {
      try {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/png');
      } catch (e) { /* picture from another site: the browser won't let us read it */ }
    }
    return null;
  }
  async function onImage(src) {
    const img = findImage(src);
    let rect = null;
    if (img) {
      const b = img.getBoundingClientRect();
      const x = Math.max(0, b.left), y = Math.max(0, b.top), x2 = Math.min(innerWidth, b.right), y2 = Math.min(innerHeight, b.bottom);
      if (x2 - x > 4 && y2 - y > 4) rect = { x, y, w: x2 - x, h: y2 - y };
    }
    lastRect = null;
    showPanel(rect, 'busy');
    return { dataUrl: await grab(src, img), rect, vw: innerWidth, top: window === window.top };
  }

  api.runtime.onMessage.addListener((msg, sender, send) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'tg-hide') {
      closeOverlay(); closePanel();
      // wait until the page has been redrawn without our panel
      let done = false; const fin = () => { if (!done) { done = true; send({ ok: true }); } };
      requestAnimationFrame(() => requestAnimationFrame(fin)); setTimeout(fin, 150);
      return true;
    }
    if (msg.type === 'tg-select') { showOverlay(msg.id, msg.shot); send({ ok: true }); return; }
    if (msg.type === 'tg-image') { onImage(msg.src).then(send, () => send({})); return true; }
    if (msg.type === 'tg-result') { showResult(msg.result); return; }
  });
})();
