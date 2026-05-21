#!/usr/bin/env bash
set -e

npm install tesseract.js@4

cp node_modules/tesseract.js/dist/tesseract.min.js .
cp node_modules/tesseract.js/dist/worker.min.js .

for CORE_NAME in \
  tesseract-core-simd.wasm.js \
  tesseract-core-simd.wasm \
  tesseract-core.wasm.js \
  tesseract-core.wasm
do
  CORE_FILE="$(find node_modules/tesseract.js-core -name "$CORE_NAME" -print -quit)"

  if [ -n "$CORE_FILE" ]; then
    cp "$CORE_FILE" .
  fi
done

if [ ! -f tesseract-core-simd.wasm.js ] && [ ! -f tesseract-core.wasm.js ]; then
  echo "Could not find Tesseract core files"
  exit 1
fi

if command -v node >/dev/null 2>&1; then
  node generate_icons.js
elif command -v node.exe >/dev/null 2>&1; then
  node.exe generate_icons.js
else
  echo "Could not find node or node.exe"
  exit 1
fi

echo "Done! Open Chrome, go to chrome://extensions, enable Developer Mode, click Load unpacked, and select this folder. Then press Ctrl+Shift+S on any page."
