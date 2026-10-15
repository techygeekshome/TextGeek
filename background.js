// TextGeek: drag a box over anything on the page, or right-click a picture, and copy the text in it.
// Text is read on your computer with the bundled Tesseract OCR engine. Nothing is sent anywhere.
'use strict';

const LOCAL = typeof tgRecognise === 'function';   // Firefox: the OCR engine is loaded in this background page
const DEFAULTS = { autoCopy: true, keepLines: true };
const shots = new Map();   // id -> { shot, tabId, t }

async function getOpts() {
  try { return Object.assign({}, DEFAULTS, await chrome.storage.local.get(DEFAULTS)); } catch (e) { return Object.assign({}, DEFAULTS); }
}

// ---------- OCR engine: offscreen page in Chrome and Edge (offscreen-client.js), this page in Firefox ----------
if (!LOCAL) importScripts('offscreen-client.js');
async function engine(type, payload) {
  if (LOCAL) return type === 'ocr' ? tgRecognise(payload.job) : { ok: await tgCopy(payload.text) };
  return offscreenEngine(type, payload);
}
async function ocr(job) {
  const o = await getOpts();
  job.keepLines = o.keepLines;
  const r = await engine('ocr', { job });
  if (!r.ok) throw new Error(r.error || 'The text could not be read.');
  r.copied = false;
  if (o.autoCopy && r.text) {
    try { r.copied = !!(await engine('copy', { text: r.text })).ok; } catch (e) { r.copied = false; }
  }
  flash(r.text ? (r.copied ? 'ok' : 'done') : 'none');
  return r;
}

// ---------- toolbar badge: a short flash so you know it worked ----------
let flashTimer = null;
function flash(kind, tabId) {
  const map = { ok: ['OK', '#16a34a'], done: ['OK', '#16a34a'], none: ['0', '#6b7280'], err: ['!', '#c62828'] };
  const [t, c] = map[kind] || map.err;
  try {
    chrome.action.setBadgeBackgroundColor({ color: c });
    chrome.action.setBadgeText({ text: t });
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
  } catch (e) { /* not important */ }
}

// ---------- helpers ----------
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function bytesToDataUrl(u, type) {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return `data:${type || 'image/png'};base64,${btoa(s)}`;
}
function keepShot(shot, tabId) {
  const now = Date.now();
  for (const [k, v] of shots) if (now - v.t > 600000) shots.delete(k);   // drop anything older than 10 minutes
  while (shots.size > 4) shots.delete(shots.keys().next().value);
  const id = newId(); shots.set(id, { shot, tabId, t: now }); return id;
}
async function capture(windowId) {
  return chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
}
function fail(msg) {
  flash('err');
  try { chrome.action.setTitle({ title: 'TextGeek: ' + msg }); setTimeout(() => chrome.action.setTitle({ title: TITLE }), 8000); } catch (e) { /* ignore */ }
}
const TITLE = 'TextGeek: drag a box over text to copy it';

// ---------- 1. drag a box over the page ----------
async function startSelect(tab) {
  if (!tab || tab.id == null) return;
  // Add the page tool first, so it can hide any panel left from last time before the screenshot.
  let injected = false;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['select.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'tg-hide' }, { frameId: 0 });
    injected = true;
  } catch (e) { injected = false; }
  let shot;
  try { shot = await capture(tab.windowId); }
  catch (e) { fail("this page can't be read. Browsers keep their own pages (settings, add-on stores) off limits."); return { ok: false, error: String(e.message || e) }; }
  const id = keepShot(shot, tab.id);
  if (injected) {
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: 'tg-select', id, shot }, { frameId: 0 });
      if (r && r.ok) return { ok: true, id, mode: 'page' };
    } catch (e) { /* fall through to our own page */ }
  }
  // Pages we can't add the box to (built-in PDF viewer, some browser pages): use our own page instead.
  await chrome.tabs.create({ url: chrome.runtime.getURL('crop.html') + '#' + id, index: tab.index + 1, openerTabId: tab.id });
  return { ok: true, id, mode: 'crop' };
}

// ---------- 2. right-click a picture ----------
async function fetchFromExtension(src) {
  if (!/^https?:/i.test(src)) return null;
  try {
    const r = await fetch(src, { credentials: 'omit', cache: 'force-cache' });
    if (!r.ok) return null;
    const type = (r.headers.get('content-type') || '').split(';')[0];
    if (type && !/^image\//i.test(type)) return null;
    return bytesToDataUrl(new Uint8Array(await r.arrayBuffer()), type || 'image/png');
  } catch (e) { return null; }
}
async function readImage(info, tab) {
  const frameId = info.frameId || 0, src = info.srcUrl || '';
  let got = null, injected = false;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [frameId] }, files: ['select.js'] });
    injected = true;
    got = await chrome.tabs.sendMessage(tab.id, { type: 'tg-image', src }, { frameId });
  } catch (e) { got = null; }
  const send = (m) => injected ? chrome.tabs.sendMessage(tab.id, m, { frameId }).catch(() => {}) : null;
  try {
    let job = null, how = '';
    if (got && got.dataUrl) { job = { image: got.dataUrl }; how = 'page'; }
    if (!job) { const d = await fetchFromExtension(src); if (d) { job = { image: d }; how = 'extension'; } }
    if (!job && got && got.rect && got.top) {
      // Last resort: the picture as it shows on screen.
      const shot = await capture(tab.windowId);
      job = { image: shot, rect: got.rect, vw: got.vw }; how = 'screen';
    }
    if (!job) throw new Error('TextGeek could not read this picture. Try the drag-a-box tool instead (click the TextGeek button).');
    const r = await ocr(job); r.how = how;
    if (injected) send({ type: 'tg-result', result: r });
    else {
      const id = keepShot(job.image, tab.id);
      await chrome.tabs.create({ url: chrome.runtime.getURL('crop.html') + '#' + id + '&text=' + encodeURIComponent(r.text), index: tab.index + 1 });
    }
    return r;
  } catch (e) {
    flash('err');
    send({ type: 'tg-result', result: { ok: false, error: String(e.message || e) } });
    return { ok: false, error: String(e.message || e) };
  }
}

// ---------- events ----------
function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'tg-image', title: 'Copy text from image', contexts: ['image'] });
    chrome.contextMenus.create({ id: 'tg-area', title: 'Copy text from part of the page', contexts: ['page', 'selection', 'link', 'video', 'frame'] });
  });
}
chrome.runtime.onInstalled.addListener(setupMenus);
chrome.runtime.onStartup.addListener(setupMenus);
chrome.action.onClicked.addListener((tab) => { startSelect(tab); });
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'tg-image') readImage(info, tab);
  else if (info.menuItemId === 'tg-area') startSelect(tab);
});

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (!msg || msg.target === 'tg-offscreen') return;
  if (msg.type === 'tg-region') {
    const s = shots.get(msg.id);
    if (!s) { send({ ok: false, error: 'That screenshot has gone. Please click TextGeek again.' }); return; }
    if (!msg.keep) shots.delete(msg.id);
    ocr({ image: s.shot, rect: msg.rect, vw: msg.vw }).then(send, (e) => send({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === 'tg-get-shot') {
    const s = shots.get(msg.id);
    send(s ? { ok: true, shot: s.shot } : { ok: false });
    return;
  }
  if (msg.type === 'tg-copy') {
    engine('copy', { text: String(msg.text || '') }).then(send, () => send({ ok: false }));
    return true;
  }
  if (msg.type === 'tg-cancel') { shots.delete(msg.id); return; }
  if (msg.type === 'tg-again' && sender.tab) { setTimeout(() => startSelect(sender.tab), 150); return; }
});
