#!/usr/bin/env bash
# Builds the release packages into dist/.
#   TextGeek.zip          Chrome, Edge, Brave, Opera, Vivaldi (unzip, then Load unpacked)
#   TextGeek-chrome.zip   same files, named for Chrome users
#   TextGeek-edge.zip     same files, named for Edge users
#   TextGeek-firefox.zip  Firefox package (Firefox manifest, files at the root, no offscreen page)
set -euo pipefail
cd "$(dirname "$0")"
FILES="background.js ocr.js select.js crop.html crop.js options.html options.js page.css icons vendor"
CHROMIUM_ONLY="offscreen.html offscreen.js offscreen-client.js"
OUT=dist; TMP=$(mktemp -d)
mkdir -p "$OUT"
rm -f "$OUT"/TextGeek*.zip

mkdir "$TMP/textgeek"
cp -r $FILES $CHROMIUM_ONLY manifest.json LICENSE "$TMP/textgeek/"
(cd "$TMP" && zip -qr -X -9 pkg.zip textgeek)
for n in TextGeek TextGeek-chrome TextGeek-edge; do cp "$TMP/pkg.zip" "$OUT/$n.zip"; done

mkdir "$TMP/ff"
cp -r $FILES LICENSE "$TMP/ff/"
cp manifest.firefox.json "$TMP/ff/manifest.json"
(cd "$TMP/ff" && zip -qr -X -9 ../ff.zip .)
cp "$TMP/ff.zip" "$OUT/TextGeek-firefox.zip"

rm -r "$TMP"
ls -l "$OUT"
