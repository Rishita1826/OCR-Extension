if (!window.__ocrListenerSet) {
  window.__ocrListenerSet = true;

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "ocrResult") {
      return;
    }

    if (message.error) {
      showToast(`OCR error: ${message.error}`);
    } else if (message.text?.trim()) {
      navigator.clipboard.writeText(message.text.trim());
      showToast("✅ Text copied!");
    } else {
      showToast("⚠️ No text detected");
    }

    window.__ocrActive = false;
  });
}

startSelectionMode();

function startSelectionMode() {
  if (window.__ocrActive) {
    return;
  }

  window.__ocrActive = true;

  const existingOverlay = document.getElementById("__ocr-overlay");
  if (existingOverlay) {
    existingOverlay.remove();
  }

  const overlay = document.createElement("div");
  overlay.id = "__ocr-overlay";

  const hint = document.createElement("div");
  hint.id = "__ocr-hint";
  hint.textContent = "Drag to select text area · Esc to cancel";
  overlay.appendChild(hint);
  document.body.appendChild(overlay);

  let startX = 0;
  let startY = 0;
  let selectionBox = null;

  const cleanup = () => {
    overlay.remove();
    document.removeEventListener("keydown", handleKeydown, true);
    window.__ocrActive = false;
  };

  const handleMouseMove = (event) => {
    if (!selectionBox) {
      return;
    }

    const x = Math.min(event.clientX, startX);
    const y = Math.min(event.clientY, startY);
    const width = Math.abs(event.clientX - startX);
    const height = Math.abs(event.clientY - startY);

    Object.assign(selectionBox.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`
    });
  };

  const handleMouseUp = (event) => {
    if (!selectionBox) {
      return;
    }

    overlay.removeEventListener("mousemove", handleMouseMove);
    overlay.removeEventListener("mouseup", handleMouseUp);

    const x = Math.min(event.clientX, startX);
    const y = Math.min(event.clientY, startY);
    const width = Math.abs(event.clientX - startX);
    const height = Math.abs(event.clientY - startY);

    if (width >= 10 && height >= 10) {
      cleanup();
      showToast("⏳ Reading text…");

      const scale = window.devicePixelRatio || 1;
      chrome.runtime.sendMessage({
        type: "captureAndOCR",
        cropRect: {
          x: x * scale,
          y: y * scale,
          width: width * scale,
          height: height * scale
        }
      });
    } else {
      selectionBox.remove();
      selectionBox = null;
    }
  };

  const handleMouseDown = (event) => {
    event.preventDefault();

    startX = event.clientX;
    startY = event.clientY;

    selectionBox = document.createElement("div");
    selectionBox.id = "__ocr-sel-box";
    Object.assign(selectionBox.style, {
      left: `${startX}px`,
      top: `${startY}px`,
      width: "0px",
      height: "0px"
    });

    overlay.appendChild(selectionBox);
    overlay.addEventListener("mousemove", handleMouseMove);
    overlay.addEventListener("mouseup", handleMouseUp);
  };

  function handleKeydown(event) {
    if (event.key === "Escape") {
      cleanup();
    }
  }

  overlay.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("keydown", handleKeydown, true);
}

function showToast(msg) {
  const existingToast = document.getElementById("__ocr-toast");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.id = "__ocr-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2800);
}
