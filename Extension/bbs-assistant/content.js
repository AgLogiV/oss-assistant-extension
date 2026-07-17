(function bbsAssistantContentBootstrap(global) {
  "use strict";

  const namespace = global.BbsAssistant;
  const MAX_ATTEMPTS = 8;
  const RETRY_DELAY_MS = 500;

  if (!namespace || !global.document) {
    return;
  }

  let attempts = 0;
  let mounted = false;

  function isAlreadyMounted(documentRef) {
    return Boolean(documentRef.getElementById("bbs-assistant-panel"));
  }

  function tryMount() {
    attempts += 1;

    if (mounted || isAlreadyMounted(global.document)) {
      mounted = true;
      return;
    }

    const detection = namespace.detectBbsPage(global.document);

    if (detection.shouldActivate && detection.pageType === "subscriber") {
      namespace.mountAssistantPanel({
        documentRef: global.document,
        detection
      });
      mounted = true;
      return;
    }

    if (detection.pageType === "search") {
      return;
    }

    if (attempts < MAX_ATTEMPTS) {
      global.setTimeout(tryMount, RETRY_DELAY_MS);
    }
  }

  function start() {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", tryMount, { once: true });
      return;
    }

    tryMount();
  }

  start();
})(typeof window !== "undefined" ? window : globalThis);

