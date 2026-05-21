# Screen OCR Chrome Extension

Screen OCR is a Chrome Manifest V3 extension that lets you select an area on the current page, captures that part of the visible tab, runs OCR with Tesseract.js, copies detected text to the clipboard, and shows a small toast with the result.

## What This Extension Does

1. You press `Ctrl+Shift+S` or click the extension toolbar icon.
2. The extension injects a full-screen selection overlay into the active tab.
3. You drag over the text area you want to read.
4. The content script sends the selected rectangle to the background service worker.
5. The background service worker captures a screenshot of the visible tab.
6. The screenshot and crop rectangle are sent to an offscreen document.
7. The offscreen document crops the screenshot using a canvas.
8. Tesseract.js runs OCR on the cropped image.
9. The OCR result is sent back to the tab.
10. The content script copies the detected text to the clipboard.

## File Overview

### `package.json`

Minimal package file for the extension project.

It currently contains:

```json
{
  "name": "ocr-extension",
  "version": "1.0.0"
}
```

The setup script installs `tesseract.js@4`, which also creates `package-lock.json` and `node_modules`.

### `manifest.json`

This is the Chrome extension manifest. It tells Chrome what the extension is, which permissions it needs, and which files Chrome should load.

Important parts:

- `manifest_version: 3`: Uses Chrome Manifest V3.
- `name: "Screen OCR"`: Extension name shown in Chrome.
- `permissions`: Allows the extension to interact with the active tab, inject scripts/styles, capture tabs, and use an offscreen document.
- `host_permissions: ["<all_urls>"]`: Allows the injected content flow to work across normal webpages.
- `background.service_worker: "background.js"`: Registers the MV3 background service worker.
- `commands.start-ocr`: Adds the keyboard shortcut:
  - Windows/Linux: `Ctrl+Shift+S`
  - Mac: `Command+Shift+S`
- `action`: Defines the toolbar icon title and icon paths.
- `web_accessible_resources`: Exposes Tesseract runtime files so Chrome can load them.
- `content_security_policy.extension_pages`: Allows local extension scripts, WASM evaluation, extension-local fetches, and the Tesseract trained-data download URL.

The CSP is deliberately strict. Chrome MV3 does not allow insecure values like `blob:` in extension page CSP, so the Tesseract worker is loaded directly from `worker.min.js`.

### `background.js`

This is the Manifest V3 service worker. It coordinates the extension.

Main responsibilities:

- Listens for the keyboard command:

```js
chrome.commands.onCommand.addListener(...)
```

- Listens for toolbar icon clicks:

```js
chrome.action.onClicked.addListener(...)
```

- Calls `activateOCR()` for both entry points.

`activateOCR()`:

1. Finds the active tab.
2. Skips restricted Chrome pages such as `chrome://...`.
3. Injects `content.css`.
4. Injects `content.js`.

It also listens for messages:

- `captureAndOCR`: Sent by `content.js` after the user selects an area.
- `offscreenOCRResult`: Sent by `offscreen.js` after OCR finishes.

When `captureAndOCR` arrives, `background.js`:

1. Captures the visible tab as a PNG data URL using `chrome.tabs.captureVisibleTab`.
2. Ensures `offscreen.html` exists by calling `ensureOffscreenDocument()`.
3. Sends `performOCR` to the offscreen document with:
   - `imageData`
   - `cropRect`
   - `tabId`

When `offscreenOCRResult` arrives, it forwards the result back to the correct tab with `chrome.tabs.sendMessage`.

### `content.js`

This file is injected into the current webpage. It handles the user interface inside the page.

Important flags:

- `window.__ocrActive`: Prevents multiple overlays from appearing at the same time.
- `window.__ocrListenerSet`: Prevents duplicate message listeners if the script is injected more than once.

What it does:

1. Registers a message listener for `ocrResult`.
2. Starts selection mode immediately.
3. Creates a full-screen overlay.
4. Lets the user drag a rectangle.
5. Sends the selected crop rectangle to the background worker.
6. Shows status toasts.
7. Copies detected text to the clipboard.

Selection flow:

- `mousedown`: Starts the selection.
- `mousemove`: Resizes the selection rectangle.
- `mouseup`: Finalizes the rectangle.
- `Escape`: Cancels selection.

The crop rectangle is multiplied by `window.devicePixelRatio` before sending it to the background service worker. This matters because browser mouse coordinates are CSS pixels, while screenshots are captured in device pixels.

Message result behavior:

- If text exists, it copies trimmed text to the clipboard and shows `Text copied`.
- If OCR returns no text, it shows `No text detected`.
- If OCR throws an error, it shows the actual OCR error message.

### `content.css`

Styles for the injected page UI.

It defines:

- `#__ocr-overlay`: Full-screen dark selection layer.
- `#__ocr-hint`: Top-center instruction label.
- `#__ocr-sel-box`: Green selection rectangle.
- `#__ocr-toast`: Bottom-center toast message.

Every declaration uses `!important` so normal webpage CSS is less likely to override the extension UI.

### `offscreen.html`

This is the hidden extension page used for OCR work.

Chrome MV3 service workers cannot directly use DOM APIs like canvas. To crop screenshots and run browser-based OCR code, the extension creates an offscreen document.

`offscreen.html` contains:

- A `<canvas id="canvas">` used to crop the screenshot.
- `tesseract.min.js`, loaded first.
- `offscreen.js`, loaded second.

The order matters because `offscreen.js` uses the global `Tesseract` object provided by `tesseract.min.js`.

### `offscreen.js`

This file runs inside `offscreen.html`. It performs the actual OCR.

Main responsibilities:

- Listens for `performOCR` messages.
- Lazily creates one reusable Tesseract worker.
- Crops the screenshot using the canvas.
- Runs OCR on the cropped image.
- Sends the result back to `background.js`.

The worker is stored in `workerPromise` so it is created only once:

```js
let workerPromise = null;
```

This is important because creating a Tesseract worker is expensive. Reusing it makes later OCR attempts faster.

Tesseract worker configuration:

- `workerPath`: Loads local `worker.min.js`.
- `workerBlobURL: false`: Required for Chrome MV3 CSP compatibility.
- `corePath`: Points to the extension root so Tesseract can choose the correct core file.
- `langPath`: Downloads English trained data from Project Naptha.
- `cacheMethod: "indexeddb"`: Caches language data locally.
- `logger: () => {}`: Disables noisy progress logging.

The worker then runs:

```js
await worker.loadLanguage("eng");
await worker.initialize("eng");
```

When OCR is requested:

1. `cropScreenshot()` loads the screenshot image.
2. It normalizes the crop rectangle.
3. It draws only the selected area onto the canvas.
4. It converts the canvas to a PNG data URL.
5. `worker.recognize()` runs OCR.
6. The text is sent back with `offscreenOCRResult`.

If anything fails, the error message is sent back instead of silently failing.

### `generate_icons.js`

This script creates the extension icon PNG files without using any npm packages.

It manually writes valid PNG files:

- PNG signature
- `IHDR` chunk
- `IDAT` chunk
- `IEND` chunk

For each PNG row, it writes:

- A filter byte of `0`
- RGBA pixels using indigo color `rgb(255, 161, 53)`

It compresses image data using Node's built-in `zlib.deflateSync`.

It also manually calculates CRC32 checksums for each PNG chunk.

Generated files:

- `icons/icon16.png`
- `icons/icon48.png`
- `icons/icon128.png`

### `setup.sh`

This script prepares the extension for local use.

Steps:

1. Installs `tesseract.js@4`.
2. Copies `tesseract.min.js` to the extension root.
3. Copies `worker.min.js` to the extension root.
4. Copies all needed Tesseract core files:
   - `tesseract-core-simd.wasm.js`
   - `tesseract-core-simd.wasm`
   - `tesseract-core.wasm.js`
   - `tesseract-core.wasm`
5. Runs `generate_icons.js`.
6. Prints Chrome loading instructions.

Both SIMD and non-SIMD core files are copied so Tesseract can choose the best supported runtime in Chrome.

## Message Flow

```text
User presses shortcut or clicks toolbar icon
        |
        v
background.js
activateOCR()
        |
        v
Injects content.css and content.js
        |
        v
content.js
User selects rectangle
        |
        v
chrome.runtime.sendMessage({ type: "captureAndOCR", cropRect })
        |
        v
background.js
captureVisibleTab()
ensureOffscreenDocument()
        |
        v
chrome.runtime.sendMessage({ type: "performOCR", imageData, cropRect, tabId })
        |
        v
offscreen.js
Crop image on canvas
Run Tesseract OCR
        |
        v
chrome.runtime.sendMessage({ type: "offscreenOCRResult", text, tabId })
        |
        v
background.js
Forward result to tab
        |
        v
content.js
Copy text to clipboard and show toast
```

## Why The Offscreen Document Exists

Chrome MV3 background scripts are service workers. Service workers do not have normal page DOM access, so they cannot use a regular `<canvas>` element directly.

The offscreen document solves that:

- It is hidden.
- It can use DOM APIs.
- It can host a canvas.
- It can load Tesseract.js.
- It can communicate with the service worker through Chrome runtime messages.

## Important Debugging Fixes

During development, OCR initially returned no text or failed because of a few Chrome/Tesseract-specific issues.

### Tesseract v4 Worker API

The original worker initialization used the wrong argument shape for `Tesseract.createWorker`.

The fixed version uses:

```js
const worker = await Tesseract.createWorker({
  workerPath: chrome.runtime.getURL("worker.min.js"),
  workerBlobURL: false,
  corePath: chrome.runtime.getURL(""),
  langPath: "https://tessdata.projectnaptha.com/4.0.0",
  cacheMethod: "indexeddb",
  logger: () => {}
});
```

Then it explicitly loads and initializes English:

```js
await worker.loadLanguage("eng");
await worker.initialize("eng");
```

### Missing WASM Files

Tesseract needs both JavaScript loader files and WASM binary files. The setup now copies both SIMD and non-SIMD versions.

### MV3 CSP Rules

Chrome MV3 rejected `blob:` in `worker-src`, so the extension now uses:

```text
worker-src 'self'
```

and Tesseract is configured with:

```js
workerBlobURL: false
```

This makes the worker load directly from the extension file instead of from a blob URL.

### Better Error Reporting

The content script now shows OCR errors in the toast instead of always showing `No text detected`. This makes future debugging much easier.

## How To Run

From the `ocr-extension` folder:

```bash
./setup.sh
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click Load unpacked.
4. Select the `ocr-extension` folder.
5. Open a normal webpage.
6. Press `Ctrl+Shift+S`.
7. Drag over text.

The recognized text should be copied to your clipboard.

## Known Notes

- The first OCR run can take longer because English trained data is downloaded and cached.
- The extension does not work on restricted Chrome pages such as `chrome://extensions`.
- OCR accuracy depends on text clarity, size, contrast, and the selected crop area.
- If you edit extension files, reload the extension from `chrome://extensions`.
- If the keyboard shortcut conflicts with another extension or Chrome command, change it in `chrome://extensions/shortcuts`.

