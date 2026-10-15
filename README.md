# TextGeek: Copy Text from Images

Drag a box over anything you can see in your browser (a picture, a paused or playing video, a screenshot, a scanned PDF) and TextGeek copies the text in it. The text is read on your own computer. Nothing is uploaded.

**Download and full guide:** https://techygeekshome.info/browser-extensions/textgeek/

## What it does

- **Drag a box over text**: click the TextGeek button or press **Alt+Shift+O**, then drag a box around the words. The page holds still while you choose, so moving videos and animations stay put.
- **Copied straight away**: the text goes on your clipboard, ready to paste.
- **A small panel** shows what was read, so you can fix a word and press **Copy** again, or **Select again**.
- **Right-click a picture** and choose **Copy text from image** to read the whole picture.
- **Works on light and dark backgrounds**, small screen text, code and terminal windows, photos of labels and scanned pages.
- **Scanned PDFs**: works in the browser's PDF viewer. Where a page won't take the selection box, TextGeek opens a copy of the screenshot in its own tab so you can drag the box there.
- **Settings**: copy straight away (on by default) and keep line breaks (turn off to join each paragraph into one line).

## What it won't do

- It reads English only for now. Other languages are not included.
- It can't read the browser's own pages (settings, add-on stores, new tab page). Browsers keep those off limits to every extension.
- It reads what is on screen. Text that is scrolled out of view, or very tiny, needs scrolling or zooming in first.
- Handwriting and fancy display fonts are hit and miss. Clear printed or on-screen text works best.

## Install

Pick the download for your browser from the [latest release](https://github.com/techygeekshome/TextGeek/releases/latest).

| Browser | Download |
|---|---|
| Chrome, Brave, Opera, Vivaldi | `TextGeek-chrome.zip` |
| Microsoft Edge | `TextGeek-edge.zip` |
| Firefox (142 or newer) | `TextGeek-firefox.zip` |

`TextGeek.zip` is the same package as the Chrome and Edge downloads.

### Chrome, Edge, Brave, Opera and Vivaldi

1. Unzip the download somewhere you'll keep it.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the `textgeek` folder.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and pick `TextGeek-firefox.zip`.

Firefox removes temporary add-ons when it closes.

### Build it yourself

The code in this repo is the Chromium version. `manifest.firefox.json` is the Firefox manifest. Run `./build.sh` to make every package in `dist/`.

## Use

1. Click the TextGeek button (or press **Alt+Shift+O**).
2. Drag a box around the text you want. Press **Esc** to cancel.
3. The text is copied. Paste it wherever you like.
4. To read a whole picture, right-click it and choose **Copy text from image**.

You can change the shortcut on your browser's extension shortcuts page.

## How it works

- When you click the button, TextGeek takes a screenshot of the visible part of the tab (`captureVisibleTab`, allowed by `activeTab` for that tab only) and shows it frozen under a selection box (`select.js`, added to the page only when you ask, inside a closed shadow root).
- The part you pick is cut out, enlarged, turned to grey and flipped to dark-on-light if needed, then read by **Tesseract** (`ocr.js`).
- In Chrome and Edge the reading happens in a hidden offscreen page (`offscreen.html`). In Firefox it happens in the add-on's background page.
- The OCR engine is bundled: `vendor/` holds Tesseract.js 5.1.1 (`tesseract.min.js`, `worker.min.js`), its WebAssembly core (`tesseract-core-simd-lstm.js` and `.wasm`) and the English data (`eng.traineddata.gz`, 4.0.0 best_int). All paths point inside the extension. The CDN addresses built into Tesseract.js were replaced with a local path, so it can never download anything. See `vendor/LICENSE-tesseract.txt`.
- For "Copy text from image", TextGeek reads the picture from the page. If the site does not allow that, it reads the picture as it shows on screen.
- The extension pages use `script-src 'self' 'wasm-unsafe-eval'`, which lets the bundled WebAssembly run and nothing else.

## Privacy

TextGeek has no account, no analytics and makes no network requests of its own. Screenshots and text stay in your browser's memory and are thrown away after use. The only thing it saves is your two settings.

## Licence

GPL-3.0. Free for everyone, including commercial use. The bundled Tesseract.js, tesseract.js-core and English trained data are under the Apache License 2.0.

TextGeek is an independent tool made by [TechyGeeksHome](https://techygeekshome.info).
