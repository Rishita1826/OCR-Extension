chrome.commands.onCommand.addListener((command) => {
  if (command === "start-ocr") {
    activateOCR();
  }
});

chrome.action.onClicked.addListener(() => {
  activateOCR();
});

async function activateOCR() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || tab.url?.startsWith("chrome://")) {
    return;
  }

  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ["content.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "captureAndOCR") {
    handleCaptureAndOCR(message, sender);
    return true;
  }

  if (message?.type === "offscreenOCRResult") {
    forwardOCRResult(message);
  }
});

async function handleCaptureAndOCR(message, sender) {
  const tabId = sender.tab?.id ?? message.tabId;

  if (!tabId) {
    return;
  }

  try {
    const imageData = await chrome.tabs.captureVisibleTab(sender.tab?.windowId, {
      format: "png"
    });

    await ensureOffscreenDocument();

    chrome.runtime.sendMessage({
      type: "performOCR",
      imageData,
      cropRect: message.cropRect,
      tabId
    });
  } catch (error) {
    await chrome.tabs.sendMessage(tabId, {
      type: "ocrResult",
      error: error?.message || String(error)
    });
  }
}

async function forwardOCRResult(message) {
  if (!message.tabId) {
    return;
  }

  await chrome.tabs.sendMessage(message.tabId, {
    type: "ocrResult",
    text: message.text,
    error: message.error
  });
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL("offscreen.html");
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });

  if (contexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["DOM_SCRAPING"],
    justification: "Run OCR in an offscreen document."
  });
}
