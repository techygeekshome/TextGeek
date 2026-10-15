// TextGeek OCR engine. Runs in the Chrome/Edge offscreen page, or in the Firefox background page.
// Uses the copy of Tesseract.js bundled in vendor/ (worker, WebAssembly core and English data).
// Nothing is downloaded: every path below points at a file inside the extension.
'use strict';

const TG_VENDOR = (typeof chrome !== 'undefined' ? chrome : browser).runtime.getURL('vendor/');
let tgWorker = null, tgWorkerReady = null, tgQueue = Promise.resolve(), tgIdle = null;

function tgGetWorker() {
  if (tgWorkerReady) return tgWorkerReady;
  tgWorkerReady = (async () => {
    const w = await Tesseract.createWorker('eng', 1 /* LSTM only */, {
      workerPath: TG_VENDOR + 'worker.min.js',
      corePath: TG_VENDOR + 'tesseract-core-simd-lstm.js',
      langPath: TG_VENDOR.replace(/\/$/, ''),
      workerBlobURL: false,
      cacheMethod: 'none',
      gzip: true,
    });
    await w.setParameters({ preserve_interword_spaces: '1' });
    tgWorker = w;
    return w;
  })();
  tgWorkerReady.catch(() => { tgWorkerReady = null; });
  return tgWorkerReady;
}

// Free the memory a while after the last job.
function tgScheduleIdle() {
  clearTimeout(tgIdle);
  tgIdle = setTimeout(async () => {
    const w = tgWorker; tgWorker = null; tgWorkerReady = null;
    if (w) try { await w.terminate(); } catch (e) { /* already gone */ }
  }, 120000);
}

function tgLoadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('That picture could not be read.'));
    im.src = src;
  });
}

// Crop (rect is in CSS pixels of a viewport `vw` wide), scale for Tesseract, make it dark text on a light
// background, and pad the edges. Returns a canvas.
function tgPrepare(im, rect, vw) {
  let sx = 0, sy = 0, sw = im.naturalWidth, sh = im.naturalHeight;
  if (rect) {
    const k = vw ? im.naturalWidth / vw : 1;
    sx = Math.max(0, Math.round(rect.x * k)); sy = Math.max(0, Math.round(rect.y * k));
    sw = Math.min(im.naturalWidth - sx, Math.round(rect.w * k)); sh = Math.min(im.naturalHeight - sy, Math.round(rect.h * k));
  }
  if (sw < 3 || sh < 3) throw new Error('That area is too small. Drag a bigger box around the text.');
  // Tesseract reads best when letters are about 30 px tall. Screen text is often 12 to 16 px, so enlarge
  // small pictures, and shrink huge ones so it stays quick.
  let scale = 1;
  const longest = Math.max(sw, sh);
  if (longest < 1600) scale = Math.min(3, 1600 / longest, Math.max(2, 120 / sh));
  if (longest * scale > 4200) scale = 4200 / longest;
  scale = Math.max(scale, 0.25);
  const W = Math.max(1, Math.round(sw * scale)), H = Math.max(1, Math.round(sh * scale));
  const pad = 24;
  const c = document.createElement('canvas'); c.width = W + pad * 2; c.height = H + pad * 2;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(im, sx, sy, sw, sh, pad, pad, W, H);
  // Greyscale, then flip light-on-dark pictures so the text is always dark on light.
  const d = g.getImageData(pad, pad, W, H), p = d.data;
  const lum = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < p.length; i += 4, j++) {
    // see-through pixels count as white
    const a = p[i + 3] / 255;
    lum[j] = Math.round((0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) * a + 255 * (1 - a));
  }
  // background guess: the median of the outer edge
  const edge = [];
  const step = Math.max(1, Math.floor((W + H) / 400));
  for (let x = 0; x < W; x += step) { edge.push(lum[x], lum[(H - 1) * W + x]); }
  for (let y = 0; y < H; y += step) { edge.push(lum[y * W], lum[y * W + W - 1]); }
  edge.sort((a, b) => a - b);
  const bgLum = edge[edge.length >> 1];
  let mean = 0; for (let j = 0; j < lum.length; j++) mean += lum[j]; mean /= lum.length;
  const invert = bgLum < 110 || (bgLum < 140 && mean < 110);
  for (let i = 0, j = 0; i < p.length; i += 4, j++) {
    const v = invert ? 255 - lum[j] : lum[j];
    p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255;
  }
  g.putImageData(d, pad, pad);
  return { canvas: c, inverted: invert, scale };
}

// Turn Tesseract's lines into plain text. keepLines false joins the lines of each paragraph with spaces.
function tgTidy(data, keepLines) {
  const paras = [];
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      // Drop specks the engine is unsure about (a lone dash or letter read from a pattern, not real words).
      const lines = (para.lines || []).filter((l) => !((l.text.match(/[A-Za-z0-9]/g) || []).length < 3 && l.confidence < 60))
        .map((l) => l.text.replace(/\s+$/, '')).filter((t) => t.trim());
      if (!lines.length) continue;
      if (keepLines) paras.push(lines.join('\n'));
      else {
        let s = '';
        for (const l of lines) {
          const t = l.trim();
          if (!s) s = t;
          else if (/[A-Za-z]-$/.test(s) && /^[a-z]/.test(t)) s = s.slice(0, -1) + t;   // word split over two lines
          else s += ' ' + t;
        }
        paras.push(s);
      }
    }
  }
  let text = paras.join(keepLines ? '\n' : '\n\n');
  if (!data.blocks) text = String(data.text || '').trim();   // older output shape: use the plain text
  return text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

// job: { image (data: or blob: URL), rect?, vw?, keepLines }
function tgRecognise(job) {
  const run = async () => {
    clearTimeout(tgIdle);
    const t0 = Date.now();
    try {
      const im = await tgLoadImage(job.image);
      const prep = tgPrepare(im, job.rect, job.vw);
      const w = await tgGetWorker();
      const out = { blocks: true, text: true };
      let r = await w.recognize(prep.canvas, {}, out);
      let text = tgTidy(r.data, job.keepLines !== false);
      // A single word or a short line can confuse the page layout step: try reading it as one line.
      if (!text && prep.canvas.height < 400) {
        await w.setParameters({ tessedit_pageseg_mode: '7' });
        try { r = await w.recognize(prep.canvas, {}, out); text = tgTidy(r.data, true); }
        finally { await w.setParameters({ tessedit_pageseg_mode: '3' }); }
      }
      return { ok: true, text, confidence: Math.round(r.data.confidence || 0), ms: Date.now() - t0, inverted: prep.inverted };
    } finally { tgScheduleIdle(); }
  };
  const p = tgQueue.then(run, run);
  tgQueue = p.catch(() => {});
  return p;
}

// Put text on the clipboard from an extension page (offscreen page in Chrome, background page in Firefox).
async function tgCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  if (!ok && navigator.clipboard) { try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = false; } }
  return ok;
}
