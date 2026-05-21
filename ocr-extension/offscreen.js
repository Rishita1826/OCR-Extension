let workerPromise = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "performOCR") {
    return;
  }

  performOCR(message);
  return true;
});

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker({
        workerPath: chrome.runtime.getURL("worker.min.js"),
        workerBlobURL: false,
        corePath: chrome.runtime.getURL(""),
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
        cacheMethod: "indexeddb",
        logger: () => {}
      });

      await worker.loadLanguage("eng");
      await worker.initialize("eng");

      return worker;
    })();
  }

  return workerPromise;
}

async function performOCR({ imageData, cropRect, tabId }) {
  try {
    const croppedImage = await cropScreenshot(imageData, cropRect);
    const worker = await getWorker();
    const result = await worker.recognize(croppedImage);

    chrome.runtime.sendMessage({
      type: "offscreenOCRResult",
      tabId,
      text: result.data.text
    });
  } catch (error) {
    chrome.runtime.sendMessage({
      type: "offscreenOCRResult",
      tabId,
      error: error?.message || String(error)
    });
  }
}

async function cropScreenshot(imageData, cropRect) {
  const image = await loadImage(imageData);
  const canvas = document.getElementById("canvas");
  const context = canvas.getContext("2d");
  const crop = normalizeCropRect(cropRect, image.width, image.height);

  canvas.width = crop.width;
  canvas.height = crop.height;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );

  return canvas.toDataURL("image/png");
}

function normalizeCropRect(cropRect, imageWidth, imageHeight) {
  const x = Math.max(0, Math.round(cropRect.x));
  const y = Math.max(0, Math.round(cropRect.y));
  const width = Math.min(Math.round(cropRect.width), imageWidth - x);
  const height = Math.min(Math.round(cropRect.height), imageHeight - y);

  if (width <= 0 || height <= 0) {
    throw new Error("Selected area is outside the captured screenshot.");
  }

  return { x, y, width, height };
}

function loadImage(imageData) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load screenshot."));
    image.src = imageData;
  });
}
