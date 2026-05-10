const actionApi = chrome.action || chrome.browserAction;
if (actionApi?.onClicked) {
  actionApi.onClicked.addListener(async (tab) => {
    if (!tab?.id) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
    } catch (e) {
      console.error("WiFi OSS Assistant injection error:", e);
    }
  });
} else {
  console.warn("[background] action API unavailable; toolbar click injection disabled.");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  let responded = false;
  const respondOnce = (payload) => {
    if (responded) return;
    responded = true;
    try { sendResponse(payload); } catch (e) {}
  };

  const fetchWithTimeout = async (url, opts, timeoutMs) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...(opts || {}), signal: controller.signal });
    } finally {
      clearTimeout(t);
    }
  };

  // Async response
  (async () => {
    try {
      if (!msg || typeof msg !== "object") return respondOnce({ ok: false, error: "Bad message" });

      if (msg.type === "swapMaterial.fetchModels") {
        const url = String(msg.url || "");
        if (!url) return respondOnce({ ok: false, error: "Missing url" });

        const res = await fetchWithTimeout(url, { cache: "no-store" }, 15000);
        if (!res.ok) return respondOnce({ ok: false, error: `HTTP ${res.status}` });
        const data = await res.json().catch(() => null);
        if (!data) return respondOnce({ ok: false, error: "Invalid JSON" });
        return respondOnce({ ok: true, data });
      }

      if (msg.type === "swapMaterial.fetchImageDataUrl") {
        const url = String(msg.url || "");
        if (!url) return respondOnce({ ok: false, error: "Missing url" });

        const res = await fetchWithTimeout(url, { cache: "no-store" }, 20000);
        if (!res.ok) return respondOnce({ ok: false, error: `HTTP ${res.status}` });
        const contentType = res.headers.get("content-type") || "image/webp";
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const b64 = btoa(binary);
        return respondOnce({ ok: true, dataUrl: `data:${contentType};base64,${b64}` });
      }

      return respondOnce({ ok: false, error: "Unknown message type" });
    } catch (e) {
      console.error("[background] message handler error:", e);
      return respondOnce({ ok: false, error: String(e?.message || e) });
    }
  })();

  return true;
});

