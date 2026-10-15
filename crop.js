// TextGeek fallback page: used where the selection box can't be added to the page itself
// (for example the browser's built-in PDF viewer). Shows the screenshot so you can drag a box on it.
'use strict';
const api = typeof browser !== 'undefined' ? browser : chrome;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.hash.slice(1).replace(/^([^&=]+)(&|$)/, 'id=$1$2'));
const id = params.get('id');
const img = $('shot'), stage = $('stage'), sel = $('sel');

function setStatus(t, cls) { $('status').textContent = t; $('status').className = 'status grow ' + (cls || ''); }
function show(res) {
  $('result').hidden = false;
  if (!res || !res.ok) { $('text').value = (res && res.error) || 'The text could not be read.'; setStatus('Something went wrong', 'bad'); return; }
  $('text').value = res.text;
  if (!res.text) setStatus('No text found. Try a bigger box.', 'bad');
  else setStatus(res.copied ? 'Copied to clipboard' : 'Ready to copy', res.copied ? 'ok' : '');
}
async function read(rect) {
  $('result').hidden = false; $('text').value = ''; setStatus('Reading text...');
  let res;
  try { res = await api.runtime.sendMessage({ type: 'tg-region', id, rect, vw: rect ? img.naturalWidth : 0, keep: true }); }
  catch (e) { res = { ok: false, error: String(e.message || e) }; }
  show(res);
}
$('copy').onclick = async () => {
  let ok = false;
  try { await navigator.clipboard.writeText($('text').value); ok = true; } catch (e) { ok = false; }
  if (!ok) { try { ok = !!(await api.runtime.sendMessage({ type: 'tg-copy', text: $('text').value })).ok; } catch (e) { ok = false; } }
  setStatus(ok ? 'Copied to clipboard' : 'Could not copy: select the text and press Ctrl+C', ok ? 'ok' : 'bad');
};
$('all').onclick = () => read(null);

let sx = 0, sy = 0, drag = false;
function pos(e) { const b = img.getBoundingClientRect(); return [Math.min(Math.max(e.clientX - b.left, 0), b.width), Math.min(Math.max(e.clientY - b.top, 0), b.height)]; }
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return; e.preventDefault(); drag = true; [sx, sy] = pos(e);
  try { stage.setPointerCapture(e.pointerId); } catch (x) { /* fine */ }
  Object.assign(sel.style, { display: 'block', left: sx + 'px', top: sy + 'px', width: '0px', height: '0px' });
});
stage.addEventListener('pointermove', (e) => {
  if (!drag) return; const [x, y] = pos(e);
  Object.assign(sel.style, { left: Math.min(sx, x) + 'px', top: Math.min(sy, y) + 'px', width: Math.abs(x - sx) + 'px', height: Math.abs(y - sy) + 'px' });
});
stage.addEventListener('pointerup', (e) => {
  if (!drag) return; drag = false; const [x, y] = pos(e);
  const w = Math.abs(x - sx), h = Math.abs(y - sy);
  if (w < 6 || h < 6) { sel.style.display = 'none'; return; }
  // turn screen pixels into picture pixels
  const k = img.naturalWidth / img.getBoundingClientRect().width;
  read({ x: Math.min(sx, x) * k, y: Math.min(sy, y) * k, w: w * k, h: h * k });
});

(async () => {
  let r = null;
  try { r = await api.runtime.sendMessage({ type: 'tg-get-shot', id }); } catch (e) { r = null; }
  if (!r || !r.ok) { stage.hidden = true; $('gone').hidden = false; $('all').hidden = true; return; }
  img.src = r.shot;
  if (params.get('text') != null) show({ ok: true, text: params.get('text'), copied: false });
})();
