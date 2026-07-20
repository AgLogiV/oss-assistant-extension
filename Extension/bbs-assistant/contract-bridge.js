(function bbsAssistantContractBridge(global) {
  "use strict";

  const PENDING_LOOKUP_KEY = "wifi_oss_pending_bbs_contract_lookup_v1";
  const RECYCLE_ENTRY_LOOKUP_RESULT_KEY = "wifi_oss_recycle_entry_contract_lookup_result_v1";
  const MAX_PENDING_AGE_MS = 15 * 60 * 1000;
  const SEARCH_MAC_INPUT_ID = "_clients_Mac";
  const SEARCH_BUTTON_ID = "_clients_get";
  const APPLIED_ATTRIBUTE = "data-wifi-oss-bbs-pending-mac";
  const MATCHED_MAC_HASH_PARAM = "wifi-oss-matched-mac";
  const RECYCLE_ENTRY_TOKEN_HASH_PARAM = "wifi-oss-recycle-entry-token";
  const MAX_ATTEMPTS = 60;
  const RETRY_DELAY_MS = 500;

  function normalizeMac(value) {
    const normalized = String(value || "").replace(/[^0-9a-f]/gi, "").toUpperCase();
    return /^[0-9A-F]{12}$/.test(normalized) ? normalized : "";
  }

  function getMatchedMacFromUrl() {
    try {
      const hash = String(global.location.hash || "").replace(/^#/, "");
      return normalizeMac(new URLSearchParams(hash).get(MATCHED_MAC_HASH_PARAM));
    } catch (error) {
      return "";
    }
  }

  function highlightMatchedMac(documentRef) {
    if (!/^\/bbs2\/devices\//.test(String(global.location.pathname || ""))) return false;
    const matchedMac = getMatchedMacFromUrl();
    if (!matchedMac) return false;

    const matchingInputs = Array.from(documentRef.querySelectorAll("input, textarea"))
      .filter(input => normalizeMac(input.value) === matchedMac);
    matchingInputs.forEach(input => {
      input.setAttribute("data-wifi-oss-matched-mac", "1");
      input.title = "Намереният MAC адрес";
      input.style.setProperty("background-color", "#a9e7ae", "important");
      input.style.setProperty("border", "2px solid #126b28", "important");
      input.style.setProperty("box-shadow", "0 0 0 2px rgba(18,107,40,.24)", "important");
      input.style.setProperty("color", "#0b4f1d", "important");
      input.style.setProperty("font-weight", "700", "important");
    });
    return matchingInputs.length > 0;
  }

  function readPendingLookup(callback) {
    try {
      chrome.storage.local.get(PENDING_LOOKUP_KEY, (stored) => {
        const pending = stored?.[PENDING_LOOKUP_KEY] || null;
        const mac = normalizeMac(pending?.mac);
        const createdAt = Number(pending?.createdAt || 0);
        if (!mac || !createdAt || Date.now() - createdAt > MAX_PENDING_AGE_MS) {
          if (pending) chrome.storage.local.remove(PENDING_LOOKUP_KEY);
          callback(null);
          return;
        }
        callback({
          mac,
          createdAt,
          nativeSearchSubmittedAt: Number(pending?.nativeSearchSubmittedAt || 0),
          contractNavigationStartedAt: Number(pending?.contractNavigationStartedAt || 0),
          recycleEntryToken: String(pending?.recycleEntryToken || "").trim()
        });
      });
    } catch (error) {
      callback(null);
    }
  }

  function clearPendingLookup() {
    try { chrome.storage.local.remove(PENDING_LOOKUP_KEY); } catch (error) {}
  }

  function publishRecycleEntryLookupResult(pending, status) {
    const token = String(pending?.recycleEntryToken || "").trim();
    if (!token || !status) return;
    try {
      chrome.storage.local.set({
        [RECYCLE_ENTRY_LOOKUP_RESULT_KEY]: {
          token,
          status,
          completedAt: Date.now()
        }
      });
    } catch (error) {}
  }

  function getRecycleEntryTokenFromUrl() {
    try {
      const hash = String(global.location.hash || "").replace(/^#/, "");
      return String(new URLSearchParams(hash).get(RECYCLE_ENTRY_TOKEN_HASH_PARAM) || "").trim();
    } catch (error) {
      return "";
    }
  }

  function markNativeSearchSubmitted(pending) {
    try {
      chrome.storage.local.set({
        [PENDING_LOOKUP_KEY]: {
          ...pending,
          nativeSearchSubmittedAt: Date.now()
        }
      });
    } catch (error) {}
  }

  function setInputValue(input, value) {
    if (!input) return false;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findClickableByText(documentRef, text) {
    const expected = normalizeText(text);
    return Array.from(documentRef.querySelectorAll("a, button, [onclick], [role='button']"))
      .find(element => normalizeText(element.textContent || element.getAttribute("title")) === expected) || null;
  }

  function isVisible(element) {
    if (!element) return false;
    try {
      // A submenu anchor itself normally has display:block even while its
      // wrapping menu container is hidden. Check the complete parent chain.
      for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
        const style = global.getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
          return false;
        }
      }
      return true;
    } catch (error) {
      return true;
    }
  }

  function openTechnicalDataFieldset(input) {
    const fieldset = input?.closest("fieldset");
    if (!fieldset || isVisible(input)) return true;

    const legend = fieldset.querySelector("legend.toggable") || fieldset.querySelector("legend");
    if (!legend || legend.getAttribute("data-wifi-oss-bbs-tech-opened") === "1") return false;
    legend.setAttribute("data-wifi-oss-bbs-tech-opened", "1");
    try { legend.click(); } catch (error) {}
    return false;
  }

  function triggerMenuClick(element, markerAttribute) {
    if (!element) return false;
    const lastAttempt = Number(element.getAttribute(markerAttribute) || 0);
    if (Date.now() - lastAttempt < 750) return false;
    element.setAttribute(markerAttribute, String(Date.now()));

    // The legacy BBS sidebar is a table menu with inline page handlers.
    // Dispatching a bubbling mouse event reaches that handler even when the
    // handler is defined in the page's JavaScript world.
    try {
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: global }));
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: global }));
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: global }));
      return true;
    } catch (error) {
      try { element.click(); return true; } catch (nestedError) { return false; }
    }
  }

  function navigateToBbsContractSearch(documentRef) {
    // The legacy sidebar starts with Search2 inside a hidden Contracts
    // container. Open Contracts first, then use the actual Search2 link.
    const contractsMenu = documentRef.querySelector("tr#c_4278, tr[name='c_4278']");
    const contractsContainer = documentRef.querySelector("div#o_4278, div[id='o_4278']");
    if (contractsMenu && contractsContainer && !isVisible(contractsContainer)) {
      triggerMenuClick(contractsMenu, "data-wifi-oss-bbs-contracts-opened-at");
      return true;
    }

    const searchLinks = Array.from(documentRef.querySelectorAll("a#a3, a[id='a3'], a[valeng='Search2']"));
    const searchLink = searchLinks.find(isVisible) || null;
    if (searchLink) {
      triggerMenuClick(searchLink, "data-wifi-oss-bbs-search-opened-at");
      return true;
    }

    // Fallback for an alternative BBS menu layout.
    const fallbackSearchLink = findClickableByText(documentRef, "Търсене (ББС2)");
    if (fallbackSearchLink && isVisible(fallbackSearchLink)) {
      try { fallbackSearchLink.click(); } catch (error) {}
      return true;
    }
    return false;
  }

  function fillNativeMacSearch(documentRef, pending) {
    const input = documentRef.getElementById(SEARCH_MAC_INPUT_ID);
    if (!input) return false;
    if (!openTechnicalDataFieldset(input)) return true;
    // The native search must be submitted only once. The following BBS page
    // still contains the search form, so re-submitting it would create a loop
    // instead of letting BBS Assistant locate and open the matching contract.
    if (pending.nativeSearchSubmittedAt) return false;
    if (input.getAttribute(APPLIED_ATTRIBUTE) === pending.mac) return true;

    input.setAttribute(APPLIED_ATTRIBUTE, pending.mac);
    setInputValue(input, pending.mac);
    try { input.focus({ preventScroll: true }); } catch (error) { try { input.focus(); } catch (e) {} }
    markNativeSearchSubmitted(pending);

    const searchButton = documentRef.getElementById(SEARCH_BUTTON_ID);
    if (searchButton && !searchButton.disabled) {
      global.setTimeout(() => {
        try { searchButton.click(); } catch (error) {}
      }, 0);
    }
    return true;
  }

  function fillAssistantPanel(documentRef, pending) {
    const panel = documentRef.getElementById("bbs-assistant-panel");
    const input = panel?.querySelector(".bbs-assistant-input");
    if (!input) return false;

    if (input.getAttribute(APPLIED_ATTRIBUTE) !== pending.mac) {
      input.setAttribute(APPLIED_ATTRIBUTE, pending.mac);
      setInputValue(input, pending.mac);
    }
    return panel;
  }

  function openMatchedDeviceContract(documentRef, pending) {
    const activeRows = Array.from(documentRef.querySelectorAll("tr.bbs-assistant-highlight-active"));
    const contractLink = activeRows
      .map(row => row.querySelector("a[href*='/bbs2/devices/'], a[href*='bbs2/devices/']"))
      .find(Boolean);
    if (!contractLink) return false;

    let contractUrl;
    try {
      contractUrl = new URL(contractLink.getAttribute("href"), documentRef.baseURI);
    } catch (error) {
      return false;
    }
    if (contractUrl.origin !== global.location.origin || !/^\/bbs2\/devices\//.test(contractUrl.pathname)) {
      return false;
    }

    if (contractLink.getAttribute(APPLIED_ATTRIBUTE) === pending.mac) return true;
    contractLink.setAttribute(APPLIED_ATTRIBUTE, pending.mac);
    const hashParams = new URLSearchParams({ [MATCHED_MAC_HASH_PARAM]: pending.mac });
    if (pending.recycleEntryToken) hashParams.set(RECYCLE_ENTRY_TOKEN_HASH_PARAM, pending.recycleEntryToken);
    contractUrl.hash = hashParams.toString();
    try {
      chrome.storage.local.set({
        [PENDING_LOOKUP_KEY]: {
          ...pending,
          contractNavigationStartedAt: Date.now()
        }
      });
    } catch (error) {}
    global.location.assign(contractUrl.href);
    return true;
  }

  function publishNotFoundRecycleEntryLookup(panel, pending) {
    const result = panel?.state?.lastSearchResult;
    if (result?.status !== "not-found") return false;
    publishRecycleEntryLookupResult(pending, "not-found");
    clearPendingLookup();
    return true;
  }

  function hasNativeBbsNoRecordsMessage(documentRef) {
    const text = String(documentRef?.body?.textContent || "").replace(/\s+/g, " ").trim();
    const noRecordsMessage = "\u041d\u0435 \u0431\u044f\u0445\u0430 \u043d\u0430\u043c\u0435\u0440\u0435\u043d\u0438 \u0437\u0430\u043f\u0438\u0441\u0438 \u0438\u043b\u0438 \u043d\u044f\u043c\u0430\u0442\u0435 \u043d\u0435\u043e\u0431\u0445\u043e\u0434\u0438\u043c\u0438\u0442\u0435 \u043f\u0440\u0430\u0432\u0430 \u0437\u0430 \u0442\u0430\u0437\u0438 \u0437\u0430\u044f\u0432\u043a\u0430.";
    return text.includes(noRecordsMessage);
  }

  function publishOpenedRecycleEntryContract() {
    if (!/^\/bbs2\/devices\//.test(String(global.location.pathname || ""))) return;
    const token = getRecycleEntryTokenFromUrl();
    if (!token) return;
    publishRecycleEntryLookupResult({ recycleEntryToken: token }, "found");
    clearPendingLookup();
  }

  function tryApplyPendingLookup(documentRef) {
    readPendingLookup((pending) => {
      if (!pending) return;
      if (pending.contractNavigationStartedAt) return;
      if (fillNativeMacSearch(documentRef, pending)) return;
      // BBS can return a native "no records / no rights" notice without
      // rendering the Assistant panel. Treat that completed search as not found
      // immediately instead of waiting for the retry timeout.
      if (pending.nativeSearchSubmittedAt && hasNativeBbsNoRecordsMessage(documentRef)) {
        publishRecycleEntryLookupResult(pending, "not-found");
        clearPendingLookup();
        return;
      }
      // The sidebar must open Search2 only before the first native search.
      // Afterwards clicking it again resets the main frame to an empty form.
      if (!pending.nativeSearchSubmittedAt && navigateToBbsContractSearch(documentRef)) return;
      const panel = fillAssistantPanel(documentRef, pending);
      if (panel) {
        if (openMatchedDeviceContract(documentRef, pending)) return;
        publishNotFoundRecycleEntryLookup(panel, pending);
      }
    });
  }

  function start() {
    highlightMatchedMac(global.document);
    publishOpenedRecycleEntryContract();
    let attempts = 0;
    const retry = () => {
      attempts += 1;
      tryApplyPendingLookup(global.document);
      if (attempts < MAX_ATTEMPTS) global.setTimeout(retry, RETRY_DELAY_MS);
    };
    retry();
  }

  start();
})(typeof window !== "undefined" ? window : globalThis);
