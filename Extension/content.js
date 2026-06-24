(() => {
  if (window.__wifiOssAssistantInjected) return;
  window.__wifiOssAssistantInjected = true;

  const RECYCLE_REMOTE_CONFIG_DEBUG_BRIDGE_SOURCE = "wifiOssRecycleRemoteConfig";
  const RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES = {
    refresh: "recycleConfig.refreshRemote",
    status: "recycleConfig.getRemoteStatus",
    clear: "recycleConfig.clearRemoteCache",
    maybeRefresh: "recycleConfig.maybeRefreshRemote",
    setAutoRefresh: "recycleConfig.setAutoRefreshEnabled",
    setSourceOverride: "recycleConfig.setRemoteSourceOverride",
    clearSourceOverride: "recycleConfig.clearRemoteSourceOverride",
    previewDiff: "recycleConfig.getCatalogDiffPreview",
    resolvedPlan: "recycleConfig.getResolvedCatalogPlan",
    resolvedApplyPlan: "recycleConfig.getResolvedCatalogApplyPlan",
    eligibleAdditions: "recycleConfig.getEligibleDeviceAdditions"
  };
  const RECYCLE_REMOTE_CONFIG_APPLY_VISUAL_ACTION = "applyVisualOverlay";
  const RECYCLE_REMOTE_CONFIG_PREVIEW_DIFF_ACTION = "previewDiff";
  const RECYCLE_REMOTE_CONFIG_RESOLVED_PLAN_ACTION = "resolvedPlan";
  const RECYCLE_REMOTE_CONFIG_APPLY_ELIGIBLE_ACTION = "applyEligibleDevices";

  function sendRecycleRemoteConfigDebugMessage(type, payload) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome?.runtime?.sendMessage) {
          reject(new Error("chrome.runtime.sendMessage unavailable"));
          return;
        }
        chrome.runtime.sendMessage({ ...(payload || {}), type }, (response) => {
          const lastError = chrome.runtime.lastError?.message;
          if (lastError) {
            reject(new Error(lastError));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  window.__wifiOssRecycleRemoteConfig = {
    async refresh() {
      const response = await sendRecycleRemoteConfigDebugMessage(RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.refresh);
      console.info("[recycleRemoteConfig] refresh", response);
      return response;
    },
    async status() {
      const response = await sendRecycleRemoteConfigDebugMessage(RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.status);
      console.info("[recycleRemoteConfig] status", response);
      return response;
    },
    async clear() {
      const response = await sendRecycleRemoteConfigDebugMessage(RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.clear);
      console.info("[recycleRemoteConfig] clear", response);
      return response;
    },
    async applyVisualOverlay() {
      const response = await applyRecycleRemoteVisualOverlay();
      console.info("[recycleRemoteConfig] applyVisualOverlay", response);
      return response;
    },
    async previewDiff() {
      const response = await previewRecycleRemoteCatalogDiff();
      console.info("[recycleRemoteConfig] previewDiff", response);
      return response;
    },
    async resolvedPlan() {
      const response = await previewRecycleRemoteResolvedCatalogPlan();
      console.info("[recycleRemoteConfig] resolvedPlan", response);
      return response;
    },
    async applyEligibleDevices() {
      const response = await applyRecycleRemoteEligibleDevices();
      console.info("[recycleRemoteConfig] applyEligibleDevices", response);
      return response;
    }
  };

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== RECYCLE_REMOTE_CONFIG_DEBUG_BRIDGE_SOURCE || data.direction !== "request") return;
    const action = String(data.action || "");
    const type = RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES[action];
    const isApplyVisualOverlay = action === RECYCLE_REMOTE_CONFIG_APPLY_VISUAL_ACTION;
    const isPreviewDiff = action === RECYCLE_REMOTE_CONFIG_PREVIEW_DIFF_ACTION;
    const isResolvedPlan = action === RECYCLE_REMOTE_CONFIG_RESOLVED_PLAN_ACTION;
    const isApplyEligibleDevices = action === RECYCLE_REMOTE_CONFIG_APPLY_ELIGIBLE_ACTION;
    if (!type && !isApplyVisualOverlay && !isPreviewDiff && !isResolvedPlan && !isApplyEligibleDevices) return;

    const requestId = String(data.requestId || "");
    try {
      let response;
      if (isApplyVisualOverlay) {
        response = await applyRecycleRemoteVisualOverlay();
      } else if (isApplyEligibleDevices) {
        response = await applyRecycleRemoteEligibleDevices();
      } else if (isPreviewDiff) {
        response = await previewRecycleRemoteCatalogDiff();
      } else if (isResolvedPlan) {
        response = await previewRecycleRemoteResolvedCatalogPlan();
      } else {
        response = await sendRecycleRemoteConfigDebugMessage(type);
      }
      window.postMessage({
        source: RECYCLE_REMOTE_CONFIG_DEBUG_BRIDGE_SOURCE,
        direction: "response",
        requestId,
        ok: true,
        response
      }, "*");
    } catch (error) {
      window.postMessage({
        source: RECYCLE_REMOTE_CONFIG_DEBUG_BRIDGE_SOURCE,
        direction: "response",
        requestId,
        ok: false,
        error: String(error?.message || error)
      }, "*");
    }
  });

  const AUTO_MODE_KEY = "wifi_oss_auto_mode_enabled";
  const LAST_CLIPBOARD_KEY = "wifi_oss_last_clipboard_text";

  let autoMode = false;
  let autoTimer = null;
  let lastClipboardText = "";
  let autoButtonRef = null;
  let autoErrorCount = 0;

  const deviceConfig = {
    MF283U: { ports: "4", has5g: false },
    MF293N: { ports: "1", has5g: false },
    MF296R: { ports: "4", has5g: true },
    MC888A: { ports: "2", has5g: false },
    MC801A: { ports: "2", has5g: true },
    G5B: { ports: "2", has5g: false },
    G5B1: { ports: "2", has5g: false },
    G5TS: { ports: "2", has5g: false },
    EX220: { ports: "4", has5g: true },
    NX220: { ports: "4", has5g: true },
    HX520: { ports: "4", has5g: false },
    "Deco M4": { ports: "2", has5g: false },
    "ZXHN H3601P": { ports: "3", has5g: true },
    H3601P: { ports: "3", has5g: true }
  };

  function detectDeviceModel(text) {
    const upper = text.toUpperCase();
    for (const model of Object.keys(deviceConfig)) {
      const variants = [
        model.toUpperCase(),
        model.replace(/\s+/g, "").toUpperCase(),
        ("ZTE " + model).toUpperCase(),
        ("TP-LINK " + model).toUpperCase(),
        ("TPLINK " + model).toUpperCase()
      ];
      if (variants.some(v => upper.includes(v))) {
        return { model, ...deviceConfig[model] };
      }
    }
    return { model: null, ports: "1", has5g: false };
  }

  // --- Нова логика за H3601P ---
  function parseForH3601P(text) {
    // Търсим WLAN SSID(2.4G)
    const ssidM = text.match(/WLAN\s+SSID\(2\.4G\)\s*[:\-]?\s*([^\n\r]+)/i);
    // Търсим WLAN Security за паролата
    const passM = text.match(/WLAN\s+Security\s*[:\-]?\s*([^\n\r]+)/i);

    const ssid1 = ssidM ? ssidM[1].trim().replace(/\s+/g, "") : null;
    const pass = passM ? passM[1].trim() : null;
    
    let ssid2 = null;
    if (ssid1) {
      // Генерираме SSID2 със суфикс _5G
      ssid2 = ssid1.toUpperCase().endsWith("_5G") ? ssid1 : `${ssid1}_5G`;
    }

    return { ssid1, ssid2, pass };
  }

  function parseForMF296R(text) {
    const m = text.match(/(?:WiFi SSID1|WIFI SSID1|wifi ssid1)\s*[:\-]?\s*([^\n\r]+)/i);
    if (!m) return null;
    const raw = m[1].trim();
    return raw.replace(/\s+/g, "");
  }

  function parseForMF283U(text) {
    const ssidM = text.match(/WLAN\s+NAME.*?\(SSID\)\s*[:\-]?\s*([^\n\r]+)/i);
    const passM = text.match(/\(PASSWORD\)\s*[:\-]?\s*([^\n\r]+)/i);
    const ssid = ssidM ? ssidM[1].trim().replace(/\s+/g, "") : null;
    const pass = passM ? passM[1].trim() : null;
    return { ssid, pass };
  }

  function parseForMF293N(text) {
    const m = text.match(/WLAN\s+NAME\s*\(SSID\)\s*[:\-]?\s*([^\n\r]+)/i);
    const ssid = m ? m[1].trim().replace(/\s+/g, "") : null;
    return ssid;
  }

  function parseForEX220(text) {
    const passM = text.match(/Wireless\s+Password\/PIN\s*[:\-]?\s*([^\s]+)/i);
    const pass = passM ? passM[1].trim() : null;
    const parts = text.split(/SSID\s*:/i).slice(1);
    const cleaned = parts.map(p => p.split(/SSID\s*:/i)[0]).map(p => p.trim()).filter(Boolean);
    let ssid1 = null;
    let ssid2 = null;
    if (cleaned.length > 0) {
      ssid1 = normalizeA1Base(cleaned[0]);
      if (cleaned.length > 1) {
        ssid2 = normalizeA1Base(cleaned[1]);
      } else if (ssid1) {
        ssid2 = ssid1;
      }
    }
    if (ssid2 && !ssid2.toUpperCase().endsWith("_5G")) {
      ssid2 = `${ssid2}_5G`;
    }
    return { ssid1, ssid2, pass };
  }

  function parseForG5B(text) {
    const m = text.match(/Wi[- ]?Fi[- ]?Name\s*[:\-]?\s*([^\n\r]+)/i);
    if (!m) return null;
    const raw = m[1].trim();
    return raw.replace(/\s+/g, "");
  }

  function normalizeA1Base(ssid) {
    if (!ssid) return ssid;
    const m = ssid.match(/(A1)[\s_-]*([0-9A-F]{4})/i);
    if (!m) return ssid.replace(/\s+/g, "");
    const prefix = m[1].toUpperCase();
    const num = m[2].toUpperCase();
    return `${prefix}_${num}`;
  }

  function normalizeZeros(value) {
    if (!value) return value;
    return value.replace(/[OoОо]/g, "0");
  }

  function isRecognizedClipboardText(text) {
    if (!text || text.length > 2000) return false;
    const dev = detectDeviceModel(text);
    if (dev && dev.model) return true;
    // Generic fallback: в auto mode попълваме само при силен сигнал (SSID + парола).
    const g = genericParse(text);
    return !!(g && g.ssid && g.pass);
  }

  function genericParse(text) {
    let ssid = null;
    let pass = null;
    const ssidM = text.match(/(?:SSID|Wi[- ]?Fi[- ]?Name|WLAN SSID)[\s:]+([^\s]+)/i);
    if (ssidM) ssid = ssidM[1].trim();
    if (!ssid) {
      const a1 = text.match(/(A1)[\s_-]*([0-9A-F]{4})/i);
      if (a1) {
        const num = a1[2].toUpperCase();
        ssid = `${a1[1].toUpperCase()}_${num}`;
      }
    }
    const passM = text.match(/(?:PASSWORD|KEY|WiFi Key|Wireless Password\/PIN)[\s:]+([^\s]+)/i);
    if (passM) pass = passM[1].trim();
    return { ssid, pass };
  }

  async function readClipboard() {
    try {
      return await navigator.clipboard.readText();
    } catch (e) {
      alert("Браузърът блокира достъпа до клипборда.");
      throw e;
    }
  }

  function loadLastClipboardText() {
    try {
      lastClipboardText = window.localStorage.getItem(LAST_CLIPBOARD_KEY) || "";
    } catch (e) { lastClipboardText = ""; }
  }

  function rememberClipboardText(text) {
    lastClipboardText = text;
    try { window.localStorage.setItem(LAST_CLIPBOARD_KEY, text); } catch (e) {}
  }

  function normalizeLabelText(t) {
    return (t || "").replace(/\s+/g, " ").replace(":", "").trim().toLowerCase();
  }

  function findFieldByLabel(labelText) {
    const normalizedTarget = normalizeLabelText(labelText);
    const idMap = {
      "избери брой портове": ["_wflowRecycleState_PortCount", "_correctWifiSettings_PortCount"],
      "тествай wifi": ["_wflowRecycleState_CheckWifi", "_correctWifiSettings_CheckWifi"],
      "ssid1": ["_wflowRecycleState_Ssid1", "_correctWifiSettings_Ssid1"],
      "ssid2": ["_wflowRecycleState_Ssid2", "_correctWifiSettings_Ssid2"],
      "psk1": ["_wflowRecycleState_Psk1", "_correctWifiSettings_Psk1"],
      "psk2": ["_wflowRecycleState_Psk2", "_correctWifiSettings_Psk2"]
    };

    for (const [key, ids] of Object.entries(idMap)) {
      if (normalizedTarget.startsWith(key)) {
        for (const id of ids) {
          const el = document.getElementById(id);
          if (el) return el;
        }
      }
    }

    const allNodes = document.querySelectorAll("td, th, span, label, div");
    for (const node of allNodes) {
      const txt = normalizeLabelText(node.textContent);
      if (txt === normalizedTarget || txt.startsWith(normalizedTarget)) {
        const row = node.closest("tr");
        if (row) {
          let cell = node.nextElementSibling;
          while (cell) {
            const field = cell.querySelector?.("input, select, textarea");
            if (field) return field;
            cell = cell.nextElementSibling;
          }
        }
      }
    }
    return null;
  }

  function updateChosenDisplay(selectEl, chosenId) {
    if (!selectEl) return;
    const id = chosenId || (selectEl.id ? `${selectEl.id}_chosen` : null);
    if (!id) return;
    const chosen = document.getElementById(id);
    const span = chosen?.querySelector(".chosen-single span");
    if (span && selectEl.options[selectEl.selectedIndex]) {
      span.textContent = selectEl.options[selectEl.selectedIndex].textContent;
    }
  }

  function fillOssForm({ ports, ssid1, ssid2, pass, has5g }) {
    const portsField = findFieldByLabel("Избери брой портове:");
    if (portsField) {
      portsField.value = ports;
      portsField.dispatchEvent(new Event("change", { bubbles: true }));
      updateChosenDisplay(portsField);
    }

    const testField = findFieldByLabel("Тествай Wifi:");
    if (testField) {
      testField.value = "Yes";
      testField.dispatchEvent(new Event("change", { bubbles: true }));
      updateChosenDisplay(testField);
    }

    const ssid1Field = findFieldByLabel("Ssid1:");
    if (ssid1Field && ssid1) {
      ssid1Field.value = ssid1;
      ssid1Field.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const psk1Field = findFieldByLabel("Psk1:");
    if (psk1Field && pass) {
      psk1Field.value = pass;
      psk1Field.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const ssid2Field = findFieldByLabel("Ssid2:");
    if (ssid2Field) {
      ssid2Field.value = (has5g && ssid2) ? ssid2 : "";
      ssid2Field.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const psk2Field = findFieldByLabel("Psk2:");
    if (psk2Field) {
      psk2Field.value = (has5g && pass) ? pass : "";
      psk2Field.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const customSelect = document.getElementById("_correctWifiSettings_CustomRequest");
    if (customSelect) {
      customSelect.value = "Yes";
      customSelect.dispatchEvent(new Event("change", { bubbles: true }));
      updateChosenDisplay(customSelect, "_correctWifiSettings_CustomRequest_chosen");
    }

    const saveBtn = document.getElementById("_correctWifiSettings_save");
    if (saveBtn) { try { saveBtn.click(); } catch (e) {} }
  }

  function processText(text) {
    if (!text || text.length > 2000) {
      alert("Невалидни данни в клипборда.");
      return;
    }

    const dev = detectDeviceModel(text);
    let ports = dev.ports || "1";
    let has5g = !!dev.has5g;
    let ssid1 = null;
    let ssid2 = null;
    let pass = null;

    if (dev.model === "MF296R") {
      ssid1 = normalizeA1Base(parseForMF296R(text));
      pass = genericParse(text).pass;
      if (ssid1) ssid2 = ssid1.toUpperCase().endsWith("_5G") ? ssid1 : `${ssid1}_5G`;
      has5g = true;
    } 
    // Прилагане на новата логика за H3601P
    else if (dev.model === "H3601P" || dev.model === "ZXHN H3601P") {
      const r = parseForH3601P(text);
      ssid1 = r.ssid1;
      ssid2 = r.ssid2;
      pass = r.pass;
      has5g = true;
    }
    else if (dev.model === "MF283U") {
      const r = parseForMF283U(text);
      ssid1 = r.ssid; pass = r.pass;
    } else if (dev.model === "MF293N") {
      ssid1 = parseForMF293N(text);
      pass = genericParse(text).pass;
    } else if (dev.model === "MC801A") {
      const m1 = text.match(/WLAN\s+SSID1\s*[:\-]?\s*([^\n\r]+)/i);
      const m2 = text.match(/WLAN\s+SSID2\s*[:\-]?\s*([^\n\r]+)/i);
      if (m1) ssid1 = normalizeA1Base(m1[1].trim());
      if (m2) ssid2 = normalizeA1Base(m2[1].trim());
      else if (ssid1) ssid2 = ssid1;
      if (ssid2 && !ssid2.toUpperCase().endsWith("_5G")) ssid2 = `${ssid2}_5G`;
      pass = genericParse(text).pass;
      has5g = true;
    } else if (dev.model === "EX220" || dev.model === "NX220") {
      const r = parseForEX220(text);
      ssid1 = r.ssid1; ssid2 = r.ssid2; pass = r.pass;
      has5g = true;
    } else if (dev.model === "G5B" || dev.model === "G5B1") {
      ssid1 = parseForG5B(text);
      pass = genericParse(text).pass;
    } else {
      const g = genericParse(text);
      ssid1 = g.ssid; pass = g.pass;
    }

    ssid1 = normalizeZeros(ssid1);
    ssid2 = normalizeZeros(ssid2);
    pass = normalizeZeros(pass);

    fillOssForm({ ports, ssid1, ssid2, pass, has5g });
  }

  async function main() {
    const text = await readClipboard();
    rememberClipboardText(text);
    processText(text);
  }

  async function autoLoopTick() {
    // Само табът, който в момента се вижда и е с фокус, да попълва формата.
    // Иначе всеки отворен таб към същата страница реагира на промяната в клипборда.
    if (document.hidden || document.visibilityState !== "visible") return;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return;
    // Синхронизирай от localStorage, за да не се "задейства" в таб,
    // който просто е станал активен след като друг таб вече е обработил клипборда.
    loadLastClipboardText();
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.length > 2000 || text === lastClipboardText) return;
      // В auto mode не опитваме да попълваме за всеки произволен текст в клипборда.
      if (!isRecognizedClipboardText(text)) {
        rememberClipboardText(text);
        return;
      }
      rememberClipboardText(text);
      processText(text);
      autoErrorCount = 0;
    } catch (e) { autoErrorCount += 1; }
  }

  async function syncClipboardBaselineOnActivate() {
    // When a tab becomes active, we should NOT process the current clipboard content immediately.
    // We only want to react to changes *after* activation.
    if (document.hidden || document.visibilityState !== "visible") return;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.length > 2000) return;
      rememberClipboardText(text);
    } catch (e) {
      // silently ignore clipboard permission errors in auto mode
    }
  }

  function setAutoMode(enabled) {
    autoMode = enabled;
    if (autoTimer) clearInterval(autoTimer);
    if (autoMode) autoTimer = setInterval(autoLoopTick, 1000);
    if (autoButtonRef) autoButtonRef.style.backgroundColor = autoMode ? "#4CAF50" : "";
    // Persist across tabs (user wants auto mode always on).
    try { window.localStorage.setItem(AUTO_MODE_KEY, autoMode ? "1" : "0"); } catch (e) {}

    // Prime baseline in the active tab to avoid re-processing old clipboard on focus.
    if (autoMode) { try { syncClipboardBaselineOnActivate(); } catch (e) {} }
  }

  function injectButton() {
    if (document.getElementById("wifi-oss-assistant-btn")) return;
    const buttons = document.querySelectorAll("input[type='submit'], input[type='button'], button");
    let anchorBtn = null;
    let continueBtn = null;
    for (const b of buttons) {
      const txt = normalizeLabelText(b.value || b.textContent);
      if (txt === "запази") { anchorBtn = b; break; }
      if (!continueBtn && txt === "продължи") continueBtn = b;
    }
    if (!anchorBtn) anchorBtn = continueBtn;
    if (!anchorBtn || !anchorBtn.parentElement) { setTimeout(injectButton, 1000); return; }

    const fillBtn = document.createElement(anchorBtn.tagName.toLowerCase());
    fillBtn.id = "wifi-oss-assistant-btn";
    fillBtn.type = "button";
    fillBtn.value = fillBtn.textContent = "ПОПЪЛНИ";

    const autoBtn = document.createElement(anchorBtn.tagName.toLowerCase());
    autoBtn.id = "wifi-oss-assistant-auto-btn";
    autoBtn.type = "button";
    autoBtn.value = autoBtn.textContent = "АВТОМАТИЧНО";

    const resetBtn = document.createElement(anchorBtn.tagName.toLowerCase());
    resetBtn.id = "wifi-oss-assistant-reset-btn";
    resetBtn.type = "button";
    resetBtn.value = resetBtn.textContent = "RESET";

    [fillBtn, autoBtn, resetBtn].forEach(btn => {
      btn.className = anchorBtn.className;
      if (anchorBtn.getAttribute("style")) btn.setAttribute("style", anchorBtn.getAttribute("style"));
      btn.style.marginLeft = "6px";
    });

    fillBtn.addEventListener("click", (e) => { e.preventDefault(); main(); });
    autoBtn.addEventListener("click", (e) => { e.preventDefault(); setAutoMode(!autoMode); });
    resetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      clearRecycleEntrySelectionStorage();
      const root = document.getElementById(RECYCLE_ENTRY_ROOT_ID);
      const panel = root ? root.querySelector(".wifi-oss-recycle-category-panel") : null;
      if (panel) {
        panel.dataset.wifiOssRecycleSelected = "";
        if (!refreshRecycleEntryCategoryPanel(panel)) {
          const buttons = Array.from(panel.querySelectorAll("button[data-wifi-oss-recycle-cat]"));
          buttons.forEach(b => { b.style.background = "#585858"; });
        }
      }
      const inlineMsg = document.getElementById("wifi-oss-recycle-serial-msg");
      clearRecycleInlineAlert(inlineMsg);
      hideRecycleSerialHelp();
    });
    autoButtonRef = autoBtn;

    let savedAuto = false;
    try { savedAuto = window.localStorage.getItem(AUTO_MODE_KEY) === "1"; } catch (e) {}
    setAutoMode(savedAuto);

    // When switching tabs/windows, prevent "catching up" by processing the current clipboard.
    // Instead, treat the current clipboard as baseline and only process subsequent changes.
    window.addEventListener("focus", () => { if (autoMode) syncClipboardBaselineOnActivate(); }, true);
    document.addEventListener("visibilitychange", () => {
      if (autoMode && document.visibilityState === "visible") syncClipboardBaselineOnActivate();
    }, true);

    anchorBtn.parentElement.insertBefore(fillBtn, anchorBtn.nextSibling);
    anchorBtn.parentElement.insertBefore(autoBtn, fillBtn.nextSibling);
    anchorBtn.parentElement.insertBefore(resetBtn, autoBtn.nextSibling);
  }

  // -------------------------------
  // Warehouse cell list: PDF labels
  // -------------------------------
  const WAREHOUSE_LIST_ID = "_warehouseMaterialsCellList";
  const WAREHOUSE_EDIT_COLUMNS_BTN_ID = "_warehouseMaterialsCellList_edit_columns";
  const WAREHOUSE_PRINT_LABELS_BTN_ID = "_warehouseMaterialsCellList_print_labels";

  const RECYCLE_LIST_ID = "_recycleDevicesByTechnician";
  const RECYCLE_EDIT_COLUMNS_BTN_ID = "_recycleDevicesByTechnician_edit_columns";
  const RECYCLE_PRINT_LABELS_BTN_ID = "_recycleDevicesByTechnician_print_labels";

  let __labelTemplateSvgDataUrl = null;

  function mm(n) {
    return `${n}mm`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function deviceImageForModel(name) {
    const n = String(name || "").toLowerCase();
    // Use the new device images from images/devices/.
    if (n.includes("nx220")) return "images/devices/TP_Link_NX220v_5G-removebg-preview.webp";
    if (n.includes("g5ts")) return "images/devices/ZTE_G5TS_5G-removebg-preview.webp";
    if (n.includes("nx520")) return "images/devices/TP-Link_NX520_5G-removebg-preview.webp";
    if (n.includes("hx520")) return "images/devices/Router_TP_Link_HX520_Home_WiFi-removebg-preview.webp";
    if (n.includes("k562e")) return "images/devices/Router_Huawei_K562E-10_Home_WiFi-removebg-preview.webp";
    if (n.includes("adb") && n.includes("2220")) return "images/devices/Modem_ADB_VoIP_VV_2220_AT-removebg-preview.webp";
    if (n.includes("b311") && n.includes("white")) return "images/devices/Huawei_B311-221_white+ext._Antenna-removebg-preview.webp";
    if (n.includes("b311")) return "images/devices/Huawei_B311-221_black_+ext._Antenna-removebg-preview.webp";
    if (n.includes("b310") && n.includes("generic")) return "images/devices/Huawei_B310s-22_generic-removebg-preview.webp";
    if (n.includes("b310")) return "images/devices/Huawei_B310s-22+2pc_FMC_external_antenna-removebg-preview.webp";
    if (n.includes("hg8145")) return "images/devices/Huawei_GPON_HG8145V5-removebg-preview.webp";
    if (n.includes("deco m4")) return "images/devices/TP-LINK_Deco_M4__AC1200__2xGbE__MU-MIMO-removebg-preview.webp";
    if (n.includes("archer a6")) return "images/devices/Router_TP-Link_Archer_A6AC1200DB_LVA-removebg-preview.webp";
    if (n.includes("wr850n")) return "images/devices/Router_TP-Link_TL-WR850N-removebg-preview.webp";
    if (n.includes("ex220")) return "images/devices/Router_TP-Link_EX220-removebg-preview.webp";
    if (n.includes("h3601p")) return "images/devices/Router_ZTE_ZXHN_H3601P_RG_WiFi-removebg-preview.webp";
    if (n.includes("801a")) return "images/devices/ZTE_MC888A_5G-removebg-preview.webp";
    if (n.includes("mc888a")) return "images/devices/ZTE_G5B1_5G-removebg-preview.webp";
    if (n.includes("mf283u")) return "images/devices/ZTE_MF283U+ext._Antenna-removebg-preview.webp";
    if (n.includes("mf293n")) return "images/devices/ZTE_MF293N_+_ext._Antenna-removebg-preview.webp";
    if (n.includes("mf296r")) return "images/devices/ZTE_MF296R-removebg-preview.webp";
    if (n.includes("g5b")) return "images/devices/ZTE_G5B1_5G-removebg-preview.webp";
    if (n.includes("kstb6106")) return "images/devices/Kaon_KSTB6106_DVB-C_Zapper-removebg-preview.webp";
    if (n.includes("kstb5020")) return "images/devices/Kaon_KSTB5020_XploreTV.webp";
    if (n.includes("kstb5019")) return "images/devices/Kaon_KSTB5019_XploreTV_IP_only__BCM7268_-removebg-preview.webp";
    if (n.includes("kstb1001")) return "images/devices/DTH_STB_KAON_KSTB1001-BCM73625-1GB-removebg-preview.webp";
    if (n.includes("nagra")) return "images/devices/DTH_Nagra_DTS3460.webp";
    if (n.includes("b866")) return "images/devices/STB_ZTE_B866V2F02__AndroidTV_-removebg-preview.webp";
    if (n.includes("dv9161")) return "images/devices/STB_SDMC_DV9161__AndroidTV_-removebg-preview.webp";
    if (n.includes("b700")) return "images/devices/STB_ZXV_B700v5-removebg-preview.webp";
    if (n.includes("f670")) return "images/devices/GPON_CPE_ZXHN_F670L_V1.1-removebg-preview.webp";
    if (n.includes("f6600r")) return "images/devices/ZTE_ONT_ZXHN_F6600R-removebg-preview.webp";
    if (n.includes("f660op")) return "images/devices/GPON_CPE_ZXHN_F6600P_V9.0-removebg-preview.webp";
    if (n.includes("f660")) return "images/devices/GPON_CPE_ZXHN_F600-removebg-preview.webp";
    if (n.includes("technicolor")) return "images/devices/Modem_Technicolor7200D3WiFirefurbCROA-removebg-preview.webp";
    return null;
  }

  function getSerialNumbersFromList(listRootId) {
    const root = document.getElementById(listRootId);
    if (!root) return [];

    const table = root.querySelector("table");
    if (!table) return [];

    const headerCells = Array.from(table.querySelectorAll("tr th"));
    let serialIdx = headerCells.findIndex(th => (th.getAttribute("rel") || "").toLowerCase() === "serialnumber");
    if (serialIdx < 0) {
      serialIdx = headerCells.findIndex(th => {
        const t = (th.textContent || "").trim().toLowerCase();
        return t === "сериен номер" || t.includes("сериен номер") || t === "serial number" || t.includes("serial");
      });
    }
    if (serialIdx < 0) serialIdx = 2; // fallback

    const rows = Array.from(table.querySelectorAll("tbody tr")).filter(tr => tr.querySelectorAll("td").length > 0);
    const values = [];
    for (const tr of rows) {
      const tds = tr.querySelectorAll("td");
      const raw = (tds[serialIdx]?.textContent || "").trim();
      if (raw) values.push(raw);
    }

    // unique, stable order
    const seen = new Set();
    const uniq = [];
    for (const v of values) {
      if (seen.has(v)) continue;
      seen.add(v);
      uniq.push(v);
    }
    return uniq;
  }

  function getSelectedSerialNumbersFromList(listRootId) {
    const root = document.getElementById(listRootId);
    if (!root) return [];

    const table = root.querySelector("table");
    if (!table) return [];

    const headerCells = Array.from(table.querySelectorAll("tr th"));
    let serialIdx = headerCells.findIndex(th => (th.getAttribute("rel") || "").toLowerCase() === "serialnumber");
    if (serialIdx < 0) {
      serialIdx = headerCells.findIndex(th => {
        const t = (th.textContent || "").trim().toLowerCase();
        return t === "сериен номер" || t.includes("сериен номер") || t === "serial number" || t.includes("serial");
      });
    }
    if (serialIdx < 0) serialIdx = 2;

    const rows = Array.from(table.querySelectorAll("tbody tr")).filter(tr => tr.querySelectorAll("td").length > 0);
    const values = [];

    for (const tr of rows) {
      // Select checkbox is in the first column in this list; ignore header "check-all".
      const isChecked = !!tr.querySelector("td input[type='checkbox'].icheck-input:checked");
      if (!isChecked) continue;

      const tds = tr.querySelectorAll("td");
      const raw = (tds[serialIdx]?.textContent || "").trim();
      if (raw) values.push(raw);
    }

    const seen = new Set();
    const uniq = [];
    for (const v of values) {
      if (seen.has(v)) continue;
      seen.add(v);
      uniq.push(v);
    }
    return uniq;
  }

  function getRecycleDevicesForBarcodeSheet({ preferSelected = true } = {}) {
    const root = document.getElementById(RECYCLE_LIST_ID);
    if (!root) return [];

    const table = root.querySelector("table");
    if (!table) return [];

    const headerCells = Array.from(table.querySelectorAll("tr th"));

    const findIdx = (relName, bgTextMatchers, fallbackIdx) => {
      let idx = headerCells.findIndex(th => (th.getAttribute("rel") || "").toLowerCase() === relName);
      if (idx < 0) {
        idx = headerCells.findIndex(th => {
          const t = (th.textContent || "").trim().toLowerCase();
          return bgTextMatchers.some(m => (typeof m === "string" ? t === m : m.test(t)));
        });
      }
      return idx >= 0 ? idx : fallbackIdx;
    };

    const nameIdx = findIdx("name", ["име"], 3);
    const serialIdx = findIdx("serialnumber", ["сериен номер", "serial number"], 4);
    const sapIdx = findIdx("sapid", ["sapid", "sap id"], 5);

    const rows = Array.from(table.querySelectorAll("tbody tr")).filter(tr => tr.querySelectorAll("td").length > 0);
    const checkedRows = preferSelected
      ? rows.filter(tr => !!tr.querySelector("td input[type='checkbox'].icheck-input:checked"))
      : [];
    const useRows = (preferSelected && checkedRows.length) ? checkedRows : rows;

    const items = [];
    for (const tr of useRows) {
      const tds = tr.querySelectorAll("td");
      const name = (tds[nameIdx]?.textContent || "").trim();
      const serial = (tds[serialIdx]?.textContent || "").trim();
      const sapId = (tds[sapIdx]?.textContent || "").trim();
      if (!serial) continue;
      items.push({ name, serial, sapId });
    }

    // unique by serial, stable order
    const seen = new Set();
    const uniq = [];
    for (const it of items) {
      if (seen.has(it.serial)) continue;
      seen.add(it.serial);
      uniq.push(it);
    }
    return uniq;
  }

  function getWarehouseSerialNumbers() {
    return getSerialNumbersFromList(WAREHOUSE_LIST_ID);
  }

  function toSvgDataUrl(svgText) {
    // Keep it ASCII-safe; btoa fails for non-latin chars.
    const utf8 = encodeURIComponent(svgText)
      .replaceAll(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)));
    const base64 = btoa(utf8);
    return `data:image/svg+xml;base64,${base64}`;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async function tryFetchAsDataUrl(path, kind) {
    const url = (typeof chrome !== "undefined" && chrome.runtime?.getURL)
      ? chrome.runtime.getURL(path)
      : path;
    const res = await fetch(url);
    if (!res.ok) return null;

    if (kind === "svg") {
      const text = await res.text();
      return toSvgDataUrl(text);
    }
    if (kind === "png") {
      const buf = await res.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      return `data:image/png;base64,${base64}`;
    }
    return null;
  }

  async function getLabelTemplateDataUrl() {
    if (__labelTemplateSvgDataUrl) return __labelTemplateSvgDataUrl;

    // Prefer SVG (crisper printing). Fallback to PNG.
    const svg = await tryFetchAsDataUrl("images/label.svg", "svg");
    if (svg) { __labelTemplateSvgDataUrl = svg; return svg; }

    const png = await tryFetchAsDataUrl("images/label.png", "png");
    if (png) { __labelTemplateSvgDataUrl = png; return png; }

    return null;
  }

  function buildA4LabelsHtml(serialNumbers, { labelSvgDataUrl }) {
    // Specs:
    // A4: 210 x 297mm
    // Label: 99.1 x 67.7mm
    // 8 labels per page -> 2 cols x 4 rows
    const pageW = 210;
    const pageH = 297;
    const labelW = 99.1;
    const labelH = 67.7;

    const cols = 2;
    const rows = 4;
    const perPage = cols * rows;

    const hGap = (pageW - cols * labelW) / (cols + 1); // left + gutter + right (legacy calc)
    const vGap = (pageH - rows * labelH) / (rows + 1); // top + gaps + bottom (legacy calc)
    const pageOffsetY = -1.5; // mm: negative moves labels up; tweak as needed
    const pageOffsetX = 0.5; // mm: positive moves labels right; tweak as needed

    // Gap tweaks (in mm).
    // - vertical: set to 0 (no gap between rows)
    // - horizontal: reduce slightly (between columns)
    const gapReduceX = 2; // mm: reduce the space between left/right labels (tweak 0..4)
    const colGap = Math.max(0, hGap - gapReduceX);
    const remainingH = Math.max(0, pageW - cols * labelW - colGap);
    const padH = remainingH / 2;
    const vGapUsed = 0;

    // With row-gap = 0, use the remaining vertical space as page padding.
    const remainingV = Math.max(0, pageH - rows * labelH);
    const padV = remainingV / 2;

    const pages = [];
    for (let i = 0; i < serialNumbers.length; i += perPage) {
      const chunk = serialNumbers.slice(i, i + perPage);
      pages.push(chunk);
    }

    const labelSvgUrl = labelSvgDataUrl;

    // Coordinates are based on label.svg viewBox: 1145 x 786.
    // If you need perfect 1:1 alignment, we can tweak these 4 numbers.
    // SN barcode: slightly larger overall, but a bit shorter in height to keep text readable.
    // Converted to label.svg viewBox units (1145x786 on 99.1x67.7mm label).
    // Give SN enough physical width to increase X-dimension (scanner readability), but keep it within the original template.
    // Keep SN away from the right-side WiFi logo area.
    const SN_BOX = { x: 245, y: 445, w: 600, h: 226 };
    const SN_TEXT = { x: 565, y: 676 }; // text baseline (centered, moved down)

    const labelMarkup = (sn) => {
      // Use the provided label.svg as the exact template.
      // Only SN barcode + human-readable text are overlaid.
      return `
        <div class="label">
          <img class="label-bg" alt="" src="${escapeHtml(labelSvgUrl)}" />

          <!-- White mask to cover the original SN barcode/text in the template -->
          <div class="sn-mask"></div>

          <!-- Generated SN barcode (Code128) -->
          <div
            class="sn-barcode barcode code128"
            data-value="${escapeHtml(sn)}"
            data-h="18"
            data-w="60"
          ></div>

          <!-- Generated SN text -->
          <div class="sn-text">${escapeHtml(sn)}</div>
        </div>`;
    };

    const pagesHtml = pages.map((sns, pageIdx) => {
      const labels = sns.map(labelMarkup).join("\n");
      const pageBreak = pageIdx < pages.length - 1 ? `<div class="page-break"></div>` : "";
      return `<div class="page">${labels}</div>${pageBreak}`;
    }).join("\n");

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Serial number labels</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 0;
      }
      html, body {
        width: ${mm(pageW)};
        height: ${mm(pageH)};
        margin: 0;
        padding: 0;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page {
        width: ${mm(pageW)};
        height: ${mm(pageH)};
        padding: 0;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: repeat(${cols}, ${mm(labelW)});
        grid-template-rows: repeat(${rows}, ${mm(labelH)});
        column-gap: ${mm(colGap)};
        row-gap: ${mm(vGapUsed)};
        padding-left: ${mm(padH + pageOffsetX)};
        padding-right: ${mm(Math.max(0, padH - pageOffsetX))};
        padding-top: ${mm(padV + pageOffsetY)};
        padding-bottom: ${mm(Math.max(0, padV - pageOffsetY))};
      }
      .page-break {
        page-break-after: always;
      }

      .label {
        width: ${mm(labelW)};
        height: ${mm(labelH)};
        box-sizing: border-box;
        border: 1.2px solid #000;
        border-radius: 10px;
        padding: 0;
        overflow: hidden;
        position: relative;
        background: #fff;
        font-family: "Arial Narrow", Arial, Helvetica, sans-serif;
        color: #000;
      }
      .label-bg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
        pointer-events: none;
        user-select: none;
      }

      .barcode { width: 100%; }
      .barcode svg,
      .barcode img {
        display: block;
        width: 100%;
        height: 100%;
        image-rendering: crisp-edges;
        image-rendering: pixelated;
      }

      /* Overlay SN elements using % based on the SVG coordinate system */
      .sn-mask {
        position: absolute;
        left: ${(SN_BOX.x / 1145) * 100}%;
        top: ${(SN_BOX.y / 786) * 100}%;
        width: ${(SN_BOX.w / 1145) * 100}%;
        height: ${((SN_TEXT.y - SN_BOX.y) / 786) * 100}%;
        background: #fff;
      }
      .sn-barcode {
        position: absolute;
        left: ${(SN_BOX.x / 1145) * 100}%;
        top: ${(SN_BOX.y / 786) * 100}%;
        width: ${(SN_BOX.w / 1145) * 100}%;
        height: ${(SN_BOX.h / 786) * 100}%;
      }
      .sn-barcode svg {
        width: 100%;
        height: 100%;
        shape-rendering: crispEdges;
      }
      .sn-text {
        position: absolute;
        left: ${(SN_TEXT.x / 1145) * 100}%;
        top: ${(SN_TEXT.y / 786) * 100}%;
        transform: translate(-50%, 0);
        font-family: "Arial Narrow", Arial, Helvetica, sans-serif;
        font-weight: 400;
        font-size: 14px;
        letter-spacing: 0.2px;
        white-space: nowrap;
      }

      .hint {
        position: fixed;
        left: 6mm;
        bottom: 6mm;
        font-size: 3.2mm;
        color: #444;
      }
      @media print {
        .hint { display: none; }
      }
    </style>
  </head>
  <body>
    ${pagesHtml}
    <div class="hint">Съвет: натисни Ctrl+P → “Save as PDF”</div>
    <script>
      // Minimal Code128 (subset B) SVG renderer (no external libs).
      // NOTE: This supports ASCII 32..126 and a few common chars; enough for your values.
      const CODE128_PATTERNS = [
        "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212",
        "112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131",
        "311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321",
        "112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121",
        "313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
        "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114",
        "122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212",
        "124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113",
        "114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"
      ];

      function digitRunLength(s, from) {
        let n = 0;
        for (let i = from; i < s.length; i++) {
          const c = s.charCodeAt(i);
          if (c < 48 || c > 57) break;
          n += 1;
        }
        return n;
      }

      function code128EncodeAuto(value) {
        // Auto-switch between Code B and Code C.
        // This mirrors what label software typically does for mixed alpha+numeric data.
        if (!value) throw new Error("Empty barcode value");

        let i = 0;
        const leadDigits = digitRunLength(value, 0);
        let set = (leadDigits >= 4 && leadDigits % 2 === 0) ? "C" : "B";
        const codes = [set === "C" ? 105 : 104]; // Start C / Start B

        while (i < value.length) {
          if (set === "C") {
            const run = digitRunLength(value, i);
            if (run >= 2) {
              const pair = value.slice(i, i + 2);
              codes.push(Number(pair));
              i += 2;
              continue;
            }
            // Not enough digits for C pair -> switch to B
            codes.push(100); // Code B
            set = "B";
            continue;
          }

          // set === "B"
          const run = digitRunLength(value, i);
          if (run >= 4) {
            // For odd-length numeric run, encode 1 char in B, then switch to C.
            if (run % 2 === 1) {
              const cc = value.charCodeAt(i);
              if (cc < 32 || cc > 126) throw new Error("Unsupported character for Code128-B");
              codes.push(cc - 32);
              i += 1;
            }
            codes.push(99); // Code C
            set = "C";
            continue;
          }

          const cc = value.charCodeAt(i);
          if (cc < 32 || cc > 126) throw new Error("Unsupported character for Code128-B");
          codes.push(cc - 32);
          i += 1;
        }

        // checksum
        let sum = codes[0];
        for (let p = 1; p < codes.length; p++) sum += codes[p] * p;
        const checksum = sum % 103;
        codes.push(checksum);
        codes.push(106); // Stop
        return codes;
      }

      function code128Svg(value, targetWidthMm, barHeightMm) {
        const codes = code128EncodeAuto(value);
        const pattern = codes.map(c => CODE128_PATTERNS[c]).join("");
        // pattern is a sequence of module widths alternating bar/space, starting with bar
        const modules = pattern.split("").map(d => Number(d));
        const totalModules = modules.reduce((a, b) => a + b, 0);

        // We render in "module units" and scale via viewBox.
        const h = 100; // arbitrary units
        const quiet = 12; // quiet zone on both sides in module units (helps scanners)
        const w = totalModules + quiet * 2;
        let x = quiet;
        let drawBar = true;
        const rects = [];
        for (const mw of modules) {
          if (drawBar) rects.push('<rect x="' + x + '" y="0" width="' + mw + '" height="' + h + '" fill="#000" />');
          x += mw;
          drawBar = !drawBar;
        }

        return (
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '"' +
          ' width="' + targetWidthMm + 'mm" height="' + barHeightMm + 'mm" preserveAspectRatio="none" shape-rendering="crispEdges">' +
          rects.join("") +
          "</svg>"
        );
      }

      function code128PngDataUrl(value, targetWidthMm, barHeightMm) {
        // Render to canvas with integer pixel modules to avoid print aliasing / merged bars.
        const codes = code128EncodeAuto(value);
        const pattern = codes.map(c => CODE128_PATTERNS[c]).join("");
        const modules = pattern.split("").map(d => Number(d));
        const totalModules = modules.reduce((a, b) => a + b, 0);
        const quiet = 12;
        const total = totalModules + quiet * 2;

        // Approx 300dpi -> ~12 px/mm. Use a bit higher for safety.
        const pxPerMm = 20;
        let wPx = Math.max(300, Math.round(targetWidthMm * pxPerMm));
        const hPx = Math.max(60, Math.round(barHeightMm * pxPerMm));

        // Ensure enough pixels per module to avoid ultra-thin bars after print scaling.
        // Target >= 4px/module for scanners + glossy paper.
        const minModulePx = 4;
        if (wPx < total * minModulePx) wPx = total * minModulePx;

        // Choose integer pixels per module (>=1) to prevent merging.
        const modulePx = Math.max(minModulePx, Math.floor(wPx / total));
        const usedW = modulePx * total;
        const leftPad = Math.floor((wPx - usedW) / 2);

        const canvas = document.createElement("canvas");
        canvas.width = wPx;
        canvas.height = hPx;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.imageSmoothingEnabled = false;

        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, wPx, hPx);

        // Use pure black for maximum scanner contrast.
        ctx.fillStyle = "#000";
        let x = leftPad + quiet * modulePx;
        let drawBar = true;
        for (const mw of modules) {
          const ww = mw * modulePx;
          if (drawBar) {
            // IMPORTANT: keep exact module ratios (no per-bar shrinking/expansion),
            // otherwise Code128 becomes unreadable for scanners.
            ctx.fillRect(x, 0, ww, hPx);
          }
          x += ww;
          drawBar = !drawBar;
        }

        return canvas.toDataURL("image/png");
      }

      function renderBarcodes() {
        const nodes = document.querySelectorAll(".barcode.code128");
        for (const n of nodes) {
          const value = n.getAttribute("data-value") || "";
          const h = Number(n.getAttribute("data-h") || "10");
          const w = Number(n.getAttribute("data-w") || "60");
          try {
            const png = code128PngDataUrl(value, w, h);
            if (png) {
              n.innerHTML = '<img alt="" src="' + png + '"/>';
            } else {
              n.innerHTML = code128Svg(value, w, h);
            }
          } catch (e) {
            n.innerHTML = "<div style='font-size:3mm;color:#c00'>Barcode error</div>";
          }
        }
      }

      renderBarcodes();
    </script>
  </body>
</html>`;
  }

  function buildRecycleBarcodeSheetHtml(items) {
    // A4: 210 x 297mm, 24 slots: 3 cols x 8 rows
    const pageW = 210;
    const pageH = 297;
    const cols = 3;
    const rows = 8;
    const perPage = cols * rows;

    // Sticker sheet specs (given by user):
    // A4: 210x297mm, label: 70x37mm, straight corners.
    // 3*70 = 210mm exactly; 8*37 = 296mm -> 1mm remainder for vertical centering.
    const labelW = 70;
    const labelH = 37;
    const gapX = 0;
    const gapY = 0;
    // Many printers/browsers have tiny non-printable margins.
    // Add a small horizontal safe padding to avoid clipping at left/right page edges.
    const padX = 1.5; // mm
    const padY = (pageH - rows * labelH) / 2; // 0.5mm top + 0.5mm bottom

    // Use computed cell width so 3 columns fit within the safe padding.
    const cellW = (pageW - padX * 2 - gapX * (cols - 1)) / cols;

    const pages = [];
    for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
    if (!pages.length) pages.push([]);

    const slot = (it) => {
      if (!it) return `<div class="slot empty"></div>`;
      const name = escapeHtml(it.name || "");
      const sap = escapeHtml(it.sapId || "");
      const sn = escapeHtml(it.serial || "");
      return `<div class="slot">
  <div class="name">${name}</div>
  <div class="sap">SAP ID: ${sap}</div>
  <div class="barcode code128" data-value="${sn}" data-w="${Math.max(54, Math.floor(cellW - 10))}" data-h="6"></div>
  <div class="sn">${sn}</div>
</div>`;
    };

    const buildPage = (chunk) => {
      const filled = chunk.slice(0, perPage);
      const padded = filled.concat(Array.from({ length: Math.max(0, perPage - filled.length) }, () => null));
      const html = padded.map(slot).join("\n");
      return `<div class="page">${html}</div>`;
    };

    const pageHtml = pages.map((p, i) => buildPage(p) + (i < pages.length - 1 ? `<div class="page-break"></div>` : "")).join("\n");

    // Uses same pure JS Code128 generator as the ADB label printer (no external libs).
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Barcode labels</title>
    <style>
      @page { size: A4; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page {
        width: ${mm(pageW)};
        height: ${mm(pageH)};
        box-sizing: border-box;
        padding: ${mm(padY)} ${mm(padX)};
        display: grid;
        grid-template-columns: repeat(${cols}, ${mm(cellW)});
        grid-template-rows: repeat(${rows}, ${mm(labelH)});
        column-gap: ${mm(gapX)};
        row-gap: ${mm(gapY)};
        align-content: start;
      }
      .page-break { break-after: page; }
      .slot {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 0 ${mm(2)}; /* inner safe padding inside each label */
        text-align: center;
      }
      .slot.empty { opacity: 0; }
      .name {
        font-family: Arial, sans-serif;
        font-weight: 700;
        font-size: ${mm(3.0)};
        line-height: 1.1;
        height: ${mm(8)};
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        max-width: 100%;
        box-sizing: border-box;
        padding: 0 ${mm(0.8)};
      }
      .sap {
        font-family: Arial, sans-serif;
        font-weight: 400;
        font-size: ${mm(2.7)};
        height: ${mm(4)};
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        max-width: 100%;
      }
      .barcode { width: 100%; height: ${mm(6)}; display: flex; justify-content: center; align-items: center; }
      .barcode img, .barcode svg { width: 100%; height: 100%; }
      .sn {
        font-family: Arial, sans-serif;
        font-size: ${mm(2.7)};
        height: ${mm(4)};
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        letter-spacing: 0.2px;
      }
    </style>
  </head>
  <body>
    ${pageHtml}
    <script>
      // Minimal Code128 SVG/PNG renderer (same snippet as the existing labels printer).
      const CODE128_PATTERNS = [
        "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212",
        "112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131",
        "311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321",
        "112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121",
        "313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
        "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114",
        "122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212",
        "124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113",
        "114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"
      ];

      function digitRunLength(s, from) {
        let n = 0;
        for (let i = from; i < s.length; i++) {
          const c = s.charCodeAt(i);
          if (c < 48 || c > 57) break;
          n += 1;
        }
        return n;
      }

      function code128EncodeAuto(value) {
        // Auto-switch between Code B and Code C.
        if (!value) throw new Error("Empty barcode value");

        let i = 0;
        const leadDigits = digitRunLength(value, 0);
        let set = (leadDigits >= 4 && leadDigits % 2 === 0) ? "C" : "B";
        const codes = [set === "C" ? 105 : 104]; // Start C / Start B

        while (i < value.length) {
          if (set === "C") {
            const run = digitRunLength(value, i);
            if (run >= 2) {
              const pair = value.slice(i, i + 2);
              codes.push(Number(pair));
              i += 2;
              continue;
            }
            codes.push(100); // Code B
            set = "B";
            continue;
          }

          // set === "B"
          const run = digitRunLength(value, i);
          if (run >= 4) {
            if (run % 2 === 1) {
              const cc = value.charCodeAt(i);
              if (cc < 32 || cc > 126) throw new Error("Unsupported character for Code128-B");
              codes.push(cc - 32);
              i += 1;
            }
            codes.push(99); // Code C
            set = "C";
            continue;
          }

          const cc = value.charCodeAt(i);
          if (cc < 32 || cc > 126) throw new Error("Unsupported character for Code128-B");
          codes.push(cc - 32);
          i += 1;
        }

        let sum = codes[0];
        for (let p = 1; p < codes.length; p++) sum += codes[p] * p;
        const checksum = sum % 103;
        codes.push(checksum);
        codes.push(106); // Stop
        return codes;
      }

      function code128Svg(value, targetWidthMm, barHeightMm) {
        const codes = code128EncodeAuto(value);
        const pattern = codes.map(c => CODE128_PATTERNS[c]).join("");
        const modules = pattern.split("").map(d => Number(d));
        const totalModules = modules.reduce((a, b) => a + b, 0);

        const h = 100;
        const quiet = 12;
        const w = totalModules + quiet * 2;
        let x = quiet;
        let drawBar = true;
        const rects = [];
        for (const mw of modules) {
          if (drawBar) rects.push('<rect x="' + x + '" y="0" width="' + mw + '" height="' + h + '" fill="#000" />');
          x += mw;
          drawBar = !drawBar;
        }

        return (
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '"' +
          ' width="' + targetWidthMm + 'mm" height="' + barHeightMm + 'mm" preserveAspectRatio="none" shape-rendering="crispEdges">' +
          rects.join("") +
          "</svg>"
        );
      }

      function code128PngDataUrl(value, targetWidthMm, barHeightMm) {
        const codes = code128EncodeAuto(value);
        const pattern = codes.map(c => CODE128_PATTERNS[c]).join("");
        const modules = pattern.split("").map(d => Number(d));
        const totalModules = modules.reduce((a, b) => a + b, 0);
        const quiet = 12;
        const total = totalModules + quiet * 2;

        const pxPerMm = 20;
        let wPx = Math.max(300, Math.round(targetWidthMm * pxPerMm));
        const hPx = Math.max(60, Math.round(barHeightMm * pxPerMm));

        const minModulePx = 4;
        if (wPx < total * minModulePx) wPx = total * minModulePx;

        const modulePx = Math.max(minModulePx, Math.floor(wPx / total));
        const usedW = modulePx * total;
        const leftPad = Math.floor((wPx - usedW) / 2);

        const canvas = document.createElement("canvas");
        canvas.width = wPx;
        canvas.height = hPx;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.imageSmoothingEnabled = false;

        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, wPx, hPx);

        ctx.fillStyle = "#000";
        let x = leftPad + quiet * modulePx;
        let drawBar = true;
        for (const mw of modules) {
          const ww = mw * modulePx;
          if (drawBar) ctx.fillRect(x, 0, ww, hPx);
          x += ww;
          drawBar = !drawBar;
        }

        return canvas.toDataURL("image/png");
      }

      function renderBarcodes() {
        const nodes = document.querySelectorAll(".barcode.code128");
        for (const n of nodes) {
          const value = n.getAttribute("data-value") || "";
          const h = Number(n.getAttribute("data-h") || "6");
          const w = Number(n.getAttribute("data-w") || "55");
          try {
            const png = code128PngDataUrl(value, w, h);
            if (png) n.innerHTML = '<img alt="" src="' + png + '"/>';
            else n.innerHTML = code128Svg(value, w, h);
          } catch (e) {
            n.innerHTML = "<div style='font-size:3mm;color:#c00'>Barcode error</div>";
          }
        }
      }
      renderBarcodes();
    </script>
  </body>
</html>`;
  }

  async function printRecycleBarcodeSheetInIframe(items) {
    const html = buildRecycleBarcodeSheetHtml(items);
    const iframe = ensurePrintIframe();
    iframe.srcdoc = html;

    await new Promise((resolve) => {
      const done = () => resolve();
      const t = setTimeout(done, 500);
      iframe.onload = () => { clearTimeout(t); done(); };
    });

    try {
      if (iframe.dataset.wifiOssPrinting === "1") return;
      iframe.dataset.wifiOssPrinting = "1";

      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (doc) {
        const imgs = Array.from(doc.images || []);
        await Promise.race([
          Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; }))),
          new Promise(r => setTimeout(r, 800))
        ]);
      } else {
        await new Promise(r => setTimeout(r, 300));
      }
      win?.focus?.();
      win?.print?.();
      setTimeout(() => { try { delete iframe.dataset.wifiOssPrinting; } catch (e) { iframe.dataset.wifiOssPrinting = "0"; } }, 1500);
    } catch (e) {
      try {
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "barcode-labels.html";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        alert("Не успях да пусна print директно. Свалих 'barcode-labels.html' — отвори го и принтирай към PDF.");
      } catch (e2) {
        alert("Не успях да отворя/принтирам баркод етикетите. Опитай с друг браузър (Edge/Chrome).");
      }
    }
  }

  function bindRecyclePrintBarcodeButton() {
    const btn = document.getElementById("_recycleDevicesByTechnician_printBarcode");
    if (!btn) return false;
    // Do NOT override the existing "Принтирай баркод" button behavior.
    // The user wants the new button to handle checkbox printing instead.

    // Add companion button: "Принтирай Всичко"
    const existingAllBtnId = "_recycleDevicesByTechnician_printAll";
    if (!document.getElementById(existingAllBtnId)) {
      const allBtn = document.createElement("button");
      allBtn.id = existingAllBtnId;
      allBtn.type = "button";
      allBtn.className = btn.className || "";
      // copy inline styles if any, then tweak spacing
      if (btn.getAttribute("style")) allBtn.setAttribute("style", btn.getAttribute("style"));
      allBtn.style.marginLeft = "8px";
      allBtn.innerHTML = 'Принтирай Всичко';

      const anchorA = btn.closest("a");
      if (anchorA && anchorA.parentElement) {
        anchorA.parentElement.insertBefore(allBtn, anchorA.nextSibling);
      } else if (btn.parentElement) {
        btn.parentElement.insertBefore(allBtn, btn.nextSibling);
      }

      allBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Like ADB labels: if rows are selected -> print only selected; otherwise print all.
        const items = getRecycleDevicesForBarcodeSheet({ preferSelected: true });
        if (!items.length) {
          alert("Не намерих серийни номера в таблицата.");
          return;
        }
        printRecycleBarcodeSheetInIframe(items);
      }, true);
    }

    return true;
  }

  function ensurePrintIframe() {
    let iframe = document.getElementById("wifi-oss-labels-print-iframe");
    if (iframe) return iframe;
    iframe = document.createElement("iframe");
    iframe.id = "wifi-oss-labels-print-iframe";
    iframe.setAttribute("aria-hidden", "true");
    // Keep it off-screen but still renderable for printing
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    document.documentElement.appendChild(iframe);
    return iframe;
  }

  async function printLabelsInIframe(serialNumbers) {
    let labelSvgDataUrl = null;
    try {
      labelSvgDataUrl = await getLabelTemplateDataUrl();
    } catch (e) {
      labelSvgDataUrl = null;
    }

    if (!labelSvgDataUrl) {
      alert("Не успях да заредя шаблона за етикета (label.svg/label.png). Провери дали extension-ът е инсталиран правилно.");
      return;
    }

    const html = buildA4LabelsHtml(serialNumbers, { labelSvgDataUrl });
    const iframe = ensurePrintIframe();

    // Use srcdoc where supported
    iframe.srcdoc = html;

    // Wait for iframe to load enough to have a contentWindow
    await new Promise((resolve) => {
      const done = () => resolve();
      const t = setTimeout(done, 500);
      iframe.onload = () => { clearTimeout(t); done(); };
    });

    try {
      // Guard: avoid double print if onload fires more than once
      if (iframe.dataset.wifiOssPrinting === "1") return;
      iframe.dataset.wifiOssPrinting = "1";

      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;

      // Wait a bit for barcodes (canvas->img) and template image to be ready
      if (doc) {
        const imgs = Array.from(doc.images || []);
        await Promise.race([
          Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; }))),
          new Promise(r => setTimeout(r, 800))
        ]);
      } else {
        await new Promise(r => setTimeout(r, 300));
      }

      win?.focus?.();
      win?.print?.();

      // allow next manual print after a short delay
      setTimeout(() => { try { delete iframe.dataset.wifiOssPrinting; } catch (e) { iframe.dataset.wifiOssPrinting = "0"; } }, 1500);
    } catch (e) {
      // As a fallback, offer a downloadable HTML that the user can open and print.
      try {
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "labels.html";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        alert("Не успях да пусна print директно. Свалих 'labels.html' — отвори го и принтирай към PDF.");
      } catch (e2) {
        alert("Не успях да отворя/принтирам етикетите. Опитай с друг браузър (Edge/Chrome).");
      }
    }
  }

  function injectLabelsButton({ listId, editColumnsBtnId, printBtnId }) {
    const listRoot = document.getElementById(listId);
    if (!listRoot) return false;

    const pagination = listRoot.querySelector(".pagination");
    if (!pagination) return false;

    if (document.getElementById(printBtnId)) return true;

    const anchor = document.getElementById(editColumnsBtnId);
    if (!anchor) return false;

    const btn = document.createElement("button");
    btn.id = printBtnId;
    btn.className = anchor.className || "icon-only";
    btn.title = "Етикети (PDF) - всички серийни номера";
    btn.type = "button";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.marginLeft = "8px";
    btn.style.marginRight = "8px";
    btn.innerHTML = '<span class="fas fa-print"> </span>';

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      let sns = [];
      if (listId === RECYCLE_LIST_ID) {
        // If user selected rows -> print only selected; otherwise print all.
        const selected = getSelectedSerialNumbersFromList(listId);
        sns = selected.length ? selected : getSerialNumbersFromList(listId);
      } else {
        sns = getSerialNumbersFromList(listId);
      }
      if (!sns.length) {
        alert("Не намерих серийни номера в таблицата.");
        return;
      }
      printLabelsInIframe(sns);
    });

    // Insert as sibling (same parent as the anchor button) to avoid nesting/overlap issues.
    if (anchor.parentElement) {
      anchor.parentElement.insertBefore(btn, anchor.nextSibling);
    } else {
      anchor.insertAdjacentElement("afterend", btn);
    }
    return true;
  }

  function startLabelsObservers() {
    // Many listControls are dynamic; watch DOM and inject when available.
    const tryInjectAll = () => {
      const a = injectLabelsButton({
        listId: WAREHOUSE_LIST_ID,
        editColumnsBtnId: WAREHOUSE_EDIT_COLUMNS_BTN_ID,
        printBtnId: WAREHOUSE_PRINT_LABELS_BTN_ID
      });
      const b = injectLabelsButton({
        listId: RECYCLE_LIST_ID,
        editColumnsBtnId: RECYCLE_EDIT_COLUMNS_BTN_ID,
        printBtnId: RECYCLE_PRINT_LABELS_BTN_ID
      });
      const c = bindRecyclePrintBarcodeButton();
      return a && b && c;
    };

    if (tryInjectAll()) return;

    const obs = new MutationObserver(() => { tryInjectAll(); });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  // -----------------------------------------
  // Device functions dialog: checkbox 2-column
  // -----------------------------------------
  const DEVICE_FUNCTIONS_SELECT_ID = "_deviceFunctions_DeviceFunction";

  function guessDeviceFunctionGroup(value, text) {
    const v = String(value || "").toLowerCase();
    const t = String(text || "").toLowerCase();
    if (v.includes("adb") || t.includes("adb")) return "adb";
    if (v.includes("hybrid") || t.includes("hybrid")) return "hybrid";
    return "other";
  }

  function setChosenValue(selectEl, value) {
    if (!selectEl) return;
    selectEl.value = value || "";
    // Trigger any dependent logic on the page (chosen, ajax-updaters, etc.)
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    try { selectEl.dispatchEvent(new Event("chosen:updated", { bubbles: true })); } catch (e) {}
    updateChosenDisplay(selectEl);
  }

  function buildDeviceFunctionsCheckboxUi(selectEl) {
    if (!selectEl || selectEl.dataset.wifiOssAssistantEnhanced === "1") return false;

    const container = selectEl.closest(".half-row") || selectEl.parentElement;
    if (!container) return false;

    // Avoid double-inject if the dialog re-renders.
    if (container.querySelector(".wifi-oss-devicefn-ui")) {
      selectEl.dataset.wifiOssAssistantEnhanced = "1";
      return true;
    }

    const options = Array.from(selectEl.options || []);
    if (!options.length) return false;

    // Hide chosen UI if present; keep the real <select> for form submission / existing logic.
    const chosenId = selectEl.id ? `${selectEl.id}_chosen` : null;
    const chosen = chosenId ? document.getElementById(chosenId) : null;
    if (chosen) chosen.style.display = "none";
    selectEl.style.display = "none";

    const wrap = document.createElement("div");
    wrap.className = "wifi-oss-devicefn-ui";
    wrap.style.marginTop = "6px";

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "1fr 1fr";
    grid.style.gap = "12px";

    const colAdb = document.createElement("div");
    const colHybrid = document.createElement("div");

    const hAdb = document.createElement("div");
    hAdb.textContent = "ADB модели";
    hAdb.style.fontWeight = "600";
    hAdb.style.marginBottom = "6px";

    const hHybrid = document.createElement("div");
    hHybrid.textContent = "Hybrid модели";
    hHybrid.style.fontWeight = "600";
    hHybrid.style.marginBottom = "6px";

    colAdb.appendChild(hAdb);
    colHybrid.appendChild(hHybrid);

    const listAdb = document.createElement("div");
    const listHybrid = document.createElement("div");
    listAdb.style.display = "grid";
    listAdb.style.gap = "6px";
    listHybrid.style.display = "grid";
    listHybrid.style.gap = "6px";

    const name = `wifi-oss-devicefn-${Math.random().toString(16).slice(2)}`;

    const makeItem = (opt) => {
      const value = opt.value;
      const text = (opt.textContent || "").trim();
      if (!value) return null; // skip "Всички"/empty option; user can uncheck to clear

      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "8px";
      label.style.cursor = "pointer";
      label.style.userSelect = "none";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.name = name;
      cb.value = value;
      cb.checked = selectEl.value === value;

      cb.addEventListener("change", () => {
        const all = wrap.querySelectorAll(`input[type="checkbox"][name="${name}"]`);
        // Make it mutually exclusive: only one can stay checked.
        if (cb.checked) {
          all.forEach(x => { if (x !== cb) x.checked = false; });
          setChosenValue(selectEl, cb.value);
        } else {
          // If user unchecks the current selection -> clear select.
          setChosenValue(selectEl, "");
        }
      });

      const span = document.createElement("span");
      span.textContent = text;

      label.appendChild(cb);
      label.appendChild(span);
      return label;
    };

    for (const opt of options) {
      const item = makeItem(opt);
      if (!item) continue;
      const group = guessDeviceFunctionGroup(opt.value, opt.textContent);
      if (group === "adb") listAdb.appendChild(item);
      else if (group === "hybrid") listHybrid.appendChild(item);
      else listAdb.appendChild(item); // fallback
    }

    colAdb.appendChild(listAdb);
    colHybrid.appendChild(listHybrid);
    grid.appendChild(colAdb);
    grid.appendChild(colHybrid);
    wrap.appendChild(grid);

    // Keep checkboxes in sync if the page changes the select from elsewhere.
    selectEl.addEventListener("change", () => {
      const all = wrap.querySelectorAll(`input[type="checkbox"][name="${name}"]`);
      all.forEach(x => { x.checked = (x.value === selectEl.value); });
    });

    container.appendChild(wrap);
    selectEl.dataset.wifiOssAssistantEnhanced = "1";
    return true;
  }

  function startDeviceFunctionsObserver() {
    const tryInject = () => {
      const selectEl = document.getElementById(DEVICE_FUNCTIONS_SELECT_ID);
      if (!selectEl) return false;
      return buildDeviceFunctionsCheckboxUi(selectEl);
    };

    if (tryInject()) return;
    const obs = new MutationObserver(() => { tryInject(); });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  // -----------------------------------------
  // Swap Shop Material: quick-fill buttons
  // -----------------------------------------
  const SWAP_MATERIAL_ROOT_ID = "_wflowSwapShopMaterial";
  const SWAP_MATERIAL_INPUT_ID = "_wflowSwapShopMaterial_MaterialId";
  const CAM_MODULES_MISSING_MATERIAL_OPERATION_KEY = "wifi_oss_cam_modules_missing_material_operation_id";
  const CAM_MODULES_MISSING_MATERIAL_HINT_ID = "wifi-oss-cam-modules-missing-material-hint";
  const CAM_MODULES_MISSING_MATERIAL_HINT_TEXT = "Не е открита история за този сериен номер в SAP. Опитайте с другия номер на CAM модула. При повторен неуспех предайте устройството на супервайзър.";
  const SWAP_MATERIAL_SIMILAR_WARNING_ID = "wifi-oss-swap-material-similar-warning";
  const SWAP_MATERIAL_MISSING_AUTO_FILLED_WARNING = "Това устройство няма Material ID, стойността е попълнена автоматично.";
  const SWAP_MATERIAL_MISSING_AMBIGUOUS_WARNING = "Това устройство няма Material ID, моля изберете кое е устройството.";
  const SWAP_MATERIAL_SIMILAR_WARNINGS = {
    "1000059633": "Внимание: TP-Link NX520 и TP-Link NX220v са визуално сходни устройства, но са с различни SAP номера. Моля, уверете се, че сте избрали правилния модел, като проверите точния модел от етикета на устройството.",
    "1000055165": "Внимание: TP-Link NX520 и TP-Link NX220v са визуално сходни устройства, но са с различни SAP номера. Моля, уверете се, че сте избрали правилния модел, като проверите точния модел от етикета на устройството.",
    "124173": "Внимание: ZTE G5B и ZTE MC888A са визуално сходни устройства, но са с различни SAP номера. Моля, уверете се, че сте избрали правилния модел, като проверите точния модел от етикета на устройството.",
    "121561": "Внимание: ZTE G5B и ZTE MC888A са визуално сходни устройства, но са с различни SAP номера. Моля, уверете се, че сте избрали правилния модел, като проверите точния модел от етикета на устройството."
  };

  const SWAP_MATERIAL_MODELS_DEFAULT = [
    { id: "1-000-055-165", name: "TP Link NX220v" },
    { id: "1-000-057-334", name: "ZTE G5TS" },
    { id: "1-000-059-633", name: "TP-Link NX520" },
    { id: "1-200-014-914", name: "HX520 Home" },
    { id: "1-200-014-928", name: "K562E-10 Home" },
    { id: "1-200-017-460", name: "Modem ADB 2220" },
    { id: "1-200-017-462", name: "Huawei HA35-22 HYBRID" },
    { id: "BG108322", name: "DTH Conax Smart Card" },
    { id: "BG108445", name: "DTH CAM Neotion CI+ 1.3 CP" },
    { id: "BG110328", name: "DTH CAM Neotion DVB-CI Plus CSP" },
    { id: "BG111732", name: "Huawei B310s" },
    { id: "BG112070", name: "CAM Module for access Conax" },
    { id: "BG112071", name: "CAM module chipset pairing" },
    { id: "BG112072", name: "CAM module Neotion DVB-CI NP Conax NKE1" },
    { id: "BG112073", name: "CAM_sDTV CI+ CP OP (TAG)" },
    { id: "BG112076", name: "Conax Smart Card CH" },
    { id: "BG112079", name: "LED CAM CI+ V1.3 CSP Neotion modul" },
    { id: "BG112411", name: "DTH_SmarCAM-3.5 MTel Conax Full CI+ 1.3" },
    { id: "BG114215", name: "DTV Smart Card" },
    { id: "BG114225", name: "STB ZXV B700v5" },
    { id: "BG114228", name: "CAM_sDTV CI+ CP OP" },
    { id: "BG114581", name: "DTH Smart Card" },
    { id: "BG114915", name: "DTH STB KAON KSTB1001" },
    { id: "BG115763", name: "Huawei B311 White" },
    { id: "BG116081", name: "Huawei B311 Black" },
    { id: "BG118542", name: "KSTB5019 XploreTV" },
    { id: "BG118543", name: "KSTB6106 Zapper" },
    { id: "BG118544", name: "KSTB5020 XploreTV" },
    { id: "BG118551", name: "Deco M4 AC1200" },
    { id: "BG118552", name: "Archer A6/AC1200/DB LVA" },
    { id: "BG118560", name: "Huawei GPON HG8145V5" },
    { id: "BG118562", name: "CAM_sDTV CI+ CP OP (TAG) A1" },
    { id: "BG118563", name: "GPON CPE ZXHN F670V" },
    { id: "BG118564", name: "GPON CPE ZXHN F660" },
    { id: "BG118831", name: "ZTE MF283U" },
    { id: "BG118857", name: "Cube ZTE 801A" },
    { id: "BG119442", name: "ZTE MF293N" },
    { id: "BG119477", name: "Modem Technicolor7200" },
    { id: "BG121150", name: "TP-Link EX220" },
    { id: "BG121153", name: "TP-link TL-WR850N" },
    { id: "BG121376", name: "TP-Link EX220 Home" },
    { id: "BG121561", name: "ZTE MC888A" },
    { id: "BG121678", name: "B866V2F02 (AndroidTV)" },
    { id: "BG121679", name: "DV9161 (AndroidTV)" },
    { id: "BG121961", name: "DTH Nagra DTS3460" },
    { id: "BG122933", name: "GPON CPE ZXHN F660OP" },
    { id: "BG122944", name: "GPON ONT ZXHN F6600R" },
    { id: "BG123357", name: "ZTE ZXHN H3601P" },
    { id: "BG123451", name: "ZTE MF296R" },
    { id: "BG124173", name: "ZTE G5B" }
  ];

  // This list can be controlled dynamically from the dashboard when remote polling is enabled.
  let swapMaterialModels = SWAP_MATERIAL_MODELS_DEFAULT;
  let swapMaterialModelsSig = SWAP_MATERIAL_MODELS_DEFAULT.map(m => String(m.id || "")).join(",");

  function getSwapMaterialModelsWithRecycleFallback(models, recycleMaterialFilter) {
    const list = Array.isArray(models) ? models : [];
    if (!recycleMaterialFilter) return list;
    const seen = new Set(list.map(m => normalizeSwapMaterialId(m?.id)).filter(Boolean));
    const fallback = getRecycleEffectiveMaterialModels().filter(m => {
      const id = normalizeSwapMaterialId(m?.id);
      if (!id || seen.has(id)) return false;
      return recycleMaterialFilter.idSet.has(id);
    });
    return fallback.length ? list.concat(fallback) : list;
  }

  const SWAP_MATERIAL_REMOTE_DASHBOARD_ENABLED = false;
  const SWAP_MATERIAL_DASHBOARD_URLS = [
    "https://oss-assistant.onrender.com/api/models"
  ];
  let __swapDashboardInFlight = false;
  let __swapDashboardPollStarted = false;

  async function refreshSwapMaterialModelsFromDashboard() {
    if (!SWAP_MATERIAL_REMOTE_DASHBOARD_ENABLED) return false;
    if (__swapDashboardInFlight) return false;
    __swapDashboardInFlight = true;
    try {
      let rawModels = null;
      for (const url of SWAP_MATERIAL_DASHBOARD_URLS) {
        try {
          // IMPORTANT: do the fetch from the extension background to avoid HTTPS page -> HTTP mixed-content blocking.
          const resp = await new Promise((resolve) => {
            try {
              if (!chrome?.runtime?.sendMessage) return resolve({ ok: false, error: "chrome.runtime.sendMessage unavailable" });
              chrome.runtime.sendMessage({ type: "swapMaterial.fetchModels", url }, (r) => {
                // Capture runtime errors (service worker not running, permissions, etc.)
                const lastErr = chrome.runtime.lastError?.message;
                if (lastErr) return resolve({ ok: false, error: lastErr });
                resolve(r);
              });
            } catch (e) {
              resolve({ ok: false, error: String(e?.message || e) });
            }
          });
          if (!resp?.ok) {
            console.warn("[swapMaterial] dashboard fetch failed:", url, resp?.error);
            continue;
          }
          const data = resp.data;
          rawModels = data?.models;
          if (Array.isArray(rawModels)) break;
        } catch (e) {}
      }
      if (!Array.isArray(rawModels)) return false;

      const models = rawModels
        .map(m => ({
          id: String(m?.id ?? "").replace(/\D+/g, ""),
          name: String(m?.name ?? "").trim(),
          image: String(m?.image ?? "").trim(),
          category: String(m?.category ?? "").trim().toLowerCase()
        }))
        .filter(m => m.id)
        .map(m => ({
          id: m.id,
          name: m.name || m.id,
          image: m.image || "",
          category: (m.category === "internet" || m.category === "tv" || m.category === "other") ? m.category : ""
        }));

      // Include important fields so category/image/name updates are detected too.
      const sig = models.map(m => `${m.id}|${m.name}|${m.image}|${m.category || ""}`).join(",");
      if (!sig) return false;
      if (sig === swapMaterialModelsSig) return false;

      swapMaterialModels = models;
      swapMaterialModelsSig = sig;
      console.info("[swapMaterial] models updated:", models.length);
      return true;
    } catch (e) {
      return false;
    } finally {
      __swapDashboardInFlight = false;
    }
  }

  function startSwapMaterialDashboardPolling() {
    if (!SWAP_MATERIAL_REMOTE_DASHBOARD_ENABLED) return;
    if (__swapDashboardPollStarted) return;
    __swapDashboardPollStarted = true;

    const tick = async () => {
      const changed = await refreshSwapMaterialModelsFromDashboard();
      if (!changed) return;

      const root = document.getElementById("_wflowSwapShopMaterial");
      if (!root) return;

      const oldPanel = root.querySelector(".wifi-oss-swap-material-panel");
      if (oldPanel) oldPanel.remove();

      // Re-render with updated swapMaterialModels
      try { injectSwapMaterialButtons(); } catch (e) {}
    };

    // Initial load and then periodic updates.
    tick();
    setInterval(tick, 30000);
  }

  function setSwapMaterialInputValue(el, value) {
    if (!el) return;
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : null;
    const desc = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function normalizeSwapMaterialId(id) {
    const raw = String(id || "").trim();
    // Keep only digits in the Material ID.
    // Examples:
    // - "1-000-055-165" -> "1000055165"
    // - "BG108322" -> "108322"
    // - "118550_DISMANTLED" -> "118550"
    return raw.replace(/\D+/g, "");
  }

  function attachSwapMaterialRewriteRule(input) {
    if (!input) return;
    if (input.dataset.wifiOssSwapRewriteAttached === "1") return;
    input.dataset.wifiOssSwapRewriteAttached = "1";

    // Rewrite rules by normalized MaterialId (BG prefix removed, dashes removed).
    // If a value matches a key here, it gets rewritten to the mapped value.
    const rewriteMap = new Map([
      // Technicolor group -> 119477
      ["112102", "119477"],
      ["112486", "119477"],
      ["112487", "119477"],
      ["114877", "119477"],
      ["118550", "119477"],
      // Huawei B310 group -> 111732
      ["112880", "111732"],
      ["114230", "111732"],
      // Kaon KSTB5020 group -> 118544
      ["115630", "118544"],
      // Kaon KSTB5019 group -> 118542
      ["115631", "118542"],
      // Huawei GPON HG8145V5 group -> 118560
      ["117174", "118560"],
      // Kaon KSTB6106 DVB-C Zapper group -> 118543
      ["116102", "118543"],
      // STB ZXV B700v5 group -> 114225
      ["108892", "114225"],
      // TP-LINK Deco M4 group -> 118551
      ["117336", "118551"]
    ]);

    const maybeRewrite = () => {
      const curRaw = String(input.value || "").trim();
      if (!curRaw) return;
      const cur = normalizeSwapMaterialId(curRaw);
      // Always sanitize input so nothing except digits remains.
      if (cur && curRaw !== cur) {
        setSwapMaterialInputValue(input, cur);
        return;
      }
      const to = rewriteMap.get(cur);
      if (!to) return;
      if (cur === to) return;
      setSwapMaterialInputValue(input, to);
    };

    input.addEventListener("input", maybeRewrite, true);
    input.addEventListener("change", maybeRewrite, true);
    // Also sanitize/rewrite initial value on page load.
    maybeRewrite();
  }

  function autoContinueSwapMaterialIfReady(root, input) {
    if (!root || !input) return;
    if (root.dataset.wifiOssSwapAutoContinueDone === "1") return;
    if (!isMaterialAutoContinueEnabled()) return;
    const raw = String(input.value || "").trim();
    const normalized = normalizeSwapMaterialId(raw);
    if (!normalized) return;

    const continueBtn = document.getElementById("_wflowSwapShopMaterial_save")
      || root.querySelector("#_wflowSwapShopMaterial_save")
      || root.querySelector("button[name='save']");
    if (!continueBtn) return;

    // Ensure field value is normalized before submit.
    if (raw !== normalized) setSwapMaterialInputValue(input, normalized);
    root.dataset.wifiOssSwapAutoContinueDone = "1";
    try { continueBtn.click(); } catch (e) {}
  }

  const MATERIAL_AUTO_CONTINUE_DEBUG_KEY = "wifi_oss_debug_material_auto_continue_enabled";
  const MATERIAL_AUTO_CONTINUE_TOGGLE_CLASS = "wifi-oss-material-auto-debug-toggle";

  function isMaterialAutoContinueEnabled() {
    try { return sessionStorage.getItem(MATERIAL_AUTO_CONTINUE_DEBUG_KEY) !== "0"; } catch (e) {}
    return true;
  }

  function setMaterialAutoContinueEnabled(enabled) {
    try {
      if (enabled) sessionStorage.removeItem(MATERIAL_AUTO_CONTINUE_DEBUG_KEY);
      else sessionStorage.setItem(MATERIAL_AUTO_CONTINUE_DEBUG_KEY, "0");
    } catch (e) {}
    updateMaterialAutoContinueDebugToggles();
    try { updateRecycleDebugGuardsToggles(); } catch (e) {}
  }

  function updateMaterialAutoContinueDebugToggles() {
    const enabled = isMaterialAutoContinueEnabled();
    document.querySelectorAll(`.${MATERIAL_AUTO_CONTINUE_TOGGLE_CLASS} button[data-wifi-oss-material-auto-continue-toggle]`).forEach(btn => {
      btn.textContent = `Debug: Material auto-continue ${enabled ? "ON" : "OFF"}`;
      btn.style.background = enabled ? "#f3f3f3" : "#fff4e5";
      btn.style.borderColor = enabled ? "#c9c9c9" : "#d28a1d";
      btn.style.color = enabled ? "#333" : "#8a4b00";
    });
  }

  function ensureMaterialAutoContinueDebugToggle(container) {
    if (!container) return null;
    const existing = container.querySelector(`.${MATERIAL_AUTO_CONTINUE_TOGGLE_CLASS}`);
    if (existing) {
      updateMaterialAutoContinueDebugToggles();
      return existing;
    }

    const wrap = document.createElement("div");
    wrap.className = MATERIAL_AUTO_CONTINUE_TOGGLE_CLASS;
    wrap.style.margin = "4px 0 8px";
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.wifiOssMaterialAutoContinueToggle = "1";
    btn.style.padding = "3px 8px";
    btn.style.border = "1px solid #c9c9c9";
    btn.style.borderRadius = "999px";
    btn.style.fontSize = "11px";
    btn.style.lineHeight = "1.4";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "none";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMaterialAutoContinueEnabled(!isMaterialAutoContinueEnabled());
    });

    wrap.appendChild(btn);
    container.appendChild(wrap);
    updateMaterialAutoContinueDebugToggles();
    return wrap;
  }

  function getSelectedRecycleEntryCategory() {
    return readSelectedRecycleEntryCategory();
  }

  const RECYCLE_DEVICE_CATEGORY_VALIDATION_PROFILES = {
    android_iptv: "category_android_iptv_current",
    xplore_zapper: "category_xplore_zapper_mac12",
    dth_kaon_nagra: "category_dth_kaon_nagra_11_digits",
    austrian: "category_austrian_min16_alnum",
    netbox: "imei15_luhn",
    routers: "category_routers_current",
    gpon: "category_gpon_current",
    cam_modules: "category_cam_modules_non_empty",
    modems: "category_modems_current"
  };

  function getRecycleDeviceDefaultImagePath(device) {
    const legacyPath = deviceImageForModel(device?.displayName);
    const fileName = String(legacyPath || "").split("/").pop();
    return fileName ? `images/devices/16x9/${fileName}` : "";
  }

  function normalizeRecycleDeviceLegacyMaterialIds(ids) {
    const list = Array.isArray(ids) ? ids : [];
    const seen = new Set();
    return list
      .map(id => String(id || "").trim())
      .filter(id => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  }

  function normalizeRecycleDeviceCatalogEntry(device) {
    const categoryId = String(device?.categoryId || "").trim();
    const materialId = normalizeSwapMaterialId(device?.materialId);
    return {
      deviceId: String(device?.deviceId || "").trim(),
      categoryId,
      displayName: String(device?.displayName || "").trim(),
      materialId,
      legacyMaterialIds: normalizeRecycleDeviceLegacyMaterialIds(device?.legacyMaterialIds),
      imagePath: String(device?.imagePath || getRecycleDeviceDefaultImagePath(device)).trim(),
      helpImagePath: String(device?.helpImagePath || "").trim(),
      warningText: String(device?.warningText || "").trim(),
      validationProfileId: String(device?.validationProfileId || RECYCLE_DEVICE_CATEGORY_VALIDATION_PROFILES[categoryId] || "").trim(),
      enabled: device?.enabled !== false
    };
  }

  function isRecycleDeviceEnabled(device) {
    return device?.enabled !== false;
  }

  const RECYCLE_DEVICE_CATALOG_RAW = [
    { deviceId: "stb_zxv_b700v5", categoryId: "android_iptv", displayName: "STB ZXV B700v5", materialId: "114225", imagePath: "images/devices/16x9/STB_ZXV_B700v5-removebg-preview.webp", helpImagePath: "images/recycle-help/android_iptv-zte-zxv10-b700v5-iptv.webp", validationProfileId: "android_zxv_b700v5_12_digits" },
    { deviceId: "stb_sdmc_dv9161_androidtv", categoryId: "android_iptv", displayName: "DV9161 (AndroidTV)", materialId: "121679", imagePath: "images/devices/16x9/STB_SDMC_DV9161__AndroidTV_-removebg-preview.webp", helpImagePath: "images/recycle-help/android_iptv-a1-sdmc-dv9161.webp", validationProfileId: "android_dv9161_16_digits" },
    { deviceId: "stb_zte_b866v2f02_androidtv", categoryId: "android_iptv", displayName: "B866V2F02 (AndroidTV)", materialId: "121678", imagePath: "images/devices/16x9/STB_ZTE_B866V2F02__AndroidTV_-removebg-preview.webp", helpImagePath: "images/recycle-help/android_iptv-zte-zxv10-b866v2f02-richmedia-box.webp", validationProfileId: "android_b866v2f02_bg_plus_15_digits" },

    { deviceId: "kaon_kstb5019_xploretv", categoryId: "xplore_zapper", displayName: "KSTB5019 XploreTV", materialId: "118542", imagePath: "images/devices/16x9/Kaon_KSTB5019_XploreTV_IP_only__BCM7268_-removebg-preview.webp", validationProfileId: "xplore_zapper_mac12_hex_plain" },
    { deviceId: "kaon_kstb6106_zapper", categoryId: "xplore_zapper", displayName: "KSTB6106 Zapper", materialId: "118543", imagePath: "images/devices/16x9/Kaon_KSTB6106_DVB-C_Zapper-removebg-preview.webp", helpImagePath: "images/recycle-help/KSTB6106 Zapper.webp", validationProfileId: "xplore_zapper_mac12_hex_plain" },
    { deviceId: "kaon_kstb5020_xploretv", categoryId: "xplore_zapper", displayName: "KSTB5020 XploreTV", materialId: "118544", imagePath: "images/devices/16x9/Kaon_KSTB5020_XploreTV.webp", validationProfileId: "xplore_zapper_mac12_hex_plain" },

    { deviceId: "dth_kaon_kstb1001", categoryId: "dth_kaon_nagra", displayName: "DTH STB KAON KSTB1001", materialId: "114915", imagePath: "images/devices/16x9/DTH_STB_KAON_KSTB1001-BCM73625-1GB-removebg-preview.webp", validationProfileId: "dth_11_digits_prefix_00" },
    { deviceId: "dth_nagra_dts3460", categoryId: "dth_kaon_nagra", displayName: "DTH Nagra DTS3460", materialId: "121961", imagePath: "images/devices/16x9/DTH_Nagra_DTS3460.webp", helpImagePath: "images/recycle-help/DTH Nagra DTS3460.webp", validationProfileId: "dth_11_digits_prefix_00" },

    { deviceId: "adb_modem_2220", categoryId: "austrian", displayName: "ADB Modem 2220", materialId: "1200017460", imagePath: "images/devices/16x9/Modem_ADB_VoIP_VV_2220_AT-removebg-preview.webp", helpImagePath: "images/recycle-help/ADB modem vv2220.webp", validationProfileId: "austrian_adb_vv2220" },
    { deviceId: "huawei_ha35_22_hibrid", categoryId: "austrian", displayName: "Huawei HA35-22 HYBRID", materialId: "1200017462", imagePath: "images/devices/16x9/Huawei_HA35-22AM.webp", helpImagePath: "images/recycle-help/Huawei HA35-22 HIBRID.webp", validationProfileId: "austrian_huawei_ha35_22_hibrid" },

    { deviceId: "zte_g5b1", categoryId: "netbox", displayName: "ZTE G5B", materialId: "124173", imagePath: "images/devices/16x9/ZTE_G5B1_5G-removebg-preview.webp" },
    { deviceId: "zte_mf296r", categoryId: "netbox", displayName: "ZTE MF296R", materialId: "123451", imagePath: "images/devices/16x9/ZTE_MF296R-removebg-preview.webp" },
    { deviceId: "zte_mc888a", categoryId: "netbox", displayName: "ZTE MC888A", materialId: "121561", imagePath: "images/devices/16x9/ZTE_MC888A_5G-removebg-preview.webp" },
    { deviceId: "zte_mf293n", categoryId: "netbox", displayName: "ZTE MF293N", materialId: "119442", imagePath: "images/devices/16x9/ZTE_MF293N_+_ext._Antenna-removebg-preview.webp" },
    { deviceId: "cube_zte_801a", categoryId: "netbox", displayName: "Cube ZTE 801A", materialId: "118857", imagePath: "images/devices/16x9/Cube_ZTE_MC_801A_5G-removebg-preview.webp" },
    { deviceId: "zte_mf283u", categoryId: "netbox", displayName: "ZTE MF283U", materialId: "118831", imagePath: "images/devices/16x9/ZTE_MF283U+ext._Antenna-removebg-preview.webp" },
    { deviceId: "huawei_b311_black", categoryId: "netbox", displayName: "Huawei B311 Black", materialId: "116081", imagePath: "images/devices/16x9/Huawei_B311-221_black_+ext._Antenna-removebg-preview.webp" },
    { deviceId: "huawei_b311_white", categoryId: "netbox", displayName: "Huawei B311 White", materialId: "115763", imagePath: "images/devices/16x9/Huawei_B311-221_white+ext._Antenna-removebg-preview.webp" },
    { deviceId: "huawei_b310s", categoryId: "netbox", displayName: "Huawei B310s", materialId: "111732", imagePath: "images/devices/16x9/Huawei b310 black.webp" },
    { deviceId: "zte_g5ts", categoryId: "netbox", displayName: "ZTE G5TS", materialId: "1000057334", imagePath: "images/devices/16x9/ZTE_G5TS_5G-removebg-preview.webp" },
    { deviceId: "tp_link_nx520", categoryId: "netbox", displayName: "TP-Link NX520", materialId: "1000059633", imagePath: "images/devices/16x9/TP-Link_NX520_5G-removebg-preview.webp" },
    { deviceId: "tp_link_nx220v", categoryId: "netbox", displayName: "TP Link NX220v", materialId: "1000055165", imagePath: "images/devices/16x9/TP_Link_NX220v_5G-removebg-preview.webp" },

    { deviceId: "tp_link_hx520_home", categoryId: "routers", displayName: "HX520 Home", materialId: "1200014914", imagePath: "images/devices/16x9/Router_TP_Link_HX520_Home_WiFi-removebg-preview.webp", helpImagePath: "images/recycle-help/HX520 Home.webp", validationProfileId: "router_13_alnum" },
    { deviceId: "tp_link_deco_m4", categoryId: "routers", displayName: "Deco M4 AC1200", materialId: "118551", imagePath: "images/devices/16x9/TP-LINK_Deco_M4__AC1200__2xGbE__MU-MIMO-removebg-preview.webp", helpImagePath: "images/recycle-help/Deco M4, AC1200, 2xGbE, MU-MIMO.webp", validationProfileId: "router_13_alnum" },
    { deviceId: "tp_link_archer_a6", categoryId: "routers", displayName: "Archer A6/AC1200/DB LVA", materialId: "118552", imagePath: "images/devices/16x9/Router_TP-Link_Archer_A6AC1200DB_LVA-removebg-preview.webp" },
    { deviceId: "tp_link_ex220", categoryId: "routers", displayName: "TP-Link EX220", materialId: "121150", imagePath: "images/devices/16x9/Router_TP-Link_EX220-removebg-preview.webp", helpImagePath: "images/recycle-help/TP-Link EX220.webp", validationProfileId: "router_13_alnum" },
    { deviceId: "tp_link_ex220_home", categoryId: "routers", displayName: "TP-Link EX220 Home", materialId: "121376", imagePath: "images/devices/16x9/Router_TP-Link_EX220-removebg-preview.webp", helpImagePath: "images/recycle-help/TP-Link EX220 Home.webp", validationProfileId: "router_13_alnum" },
    { deviceId: "zte_zxhn_h3601p", categoryId: "routers", displayName: "ZTE ZXHN H3601P", materialId: "123357", imagePath: "images/devices/16x9/Router_ZTE_ZXHN_H3601P_RG_WiFi-removebg-preview.webp", helpImagePath: "images/recycle-help/ZTE ZXHN H3601P.webp", validationProfileId: "router_zte_h3601p_zte_prefix_15_alnum" },

    { deviceId: "huawei_k562e_10_home", categoryId: "gpon", displayName: "K562E-10 Home", materialId: "1200014928", imagePath: "images/devices/16x9/Router_Huawei_K562E-10_Home_WiFi-removebg-preview.webp" },
    { deviceId: "huawei_gpon_hg8145v5", categoryId: "gpon", displayName: "Huawei GPON HG8145V5", materialId: "118560", imagePath: "images/devices/16x9/Huawei_GPON_HG8145V5-removebg-preview.webp", helpImagePath: "images/recycle-help/Huawei GPON HG8145V5.webp", validationProfileId: "gpon_16_alnum" },
    { deviceId: "zte_gpon_zxhn_f670v", categoryId: "gpon", displayName: "GPON CPE ZXHN F670V", materialId: "118563", imagePath: "images/devices/16x9/GPON_CPE_ZXHN_F670L_V1.1-removebg-preview.webp", helpImagePath: "images/recycle-help/GPON CPE ZXHN F670V.webp", validationProfileId: "gpon_16_alnum" },
    { deviceId: "zte_zxhn_f600", categoryId: "gpon", displayName: "ZTE ZXHN F600", materialId: "118564", imagePath: "images/devices/16x9/ZTE_ZXHN_F600.webp", helpImagePath: "images/recycle-help/ZTE ZXHN F600.webp", validationProfileId: "gpon_16_alnum" },
    { deviceId: "zte_gpon_zxhn_f6600p", categoryId: "gpon", displayName: "GPON CPE ZXHN F6600P", materialId: "122933", imagePath: "images/devices/16x9/GPON_CPE_ZXHN_F6600P_V9.0-removebg-preview.webp", helpImagePath: "images/recycle-help/GPON CPE ZXHN F6600P.webp", validationProfileId: "gpon_16_alnum" },
    { deviceId: "zte_gpon_zxhn_f6600r", categoryId: "gpon", displayName: "GPON ONT ZXHN F6600R", materialId: "122944", imagePath: "images/devices/16x9/ZTE_ONT_ZXHN_F6600R-removebg-preview.webp" }
  ];

  const RECYCLE_DEVICE_CATALOG = RECYCLE_DEVICE_CATALOG_RAW.map(normalizeRecycleDeviceCatalogEntry);
  const RECYCLE_DEVICE_ID_SET = new Set(RECYCLE_DEVICE_CATALOG.map(device => String(device?.deviceId || "").trim()).filter(Boolean));

  function normalizeDailyworkDeviceName(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function createDailyworkDeviceSelection(action, categoryId, deviceIds, confidence, reason) {
    return {
      action,
      categoryId: String(categoryId || "").trim(),
      deviceIds: Array.isArray(deviceIds) ? deviceIds.map(id => String(id || "").trim()).filter(Boolean) : [],
      confidence,
      reason
    };
  }

  const DAILYWORK_DEVICE_NOOP_NAMES = [
    "Отпуск",
    "Болничен",
    "Обучение",
    "Друго",
    "Мобилни",
    "Ремонт на CPE",
    "Усилватели",
    "Home office",
    "ITS",
    "Склад",
    "А1 устройства"
  ];

  const DAILYWORK_DEVICE_CATEGORY_MAPPINGS = [
    { names: ["NETBOX 4G", "NETBOX 5G"], categoryId: "netbox", reason: "broad_netbox" },
    { names: ["Advanced ONT", "GPONs Basic", "GPON CPE ZXHN F670L V1.1"], categoryId: "gpon", reason: "broad_gpon" },
    { names: ["DTV CAM", "DTH CAM"], categoryId: "cam_modules", reason: "broad_cam_modules" },
    { names: ["D3 Wifi Modems", "D3 Modems"], categoryId: "modems", reason: "broad_modems" },
    { names: ["DTH STB"], categoryId: "dth_kaon_nagra", reason: "broad_dth" },
    { names: ["IPTV ZTE"], categoryId: "android_iptv", reason: "broad_iptv" },
    { names: ["ZTE MF296N+ Antenna"], categoryId: "netbox", reason: "device_not_exact_in_local_catalog" },
    { names: ["A1 Hybrid"], categoryId: "austrian", reason: "broad_austrian" }
  ];

  const DAILYWORK_DEVICE_CONCRETE_MAPPINGS = [
    { names: ["ZTE ZXHN H3601p"], categoryId: "routers", deviceId: "zte_zxhn_h3601p" },
    { names: ["HD Boxes - KSTB 6106"], categoryId: "xplore_zapper", deviceId: "kaon_kstb6106_zapper" },
    { names: ["A1 ADB 2220"], categoryId: "austrian", deviceId: "adb_modem_2220" },
    { names: ["Kaon Xplore 5020"], categoryId: "xplore_zapper", deviceId: "kaon_kstb5020_xploretv" },
    { names: ["DTH STB Nagra DTS3460"], categoryId: "dth_kaon_nagra", deviceId: "dth_nagra_dts3460" },
    { names: ["TP-LINK Deco M4, AC1200"], categoryId: "routers", deviceId: "tp_link_deco_m4" },
    { names: ["Cube ZTE MC 801A 5G"], categoryId: "netbox", deviceId: "cube_zte_801a" },
    { names: ["GPON CPE ZXHN F6600P V9.0"], categoryId: "gpon", deviceId: "zte_gpon_zxhn_f6600p" },
    { names: ["Kaon Xplore 5019 - ОТТ"], categoryId: "xplore_zapper", deviceId: "kaon_kstb5019_xploretv" },
    { names: ["ZTE MF293N+ Antenna"], categoryId: "netbox", deviceId: "zte_mf293n" },
    { names: ["ZTE MF283U+ext. Antenna"], categoryId: "netbox", deviceId: "zte_mf283u" },
    { names: ["ZTE MC888A 5G"], categoryId: "netbox", deviceId: "zte_mc888a" },
    { names: ["TP-Link EX220"], categoryId: "routers", deviceId: "tp_link_ex220" },
    { names: ["STB SDMC DV9161 (AndroidTV)"], categoryId: "android_iptv", deviceId: "stb_sdmc_dv9161_androidtv" }
  ];

  function addDailyworkDeviceMappingIndexEntry(index, rawName, entry) {
    const key = normalizeDailyworkDeviceName(rawName);
    if (!key || index.has(key)) return;
    index.set(key, entry);
  }

  function buildDailyworkDeviceMappingIndex() {
    const index = new Map();
    DAILYWORK_DEVICE_NOOP_NAMES.forEach(name => {
      addDailyworkDeviceMappingIndexEntry(index, name, createDailyworkDeviceSelection("noop", "", [], "unsafe", "safe_noop_device"));
    });
    DAILYWORK_DEVICE_CATEGORY_MAPPINGS.forEach(mapping => {
      const entry = createDailyworkDeviceSelection("category", mapping.categoryId, [], "broad", mapping.reason);
      mapping.names.forEach(name => addDailyworkDeviceMappingIndexEntry(index, name, entry));
    });
    DAILYWORK_DEVICE_CONCRETE_MAPPINGS.forEach(mapping => {
      const entry = {
        action: "category_device",
        categoryId: mapping.categoryId,
        deviceIds: [mapping.deviceId],
        confidence: "exact",
        reason: "exact_device_alias"
      };
      mapping.names.forEach(name => addDailyworkDeviceMappingIndexEntry(index, name, entry));
    });
    return index;
  }

  const DAILYWORK_DEVICE_SELECTION_INDEX = buildDailyworkDeviceMappingIndex();

  function isDailyworkConcreteRecycleDeviceMappingSafe(selection) {
    const categoryId = String(selection?.categoryId || "").trim();
    const deviceIds = Array.isArray(selection?.deviceIds) ? selection.deviceIds : [];
    if (selection?.action !== "category_device" || !categoryId || deviceIds.length !== 1) return false;
    const deviceId = String(deviceIds[0] || "").trim();
    if (!deviceId || !RECYCLE_DEVICE_ID_SET.has(deviceId)) return false;
    const matches = RECYCLE_DEVICE_CATALOG.filter(device => (
      isRecycleDeviceEnabled(device)
      && device.deviceId === deviceId
      && device.categoryId === categoryId
    ));
    return matches.length === 1;
  }

  function cloneDailyworkDeviceSelection(selection) {
    return createDailyworkDeviceSelection(
      selection?.action,
      selection?.categoryId,
      selection?.deviceIds,
      selection?.confidence,
      selection?.reason
    );
  }

  function resolveDailyworkDeviceSelection(deviceName) {
    const normalized = normalizeDailyworkDeviceName(deviceName);
    if (!normalized) return createDailyworkDeviceSelection("noop", "", [], "unsafe", "missing_device_name");

    const mapped = DAILYWORK_DEVICE_SELECTION_INDEX.get(normalized);
    if (!mapped) return createDailyworkDeviceSelection("noop", "", [], "unsafe", "unmapped_device_name");

    if (mapped.action !== "category_device") return cloneDailyworkDeviceSelection(mapped);
    if (isDailyworkConcreteRecycleDeviceMappingSafe(mapped)) return cloneDailyworkDeviceSelection(mapped);

    return createDailyworkDeviceSelection(
      "category",
      mapped.categoryId,
      [],
      "broad",
      `candidate_device_unavailable:${mapped.deviceIds[0] || ""}`
    );
  }

  const RECYCLE_REMOTE_VISUAL_OVERLAY_FIELDS = ["displayName", "imagePath", "helpImagePath", "warningText"];
  const RECYCLE_REMOTE_UNKNOWN_DEVICE_BLOCKED_CATEGORY_IDS = ["cam_modules", "modems"];
  const RECYCLE_REMOTE_AUTO_ADDITIONS_CAPABILITY = "remoteAdditionsAuto";
  const RECYCLE_REMOTE_AUTO_MATERIAL_CAPABILITY = "remoteMaterialAuto";
  const RECYCLE_REMOTE_AUTO_MATERIAL_MODELS_CAPABILITY = "remoteMaterialModelsAuto";
  const RECYCLE_REMOTE_APPROVED_HTTPS_IMAGE_HOSTS = [
    "thfvnext.bing.com",
    "tse2.mm.bing.net"
  ];
  const RECYCLE_REMOTE_AUTO_SESSION_STATE_KEY = "wifi_oss_recycle_remote_auto_session_state_v1";
  const RECYCLE_REMOTE_DEBUG_SESSION_STATE_KEY = "wifi_oss_recycle_remote_debug_session_state_v1";
  let recycleRemoteVisualOverlayByDeviceId = new Map();
  let recycleRemoteAutoDevicesByDeviceId = new Map();
  let recycleRemoteAutoMaterialEnabledByDeviceId = new Map();
  let recycleRemoteAutoMaterialModelsByMaterialId = new Map();
  let recycleRemoteAddedDevicesByDeviceId = new Map();
  let recycleRemoteMaterialEnabledByDeviceId = new Map();
  let recycleRemoteAutoApplyState = {
    result: "not_checked",
    autoAddedCount: 0,
    autoBlockedCount: 0,
    blockReason: ""
  };
  let recycleRemoteAutoMaterialApplyState = {
    result: "not_checked",
    autoMaterialEnabledCount: 0,
    autoMaterialBlockedCount: 0,
    blockReason: ""
  };
  let recycleRemoteAutoApplyInFlight = null;

  function getRecycleDeviceVisualView(device) {
    const id = String(device?.deviceId || "").trim();
    if (!id || !recycleRemoteVisualOverlayByDeviceId.has(id)) return device;
    return { ...device, ...recycleRemoteVisualOverlayByDeviceId.get(id) };
  }

  function getRecycleLocalCatalogDiffPreviewDevices() {
    return RECYCLE_DEVICE_CATALOG.map(device => ({
      deviceId: String(device?.deviceId || "").trim(),
      categoryId: String(device?.categoryId || "").trim(),
      displayName: String(device?.displayName || "").trim(),
      materialId: normalizeSwapMaterialId(device?.materialId),
      legacyMaterialIds: normalizeRecycleDeviceLegacyMaterialIds(device?.legacyMaterialIds),
      imagePath: String(device?.imagePath || "").trim(),
      helpImagePath: String(device?.helpImagePath || "").trim(),
      warningText: String(device?.warningText || "").trim(),
      validationProfileId: String(device?.validationProfileId || "").trim(),
      enabled: device?.enabled !== false
    }));
  }

  function getRecycleRemoteDiffEligibilityContext() {
    const normalCategoryIds = Array.from(new Set(
      RECYCLE_DEVICE_CATALOG
        .map(device => String(device?.categoryId || "").trim())
        .filter(categoryId => categoryId && !RECYCLE_REMOTE_UNKNOWN_DEVICE_BLOCKED_CATEGORY_IDS.includes(categoryId))
    ));
    const implementedValidationProfileIds = Object.keys(RECYCLE_SERIAL_VALIDATION_PROFILES || {})
      .map(profileId => String(profileId || "").trim())
      .filter(Boolean);
    const materialModelIds = Array.from(new Set(
      []
        .concat(Array.isArray(swapMaterialModels) ? swapMaterialModels : [])
        .concat(Array.isArray(SWAP_MATERIAL_MODELS_DEFAULT) ? SWAP_MATERIAL_MODELS_DEFAULT : [])
        .map(model => normalizeSwapMaterialId(model?.id))
        .filter(Boolean)
    ));

    return {
      normalCategoryIds,
      specialCategoryIds: RECYCLE_REMOTE_UNKNOWN_DEVICE_BLOCKED_CATEGORY_IDS.slice(),
      implementedValidationProfileIds,
      materialModelIds
    };
  }

  function previewRecycleRemoteCatalogDiff() {
    return sendRecycleRemoteConfigDebugMessage(
      RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.previewDiff,
      {
        localDevices: getRecycleLocalCatalogDiffPreviewDevices(),
        eligibilityContext: getRecycleRemoteDiffEligibilityContext()
      }
    );
  }

  function previewRecycleRemoteResolvedCatalogPlan() {
    return sendRecycleRemoteConfigDebugMessage(
      RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.resolvedPlan,
      {
        localDevices: getRecycleLocalCatalogDiffPreviewDevices(),
        eligibilityContext: getRecycleRemoteDiffEligibilityContext()
      }
    );
  }

  function getRecycleRemoteResolvedCatalogApplyPlan() {
    return sendRecycleRemoteConfigDebugMessage(
      RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.resolvedApplyPlan,
      {
        localDevices: getRecycleLocalCatalogDiffPreviewDevices(),
        eligibilityContext: getRecycleRemoteDiffEligibilityContext()
      }
    );
  }

  function isRecycleRemoteSafeId(value) {
    return /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(String(value || ""));
  }

  function isRecycleApprovedHttpsImageUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return false;
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (e) {
      return false;
    }
    return parsed.protocol === "https:"
      && !parsed.username
      && !parsed.password
      && RECYCLE_REMOTE_APPROVED_HTTPS_IMAGE_HOSTS.includes(parsed.hostname);
  }

  function isRecycleRemoteAddedAssetPathSafe(value) {
    const pathValue = String(value || "").trim();
    if (!pathValue) return true;
    if (isRecycleApprovedHttpsImageUrl(pathValue)) return true;
    if (!pathValue.startsWith("images/")) return false;
    if (/^(?:[A-Za-z]:|[\\/])/i.test(pathValue) || /(?:file:\/\/|https?:\/\/)/i.test(pathValue)) return false;
    if (pathValue.includes("\\") || pathValue.includes("..")) return false;
    return /\.(?:webp|png|jpe?g)$/i.test(pathValue);
  }

  function resolveRecycleImageUrl(imagePath) {
    const path = String(imagePath || "").trim();
    if (!path) return "";
    if (isRecycleApprovedHttpsImageUrl(path)) return path;
    return (typeof chrome !== "undefined" && chrome.runtime?.getURL)
      ? chrome.runtime.getURL(path)
      : path;
  }

  function isRecycleRemoteAddedDevice(device) {
    return Boolean(device && device.remoteAdded === true);
  }

  function getRecycleRemoteMaterialEnablementForDevice(device) {
    if (!isRecycleRemoteAddedDevice(device)) return "";
    const deviceId = String(device?.deviceId || "").trim();
    if (!deviceId) return "";
    return normalizeSwapMaterialId(recycleRemoteAutoMaterialEnabledByDeviceId.get(deviceId))
      || normalizeSwapMaterialId(recycleRemoteMaterialEnabledByDeviceId.get(deviceId));
  }

  function isRecycleRemoteMaterialEnabledDevice(device) {
    return Boolean(getRecycleRemoteMaterialEnablementForDevice(device));
  }

  function getRecycleEffectiveMaterialId(device, mode) {
    const materialMode = String(mode || "sap").trim();
    if (isRecycleRemoteAddedDevice(device)) {
      if (materialMode === "diagnostic") return normalizeSwapMaterialId(device?.remoteIgnoredMaterialId);
      if (materialMode === "sap") return getRecycleRemoteMaterialEnablementForDevice(device);
      return "";
    }
    return normalizeSwapMaterialId(device?.materialId);
  }

  function getRecycleRemoteNormalCategoryIdSet() {
    return new Set(
      RECYCLE_DEVICE_CATALOG
        .map(device => String(device?.categoryId || "").trim())
        .filter(categoryId => categoryId && !RECYCLE_REMOTE_UNKNOWN_DEVICE_BLOCKED_CATEGORY_IDS.includes(categoryId))
    );
  }

  function getRecycleLocalMaterialModels() {
    return []
      .concat(Array.isArray(swapMaterialModels) ? swapMaterialModels : [])
      .concat(Array.isArray(SWAP_MATERIAL_MODELS_DEFAULT) ? SWAP_MATERIAL_MODELS_DEFAULT : []);
  }

  function getRecycleLocalKnownMaterialIdSet() {
    return new Set(
      getRecycleLocalMaterialModels()
        .map(model => normalizeSwapMaterialId(model?.id))
        .filter(Boolean)
    );
  }

  function getRecycleEffectiveMaterialModels() {
    const seen = new Set();
    return getRecycleLocalMaterialModels()
      .concat(Array.from(recycleRemoteAutoMaterialModelsByMaterialId.values()))
      .filter(model => {
        const id = normalizeSwapMaterialId(model?.id);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  }

  function getRecycleRemoteKnownMaterialIdSet() {
    return new Set(
      getRecycleEffectiveMaterialModels()
        .map(model => normalizeSwapMaterialId(model?.id))
        .filter(Boolean)
    );
  }

  function classifyRecycleRemoteAddedMaterialEligibility(device, options) {
    const reasons = [];
    const warnings = [];
    const deviceId = String(device?.deviceId || "").trim();
    const categoryId = String(device?.categoryId || "").trim();
    const validationProfileId = String(device?.validationProfileId || "").trim();
    const rawMaterialId = String(device?.remoteIgnoredMaterialId || "").trim();
    const materialId = normalizeSwapMaterialId(rawMaterialId);
    const normalCategoryIds = getRecycleRemoteNormalCategoryIdSet();
    const materialModelIds = getRecycleRemoteKnownMaterialIdSet();
    const appliedMap = options?.appliedMap || recycleRemoteAddedDevicesByDeviceId;

    if (!isRecycleRemoteAddedDevice(device)) reasons.push("not remote-added");
    if (!deviceId || !isRecycleRemoteSafeId(deviceId)) reasons.push("unsafe deviceId");
    else if (!appliedMap?.has?.(deviceId)) reasons.push("not applied");

    if (!categoryId || !isRecycleRemoteSafeId(categoryId)) reasons.push("invalid category");
    else if (RECYCLE_REMOTE_UNKNOWN_DEVICE_BLOCKED_CATEGORY_IDS.includes(categoryId)) reasons.push(`special category ${categoryId}`);
    else if (!normalCategoryIds.has(categoryId)) reasons.push(`unknown category ${categoryId}`);

    if (!validationProfileId || !isRecycleValidationProfileImplemented(validationProfileId)) reasons.push("profile not local");
    if (device?.enabled === false) reasons.push("disabled");
    if (!rawMaterialId) reasons.push("missing material");
    else if (!/^\d+$/.test(rawMaterialId) || !materialId) reasons.push("invalid material");
    else if (!materialModelIds.has(materialId)) reasons.push(`material not known ${materialId}`);
    if (Array.isArray(device?.legacyMaterialIds) && device.legacyMaterialIds.length) warnings.push("legacy ignored");

    return {
      eligible: reasons.length === 0,
      materialId,
      reasons,
      warnings
    };
  }

  function normalizeRecycleRemoteAddedDeviceEntry(entry, pendingMap) {
    const errors = [];
    const deviceId = String(entry?.deviceId || "").trim();
    const categoryId = String(entry?.categoryId || "").trim();
    const displayName = String(entry?.displayName || "").trim();
    const validationProfileId = String(entry?.validationProfileId || "").trim();
    const materialIdRaw = String(entry?.materialId || "").trim();
    const materialId = normalizeSwapMaterialId(materialIdRaw);
    const imagePath = String(entry?.imagePath || "").trim();
    const helpImagePath = String(entry?.helpImagePath || "").trim();
    const warningText = String(entry?.warningText || "").trim();
    const normalCategoryIds = getRecycleRemoteNormalCategoryIdSet();
    const materialModelIds = getRecycleRemoteKnownMaterialIdSet();

    if (!deviceId || !isRecycleRemoteSafeId(deviceId)) errors.push("unsafe deviceId");
    else if (RECYCLE_DEVICE_ID_SET.has(deviceId)) errors.push("deviceId already local");
    else if (pendingMap?.has?.(deviceId)) errors.push("duplicate remote deviceId");

    if (!categoryId || !isRecycleRemoteSafeId(categoryId)) errors.push("invalid categoryId");
    else if (RECYCLE_REMOTE_UNKNOWN_DEVICE_BLOCKED_CATEGORY_IDS.includes(categoryId)) errors.push(`special category ${categoryId}`);
    else if (!normalCategoryIds.has(categoryId)) errors.push(`unknown category ${categoryId}`);

    if (!displayName) errors.push("missing displayName");
    else if (displayName.length > 120) errors.push("displayName too long");

    if (!validationProfileId || !isRecycleValidationProfileImplemented(validationProfileId)) {
      errors.push(`profile not local ${validationProfileId || "(empty)"}`);
    }

    if (!materialIdRaw) errors.push("missing materialId");
    else if (!/^\d+$/.test(materialIdRaw) || !materialId) errors.push("invalid materialId");
    else if (!materialModelIds.has(materialId)) errors.push(`material not known ${materialId}`);

    if (entry?.enabled === false) errors.push("disabled");
    if (!isRecycleRemoteAddedAssetPathSafe(imagePath)) errors.push("imagePath unsafe");
    if (!isRecycleRemoteAddedAssetPathSafe(helpImagePath)) errors.push("helpImagePath unsafe");

    if (errors.length) {
      return {
        ok: false,
        deviceId,
        displayName,
        reasons: errors.slice(0, 5)
      };
    }

    return {
      ok: true,
      device: {
        deviceId,
        categoryId,
        displayName,
        materialId: "",
        legacyMaterialIds: [],
        imagePath,
        helpImagePath,
        warningText,
        validationProfileId,
        enabled: true,
        remoteAdded: true,
        remoteIgnoredMaterialId: materialId
      }
    };
  }

  function getRecycleLocalDeviceById(deviceId) {
    const id = String(deviceId || "").trim();
    if (!id) return null;
    return RECYCLE_DEVICE_CATALOG.find(d => d.deviceId === id && isRecycleDeviceEnabled(d)) || null;
  }

  function getRecycleEffectiveDeviceById(deviceId) {
    const id = String(deviceId || "").trim();
    if (!id) return null;
    return getRecycleLocalDeviceById(id) || recycleRemoteAutoDevicesByDeviceId.get(id) || recycleRemoteAddedDevicesByDeviceId.get(id) || null;
  }

  function getRecycleLocalDevicesByCategory(categoryId) {
    const id = String(categoryId || "").trim();
    if (!id) return [];
    return RECYCLE_DEVICE_CATALOG.filter(d => d.categoryId === id && isRecycleDeviceEnabled(d));
  }

  function getRecycleEffectiveDevicesByCategory(categoryId) {
    const id = String(categoryId || "").trim();
    if (!id) return [];
    const localDevices = getRecycleLocalDevicesByCategory(id);
    const seenDeviceIds = new Set(localDevices.map(device => String(device?.deviceId || "").trim()).filter(Boolean));
    const remoteDevices = [];
    const addRemoteDevices = (devices) => {
      Array.from(devices || []).forEach(device => {
        const deviceId = String(device?.deviceId || "").trim();
        if (!deviceId || seenDeviceIds.has(deviceId)) return;
        if (device.categoryId !== id || !isRecycleDeviceEnabled(device)) return;
        seenDeviceIds.add(deviceId);
        remoteDevices.push(device);
      });
    };
    addRemoteDevices(recycleRemoteAutoDevicesByDeviceId.values());
    addRemoteDevices(recycleRemoteAddedDevicesByDeviceId.values());
    return localDevices.concat(remoteDevices);
  }

  function getRecycleDeviceById(deviceId) {
    return getRecycleEffectiveDeviceById(deviceId);
  }

  function getRecycleDevicesByCategory(categoryId) {
    return getRecycleEffectiveDevicesByCategory(categoryId);
  }

  function getRecycleDeviceMaterialIdsByCategory(categoryId) {
    return getRecycleLocalDevicesByCategory(categoryId)
      .map(d => getRecycleEffectiveMaterialId(d, "sap"))
      .filter(Boolean);
  }

  function getRecycleRemoteEnabledMaterialIdsByCategory(categoryId) {
    const id = String(categoryId || "").trim();
    if (!id) return [];
    const seenDeviceIds = new Set();
    const materialIds = [];
    const addMaterialIds = (devices) => {
      Array.from(devices || []).forEach(device => {
        const deviceId = String(device?.deviceId || "").trim();
        if (!deviceId || seenDeviceIds.has(deviceId)) return;
        if (device.categoryId !== id || !isRecycleDeviceEnabled(device) || !isRecycleRemoteMaterialEnabledDevice(device)) return;
        seenDeviceIds.add(deviceId);
        const materialId = getRecycleEffectiveMaterialId(device, "sap");
        if (materialId) materialIds.push(materialId);
      });
    };
    addMaterialIds(recycleRemoteAutoDevicesByDeviceId.values());
    addMaterialIds(recycleRemoteAddedDevicesByDeviceId.values());
    return materialIds;
  }

  function getRecycleEffectiveMaterialIdsByCategory(categoryId) {
    const id = String(categoryId || "").trim();
    if (!id) return [];
    const materialIds = []
      .concat(Array.isArray(SWAP_MATERIAL_RECYCLE_FILTERS[id]) ? SWAP_MATERIAL_RECYCLE_FILTERS[id] : [])
      .concat(getRecycleRemoteEnabledMaterialIdsByCategory(id));
    const seen = new Set();
    return materialIds
      .map(normalizeSwapMaterialId)
      .filter(materialId => {
        if (!materialId || seen.has(materialId)) return false;
        seen.add(materialId);
        return true;
      });
  }

  function serializeRecycleRemoteAddedDeviceForSession(device) {
    if (!isRecycleRemoteAddedDevice(device)) return null;
    const deviceId = String(device?.deviceId || "").trim();
    const categoryId = String(device?.categoryId || "").trim();
    const displayName = String(device?.displayName || "").trim();
    const validationProfileId = String(device?.validationProfileId || "").trim();
    const materialId = normalizeSwapMaterialId(device?.remoteIgnoredMaterialId);
    if (!deviceId || !categoryId || !displayName || !validationProfileId || !materialId) return null;
    return {
      deviceId,
      categoryId,
      displayName,
      materialId,
      legacyMaterialIds: [],
      imagePath: String(device?.imagePath || "").trim(),
      helpImagePath: String(device?.helpImagePath || "").trim(),
      warningText: String(device?.warningText || "").trim(),
      validationProfileId,
      enabled: device?.enabled !== false
    };
  }

  function serializeRecycleRemoteAutoMaterialModelForSession(model) {
    const materialId = normalizeSwapMaterialId(model?.id);
    const deviceId = String(model?.remoteDeviceId || "").trim();
    const categoryId = String(model?.remoteCategoryId || "").trim();
    const name = String(model?.name || "").trim();
    if (!materialId || !deviceId || !categoryId || !name) return null;
    return {
      materialId,
      deviceId,
      categoryId,
      name
    };
  }

  function getRecycleRemoteMaterialEnabledSessionEntries() {
    return Array.from(recycleRemoteMaterialEnabledByDeviceId.entries())
      .map(([deviceId, materialId]) => ({
        deviceId: String(deviceId || "").trim(),
        materialId: normalizeSwapMaterialId(materialId)
      }))
      .filter(entry => entry.deviceId && entry.materialId);
  }

  function getRecycleRemoteAutoMaterialEnabledSessionEntries() {
    return Array.from(recycleRemoteAutoMaterialEnabledByDeviceId.entries())
      .map(([deviceId, materialId]) => ({
        deviceId: String(deviceId || "").trim(),
        materialId: normalizeSwapMaterialId(materialId)
      }))
      .filter(entry => entry.deviceId && entry.materialId);
  }

  function getRecycleRemoteAutoMaterialModelSessionEntries() {
    return Array.from(recycleRemoteAutoMaterialModelsByMaterialId.values())
      .map(serializeRecycleRemoteAutoMaterialModelForSession)
      .filter(Boolean);
  }

  function saveRecycleRemoteAutoSessionState() {
    const materialEnabled = getRecycleRemoteAutoMaterialEnabledSessionEntries();
    const enabledDeviceIds = new Set(materialEnabled.map(entry => entry.deviceId));
    const devices = Array.from(recycleRemoteAutoDevicesByDeviceId.values())
      .filter(device => enabledDeviceIds.has(String(device?.deviceId || "").trim()))
      .map(serializeRecycleRemoteAddedDeviceForSession)
      .filter(Boolean);
    const materialModels = getRecycleRemoteAutoMaterialModelSessionEntries()
      .filter(model => enabledDeviceIds.has(model.deviceId));
    try {
      if (!devices.length || !materialEnabled.length) {
        sessionStorage.removeItem(RECYCLE_REMOTE_AUTO_SESSION_STATE_KEY);
        return;
      }
      sessionStorage.setItem(RECYCLE_REMOTE_AUTO_SESSION_STATE_KEY, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        devices,
        materialEnabled,
        materialModels
      }));
    } catch (e) {}
  }

  function clearRecycleRemoteAutoSessionState() {
    try { sessionStorage.removeItem(RECYCLE_REMOTE_AUTO_SESSION_STATE_KEY); } catch (e) {}
  }

  function normalizeRecycleRemoteMaterialModelEntry(entry, candidateDeviceMap, pendingMap) {
    const errors = [];
    const materialIdRaw = String(entry?.materialId || "").trim();
    const materialId = normalizeSwapMaterialId(materialIdRaw);
    const deviceId = String(entry?.deviceId || "").trim();
    const categoryId = String(entry?.categoryId || "").trim();
    const name = String(entry?.name || "").trim();
    const localMaterialIds = getRecycleLocalKnownMaterialIdSet();
    const normalCategoryIds = getRecycleRemoteNormalCategoryIdSet();

    if (!materialIdRaw || !/^\d+$/.test(materialIdRaw) || !materialId) errors.push("invalid materialId");
    else if (localMaterialIds.has(materialId)) errors.push(`material already local ${materialId}`);
    else if (pendingMap?.has?.(materialId)) errors.push(`duplicate remote material ${materialId}`);

    if (!deviceId || !isRecycleRemoteSafeId(deviceId)) errors.push("invalid deviceId");
    if (!categoryId || !isRecycleRemoteSafeId(categoryId)) errors.push("invalid categoryId");
    else if (RECYCLE_REMOTE_UNKNOWN_DEVICE_BLOCKED_CATEGORY_IDS.includes(categoryId)) errors.push(`special category ${categoryId}`);
    else if (!normalCategoryIds.has(categoryId)) errors.push(`unknown category ${categoryId}`);
    if (!name) errors.push("missing name");
    else if (name.length > 120) errors.push("name too long");

    const boundDevice = candidateDeviceMap?.get?.(deviceId);
    if (!boundDevice) {
      errors.push(`unknown bound device ${deviceId || "(empty)"}`);
    } else {
      const boundCategoryId = String(boundDevice?.categoryId || "").trim();
      const boundMaterialId = normalizeSwapMaterialId(boundDevice?.materialId);
      const validationProfileId = String(boundDevice?.validationProfileId || "").trim();
      if (boundCategoryId !== categoryId) errors.push("category mismatch");
      if (boundMaterialId !== materialId) errors.push("material mismatch");
      if (boundDevice?.enabled === false) errors.push("disabled");
      if (Array.isArray(boundDevice?.legacyMaterialIds) && boundDevice.legacyMaterialIds.length) errors.push("legacyMaterialIds unsupported");
      if (!validationProfileId || !isRecycleValidationProfileImplemented(validationProfileId)) errors.push("profile not local");
    }

    if (errors.length) {
      return {
        ok: false,
        materialId,
        deviceId,
        name,
        reasons: errors.slice(0, 5)
      };
    }

    return {
      ok: true,
      model: {
        id: materialId,
        name,
        remoteAdded: true,
        remoteDeviceId: deviceId,
        remoteCategoryId: categoryId
      }
    };
  }

  function buildRecycleRemoteAutoMaterialModelOverlay(modelEntries, candidateDeviceEntries) {
    const candidateDeviceMap = new Map();
    (Array.isArray(candidateDeviceEntries) ? candidateDeviceEntries : []).forEach(entry => {
      const deviceId = String(entry?.deviceId || "").trim();
      if (deviceId && !candidateDeviceMap.has(deviceId)) candidateDeviceMap.set(deviceId, entry);
    });

    const overlayMap = new Map();
    const blocked = [];
    (Array.isArray(modelEntries) ? modelEntries : []).forEach(entry => {
      const normalized = normalizeRecycleRemoteMaterialModelEntry(entry, candidateDeviceMap, overlayMap);
      if (normalized.ok) {
        overlayMap.set(normalized.model.id, normalized.model);
      } else {
        blocked.push({
          materialId: normalized.materialId,
          deviceId: normalized.deviceId,
          displayName: normalized.name,
          reasons: normalized.reasons
        });
      }
    });
    return { overlayMap, blocked };
  }

  function restoreRecycleRemoteAutoSessionState() {
    let parsed = null;
    try {
      const raw = String(sessionStorage.getItem(RECYCLE_REMOTE_AUTO_SESSION_STATE_KEY) || "");
      if (!raw) return false;
      parsed = JSON.parse(raw);
    } catch (e) {
      clearRecycleRemoteAutoSessionState();
      return false;
    }

    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.devices)) {
      clearRecycleRemoteAutoSessionState();
      return false;
    }

    const materialModelResult = buildRecycleRemoteAutoMaterialModelOverlay(parsed.materialModels, parsed.devices);
    recycleRemoteAutoMaterialModelsByMaterialId = materialModelResult.overlayMap;

    const overlayMap = new Map();
    parsed.devices.forEach(entry => {
      const normalized = normalizeRecycleRemoteAddedDeviceEntry(entry, overlayMap);
      if (normalized.ok) overlayMap.set(normalized.device.deviceId, normalized.device);
    });

    const materialMap = new Map();
    (Array.isArray(parsed.materialEnabled) ? parsed.materialEnabled : []).forEach(entry => {
      const deviceId = String(entry?.deviceId || "").trim();
      const materialId = normalizeSwapMaterialId(entry?.materialId);
      const device = overlayMap.get(deviceId);
      if (!device || !materialId) return;
      materialMap.set(deviceId, materialId);
    });

    Array.from(materialMap.keys()).forEach(deviceId => {
      const device = overlayMap.get(deviceId);
      const materialId = materialMap.get(deviceId);
      const eligibility = classifyRecycleRemoteAddedMaterialEligibility(device, { appliedMap: overlayMap });
      if (!eligibility.eligible || eligibility.materialId !== materialId) {
        materialMap.delete(deviceId);
      }
    });

    if (!overlayMap.size || !materialMap.size) {
      recycleRemoteAutoMaterialModelsByMaterialId = new Map();
      clearRecycleRemoteAutoSessionState();
      return false;
    }

    recycleRemoteAutoDevicesByDeviceId = overlayMap;
    recycleRemoteAutoMaterialEnabledByDeviceId = materialMap;
    setRecycleRemoteAutoApplyState({
      ok: true,
      result: "auto_applied",
      autoAddedCount: overlayMap.size,
      autoBlockedCount: 0
    });
    setRecycleRemoteAutoMaterialApplyState({
      ok: true,
      result: "auto_material_enabled",
      autoMaterialEnabledCount: materialMap.size,
      autoMaterialBlockedCount: 0
    });
    return true;
  }

  function saveRecycleRemoteDebugSessionState() {
    const devices = Array.from(recycleRemoteAddedDevicesByDeviceId.values())
      .map(serializeRecycleRemoteAddedDeviceForSession)
      .filter(Boolean);
    const materialEnabled = getRecycleRemoteMaterialEnabledSessionEntries();
    try {
      if (!devices.length && !materialEnabled.length) {
        sessionStorage.removeItem(RECYCLE_REMOTE_DEBUG_SESSION_STATE_KEY);
        return;
      }
      sessionStorage.setItem(RECYCLE_REMOTE_DEBUG_SESSION_STATE_KEY, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        devices,
        materialEnabled
      }));
    } catch (e) {}
  }

  function clearRecycleRemoteDebugSessionState() {
    try { sessionStorage.removeItem(RECYCLE_REMOTE_DEBUG_SESSION_STATE_KEY); } catch (e) {}
  }

  function restoreRecycleRemoteDebugSessionState() {
    let parsed = null;
    try {
      const raw = String(sessionStorage.getItem(RECYCLE_REMOTE_DEBUG_SESSION_STATE_KEY) || "");
      if (!raw) return false;
      parsed = JSON.parse(raw);
    } catch (e) {
      clearRecycleRemoteDebugSessionState();
      return false;
    }

    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.devices)) {
      clearRecycleRemoteDebugSessionState();
      return false;
    }

    const overlayMap = new Map();
    const blocked = [];
    parsed.devices.forEach(entry => {
      const normalized = normalizeRecycleRemoteAddedDeviceEntry(entry, overlayMap);
      if (normalized.ok) overlayMap.set(normalized.device.deviceId, normalized.device);
      else blocked.push(normalized.deviceId || normalized.displayName || "unknown");
    });

    const materialMap = new Map();
    (Array.isArray(parsed.materialEnabled) ? parsed.materialEnabled : []).forEach(entry => {
      const deviceId = String(entry?.deviceId || "").trim();
      const materialId = normalizeSwapMaterialId(entry?.materialId);
      const device = overlayMap.get(deviceId);
      if (!device || !materialId) return;
      materialMap.set(deviceId, materialId);
    });

    recycleRemoteAddedDevicesByDeviceId = overlayMap;
    recycleRemoteMaterialEnabledByDeviceId = materialMap;

    Array.from(recycleRemoteMaterialEnabledByDeviceId.keys()).forEach(deviceId => {
      const device = recycleRemoteAddedDevicesByDeviceId.get(deviceId);
      const materialId = recycleRemoteMaterialEnabledByDeviceId.get(deviceId);
      const eligibility = classifyRecycleRemoteAddedMaterialEligibility(device);
      if (!eligibility.eligible || eligibility.materialId !== materialId) {
        recycleRemoteMaterialEnabledByDeviceId.delete(deviceId);
      }
    });

    if (blocked.length || !recycleRemoteAddedDevicesByDeviceId.size) saveRecycleRemoteDebugSessionState();
    return Boolean(recycleRemoteAddedDevicesByDeviceId.size || recycleRemoteMaterialEnabledByDeviceId.size);
  }

  function getRecycleDeviceImagePath(device) {
    const imagePath = String(device?.imagePath || "").trim();
    if (imagePath) return imagePath;
    return getRecycleDeviceDefaultImagePath(device) || null;
  }

  function getRecycleDeviceFallbackImagePath(device) {
    return deviceImageForModel(device?.displayName);
  }

  function getRecycleDeviceImagePathByMaterialId(materialId) {
    const id = normalizeSwapMaterialId(materialId);
    if (!id) return "";
    const device = RECYCLE_DEVICE_CATALOG.find(d => {
      if (!isRecycleDeviceEnabled(d)) return false;
      if (normalizeSwapMaterialId(d.materialId) !== id) return false;
      return Boolean(String(d.imagePath || "").trim());
    });
    return device ? String(device.imagePath || "").trim() : "";
  }

  function getSwapMaterialImageForModel(model) {
    return getRecycleDeviceImagePathByMaterialId(model?.id) || deviceImageForModel(model?.name);
  }

  function buildSwapMaterialRecycleFiltersFromDeviceCatalog() {
    return RECYCLE_DEVICE_CATALOG.reduce((filters, device) => {
      if (!isRecycleDeviceEnabled(device)) return filters;
      const categoryId = String(device?.categoryId || "").trim();
      const materialId = normalizeSwapMaterialId(device?.materialId);
      if (!categoryId || !materialId) return filters;
      if (!filters[categoryId]) filters[categoryId] = [];
      filters[categoryId].push(materialId);
      return filters;
    }, {});
  }

  const SWAP_MATERIAL_RECYCLE_FILTERS = buildSwapMaterialRecycleFiltersFromDeviceCatalog();

  function getSwapMaterialRecycleFilter(categoryId) {
    const ids = getRecycleEffectiveMaterialIdsByCategory(categoryId);
    if (!Array.isArray(ids) || !ids.length) return null;
    const normalizedIds = ids.map(normalizeSwapMaterialId).filter(Boolean);
    if (!normalizedIds.length) return null;
    return {
      idSet: new Set(normalizedIds),
      order: new Map(normalizedIds.map((id, idx) => [id, idx]))
    };
  }

  function getRecycleSelectedSnapshotMaterialFilter(categoryId) {
    const snapshot = readValidRecycleEntryMaterialSnapshot(categoryId);
    if (!snapshot || !snapshot.deviceIds.length) return null;
    const seen = new Set();
    const normalizedIds = snapshot.materialIds
      .map(normalizeSwapMaterialId)
      .filter(id => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    return {
      idSet: new Set(normalizedIds),
      order: new Map(normalizedIds.map((id, idx) => [id, idx])),
      hasSelectedDevices: true
    };
  }

  function getSelectedRecycleDeviceMaterialOrder(categoryId) {
    const category = String(categoryId || "").trim();
    if (!category) return new Map();
    const snapshotOrder = getRecycleMaterialOrderFromSnapshot(category);
    if (snapshotOrder) return snapshotOrder;
    const order = new Map();
    readSelectedRecycleDeviceIdsStorage().forEach(deviceId => {
      const device = getRecycleDeviceById(deviceId);
      if (!device || device.categoryId !== category) return;
      const materialId = getRecycleEffectiveMaterialId(device, "sap");
      if (!materialId || order.has(materialId)) return;
      order.set(materialId, order.size);
    });
    return order;
  }

  function getWflowOperationIdFromUrl(url) {
    const m = String(url || "").match(/\/wflow\/(\d+)(?:$|[/?#])/);
    return m ? m[1] : "";
  }

  function findRecycleOperationBreadcrumbLink() {
    const links = Array.from(document.querySelectorAll("a[href]"));
    return links.find(a => {
      const text = String(a.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      const href = String(a.getAttribute("href") || "");
      const absHref = String(a.href || "");
      const isOperationHref = /\/wflow\/\d+(?:$|[/?#])/.test(href) || /\/wflow\/\d+(?:$|[/?#])/.test(absHref);
      return text.includes("рециклиране на устройство") && isOperationHref;
    }) || null;
  }

  function maybeRedirectCamModulesEmptyMaterial(root, input) {
    if (!root || !input) return false;
    if (root.dataset.wifiOssCamModulesFallback === "1") return false;
    if (getSelectedRecycleEntryCategory() !== "cam_modules") return false;
    if (normalizeSwapMaterialId(input.value)) return false;
    if (root.dataset.wifiOssCamModulesRedirectStarted === "1") return true;

    root.dataset.wifiOssCamModulesRedirectStarted = "1";
    setTimeout(() => {
      try {
        if (normalizeSwapMaterialId(input.value)) {
          autoContinueSwapMaterialIfReady(root, input);
          return;
        }

        const link = findRecycleOperationBreadcrumbLink();
        if (link) {
          const opId = getWflowOperationIdFromUrl(link.href || link.getAttribute("href"));
          if (opId) {
            try { sessionStorage.setItem(CAM_MODULES_MISSING_MATERIAL_OPERATION_KEY, opId); } catch (e2) {}
          }
          link.click();
          return;
        }

        console.warn("[swapMaterial] CAM modules recycle operation breadcrumb link not found; showing quick buttons fallback.");
      } catch (e) {
        console.warn("[swapMaterial] CAM modules redirect failed; showing quick buttons fallback.", e);
      }

      root.dataset.wifiOssCamModulesFallback = "1";
      try { injectSwapMaterialButtons(); } catch (e2) {}
    }, 600);

    return true;
  }

  function shouldShowCamModulesMissingMaterialHint() {
    let expectedOpId = "";
    try { expectedOpId = String(sessionStorage.getItem(CAM_MODULES_MISSING_MATERIAL_OPERATION_KEY) || "").trim(); } catch (e) {}
    if (!expectedOpId) return false;
    return getWflowOperationIdFromUrl(window.location.href) === expectedOpId;
  }

  function findServiceTerminationButton() {
    const controls = Array.from(document.querySelectorAll("button, input[type='button'], input[type='submit'], a"));
    return controls.find(el => normalizeLabelText(el.value || el.textContent).includes("служебно прекратяване")) || null;
  }

  function injectCamModulesMissingMaterialHint() {
    if (!shouldShowCamModulesMissingMaterialHint()) return false;
    if (document.getElementById(CAM_MODULES_MISSING_MATERIAL_HINT_ID)) return true;

    const btn = findServiceTerminationButton();
    if (!btn) return false;

    const target = btn.closest("a") || btn;
    const row = target.parentElement;
    if (row) {
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.flexWrap = "nowrap";
      row.style.gap = "12px";
      Array.from(row.querySelectorAll("button, input[type='button'], input[type='submit'], a")).forEach(el => {
        el.style.flexShrink = "0";
      });
    }

    const hint = document.createElement("span");
    hint.id = CAM_MODULES_MISSING_MATERIAL_HINT_ID;
    hint.style.flex = "1 1 auto";
    hint.style.minWidth = "0";
    hint.style.marginLeft = "0";
    hint.style.maxWidth = "none";
    setRecycleInlineAlert(hint, CAM_MODULES_MISSING_MATERIAL_HINT_TEXT, "warning");

    target.insertAdjacentElement("afterend", hint);
    return true;
  }

  function startCamModulesOperationHintObserver() {
    if (!shouldShowCamModulesMissingMaterialHint()) return;
    if (injectCamModulesMissingMaterialHint()) return;

    const obs = new MutationObserver(() => {
      if (injectCamModulesMissingMaterialHint()) obs.disconnect();
    });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  function injectSwapMaterialButtons() {
    const root = document.getElementById(SWAP_MATERIAL_ROOT_ID);
    if (!root) return false;
    if (root.querySelector(".wifi-oss-swap-material-panel")) return true;

    const input = document.getElementById(SWAP_MATERIAL_INPUT_ID);
    if (!input) return false;
    // Lock manual typing; value is controlled by quick buttons + rewrite rules.
    input.readOnly = true;
    input.setAttribute("aria-readonly", "true");
    input.style.backgroundColor = "#f3f3f3";
    input.style.cursor = "not-allowed";
    attachSwapMaterialRewriteRule(input);
    restoreRecycleRemoteAutoSessionState();
    // If we came from a recycle flow with a material preset, prefill based on serial.
    try { applyRecycleCategoryMaterialPreset(input); } catch (e) {}
    autoContinueSwapMaterialIfReady(root, input);
    if (maybeRedirectCamModulesEmptyMaterial(root, input)) return true;
    const autoContinueEnabled = isMaterialAutoContinueEnabled();
    const category = getSelectedRecycleEntryCategory();
    const materialWasEmptyBeforeControlledFill = !normalizeSwapMaterialId(input.value);
    const selectedSnapshotMaterialFilter = getRecycleSelectedSnapshotMaterialFilter(category);
    const hasSelectedSnapshotDevices = Boolean(selectedSnapshotMaterialFilter?.hasSelectedDevices);
    const recycleMaterialFilter = hasSelectedSnapshotDevices
      ? selectedSnapshotMaterialFilter
      : ((materialWasEmptyBeforeControlledFill || !autoContinueEnabled)
        ? getSwapMaterialRecycleFilter(category)
        : null);
    const materialModelsForRecycleContext = getSwapMaterialModelsWithRecycleFallback(swapMaterialModels, recycleMaterialFilter);
    const fillCandidate = getRecycleMaterialFillCandidate(category, input, materialModelsForRecycleContext);
    let materialNoticeMessage = "";
    let shouldAutoContinueAfterControlledFill = false;
    if (fillCandidate.ok) {
      setSwapMaterialInputValue(input, fillCandidate.materialId);
      materialNoticeMessage = SWAP_MATERIAL_MISSING_AUTO_FILLED_WARNING;
      shouldAutoContinueAfterControlledFill = true;
    } else if (materialWasEmptyBeforeControlledFill && hasSelectedSnapshotDevices) {
      materialNoticeMessage = SWAP_MATERIAL_MISSING_AMBIGUOUS_WARNING;
    }

    const panel = document.createElement("div");
    panel.className = "wifi-oss-swap-material-panel";
    panel.style.marginTop = "12px";
    panel.style.paddingTop = "10px";
    panel.style.borderTop = "1px solid #ddd";

    const materialWarning = document.createElement("span");
    materialWarning.id = SWAP_MATERIAL_SIMILAR_WARNING_ID;
    materialWarning.style.display = "none";
    materialWarning.style.flex = "0 1 520px";
    materialWarning.style.alignSelf = "center";
    materialWarning.style.minWidth = "260px";
    materialWarning.style.maxWidth = "520px";
    materialWarning.style.marginLeft = "12px";

    const showSimilarMaterialWarning = (materialId) => {
      const msg = SWAP_MATERIAL_SIMILAR_WARNINGS[normalizeSwapMaterialId(materialId)] || "";
      if (!msg) {
        clearRecycleInlineAlert(materialWarning);
        return;
      }
      setRecycleInlineAlert(materialWarning, msg, "warning");
    };

    const inputParent = input.parentElement;
    let materialWarningHost = null;
    if (inputParent) {
      materialWarningHost = document.createElement("span");
      materialWarningHost.style.display = "inline-flex";
      materialWarningHost.style.alignItems = "center";
      materialWarningHost.style.flexWrap = "nowrap";
      materialWarningHost.style.gap = "0";
      materialWarningHost.style.maxWidth = "none";
      materialWarningHost.style.verticalAlign = "middle";
      inputParent.insertBefore(materialWarningHost, input);
      input.style.flex = "0 0 auto";
      materialWarningHost.appendChild(input);
      materialWarningHost.appendChild(materialWarning);
    }
    if (materialNoticeMessage) setRecycleInlineAlert(materialWarning, materialNoticeMessage, "warning");
    if (shouldAutoContinueAfterControlledFill) autoContinueSwapMaterialIfReady(root, input);

    const title = document.createElement("div");
    title.textContent = "Бърз избор на Material Id";
    title.style.fontWeight = "600";
    title.style.marginBottom = "8px";
    panel.appendChild(title);
    ensureMaterialAutoContinueDebugToggle(panel);

    const searchWrap = document.createElement("div");
    searchWrap.style.marginBottom = "8px";
    if (!materialWarningHost) {
      materialWarning.style.margin = "0 0 8px";
      materialWarning.style.maxWidth = "520px";
      panel.appendChild(materialWarning);
    }

    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Търси по име на устройство…";
    search.autocomplete = "off";
    search.style.width = "100%";
    search.style.maxWidth = "520px";
    search.style.padding = "6px 8px";
    search.style.border = "1px solid #ccc";
    search.style.borderRadius = "6px";
    searchWrap.appendChild(search);
    panel.appendChild(searchWrap);

    let activeCategory = "all";

    const categorizeSwapMaterial = (name) => {
      const n = String(name || "").toLowerCase();
      // Forced "Other" (cards/CAM modules), even if text contains "dth".
      if (
        n.includes("conax smart card") ||
        n.includes("cam neotion ci+ 1.3 cp") ||
        n.includes("cam neotion dvb-ci plus csp") ||
        n.includes("smarcam-3.5") ||
        n.includes("dth smart card")
      ) return "other";

      // Internet-ish
      if (
        n.includes("router") ||
        n.includes("modem") ||
        n.includes("gpon") ||
        n.includes("deco") ||
        /\b5g\b/.test(n) ||
        n.includes("home wifi") ||
        n.includes("wi-fi") ||
        n.includes("wifi") ||
        n.includes("mf283u") ||
        n.includes("mf293n") ||
        n.includes("mf296r") ||
        n.includes("mc888a") ||
        n.includes("mc801a") ||
        n.includes("zxhn h3601p") ||
        n.includes("ex220") ||
        n.includes("wr850n") ||
        n.includes("g5b1") ||
        n.includes("cube zte") ||
        n.includes("b311") ||
        n.includes("b310") ||
        n.includes("nx220") ||
        n.includes("nx520") ||
        n.includes("g5ts") ||
        n.includes("hx520") ||
        n.includes("k562e") ||
        n.includes("archer a6")
      ) return "internet";

      // TV-ish
      if (
        n.includes("stb") ||
        n.includes("dth") ||
        n.includes("androidtv") ||
        n.includes("kaon") ||
        n.includes("nagra") ||
        n.includes("zapper")
      ) return "tv";

      // Non-device accessories/cards/modules -> Other
      if (
        n.includes("smart card") ||
        n.includes("cam") ||
        n.includes("conax") ||
        n.includes("card")
      ) return "other";

      return "other";
    };

    const catRow = document.createElement("div");
    catRow.style.display = "flex";
    catRow.style.flexWrap = "wrap";
    catRow.style.gap = "6px";
    catRow.style.marginBottom = "10px";
    catRow.style.alignItems = "center";

    const catLabel = document.createElement("div");
    catLabel.textContent = "Сортирай:";
    catLabel.style.fontWeight = "600";
    catLabel.style.color = "#333";
    catLabel.style.marginRight = "4px";
    catRow.appendChild(catLabel);

    const catButtons = new Map();

    const makeCatBtn = (id, label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.padding = "5px 10px";
      b.style.borderRadius = "999px";
      b.style.border = "1px solid #4a4a4a";
      b.style.background = id === "all" ? "#4a4a4a" : "#585858";
      b.style.color = "#fff";
      b.style.cursor = "pointer";
      b.style.fontSize = "13px";
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        activeCategory = id;
        // update visuals
        Array.from(catRow.querySelectorAll("button")).forEach(x => {
          const xid = x.dataset.wifiOssCat || "";
          x.style.background = (xid === activeCategory) ? "#4a4a4a" : "#585858";
        });
        applyFilter();
      });
      b.dataset.wifiOssCat = id;
      b.dataset.wifiOssCatLabel = label;
      catButtons.set(id, b);
      return b;
    };

    catRow.appendChild(makeCatBtn("all", "Всички"));
    catRow.appendChild(makeCatBtn("internet", "Интернет"));
    catRow.appendChild(makeCatBtn("tv", "Телевизия"));
    catRow.appendChild(makeCatBtn("other", "Други"));
    if (recycleMaterialFilter) catRow.style.display = "none";
    panel.appendChild(catRow);

    const grid = document.createElement("div");
    grid.style.display = "grid";
    // Fixed layout: 10 devices per row
    grid.style.gridTemplateColumns = "repeat(10, minmax(0, 1fr))";
    grid.style.gap = "6px";

    const dashboardOrigin = "https://oss-assistant.onrender.com";

    const hydrateRemoteImages = async () => {
      const imgs = Array.from(grid.querySelectorAll("img[data-remote-url]"));
      for (const img of imgs) {
        const url = img.getAttribute("data-remote-url") || "";
        if (!url) continue;
        const resp = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage({ type: "swapMaterial.fetchImageDataUrl", url }, (r) => {
              const lastErr = chrome.runtime.lastError?.message;
              if (lastErr) return resolve({ ok: false, error: lastErr });
              resolve(r);
            });
          } catch (e) {
            resolve({ ok: false, error: String(e?.message || e) });
          }
        });
        if (resp?.ok && resp.dataUrl) {
          img.src = resp.dataUrl;
          img.removeAttribute("data-remote-url");
        }
      }
    };

    const modelsForButtons = (() => {
      if (!recycleMaterialFilter) return swapMaterialModels;
      const seen = new Set();
      const selectedMaterialOrder = getSelectedRecycleDeviceMaterialOrder(getSelectedRecycleEntryCategory());
      return materialModelsForRecycleContext
        .filter(m => {
          const id = normalizeSwapMaterialId(m.id);
          if (!recycleMaterialFilter.idSet.has(id)) return false;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .sort((a, b) => {
          const aId = normalizeSwapMaterialId(a.id);
          const bId = normalizeSwapMaterialId(b.id);
          const aSelectedOrder = selectedMaterialOrder.get(aId);
          const bSelectedOrder = selectedMaterialOrder.get(bId);
          const aSelected = Number.isInteger(aSelectedOrder);
          const bSelected = Number.isInteger(bSelectedOrder);
          if (aSelected || bSelected) {
            if (aSelected && bSelected) return aSelectedOrder - bSelectedOrder;
            return aSelected ? -1 : 1;
          }
          const ai = recycleMaterialFilter.order.get(aId);
          const bi = recycleMaterialFilter.order.get(bId);
          return ai - bi;
        });
    })();

    for (const m of modelsForButtons) {
      const normalizedId = normalizeSwapMaterialId(m.id);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-sm btn-light";
      b.style.textAlign = "left";
      b.style.padding = "5px 6px";
      b.style.background = "#585858";
      b.style.borderColor = "#4a4a4a";
      b.style.color = "#fff";
      // Prefer image from dashboard config; fallback to packaged images.
      let imgHtml = "";
      const remote = String(m.image || "").trim();
      if (remote) {
        const abs = /^https?:\/\//i.test(remote)
          ? remote
          : `${dashboardOrigin}${remote.startsWith("/") ? "" : "/"}${remote}`;
        imgHtml = `<img alt="" data-remote-url="${escapeHtml(abs)}" style="width:100%;object-fit:contain;background:#4f4f4f;border-radius:6px;display:block;margin-bottom:6px" />`;
      } else {
        const imgPath = getSwapMaterialImageForModel(m);
        const imgUrl = imgPath && (typeof chrome !== "undefined" && chrome.runtime?.getURL)
          ? chrome.runtime.getURL(imgPath)
          : null;
        imgHtml = imgUrl
          ? `<img alt="" src="${escapeHtml(imgUrl)}" style="width:100%;object-fit:contain;background:#4f4f4f;border-radius:6px;display:block;margin-bottom:6px" />`
          : "";
      }
      b.innerHTML = `${imgHtml}<div style="font-weight:600;font-size:12px;line-height:1.15;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;min-height:2.3em">${escapeHtml(m.name)}</div><div style="font-size:11px;color:#e6e6e6;line-height:1.1">${escapeHtml(normalizedId)}</div>`;
      b.dataset.wifiOssSwapMaterialName = String(m.name || "").toLowerCase();
      b.dataset.wifiOssSwapMaterialId = normalizedId;
      b.dataset.wifiOssSwapMaterialCategory = (m.category === "internet" || m.category === "tv" || m.category === "other")
        ? m.category
        : categorizeSwapMaterial(m.name);
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showSimilarMaterialWarning(normalizedId);
        setSwapMaterialInputValue(input, normalizedId);
        try { input.focus(); input.select?.(); } catch (e2) {}
      });
      b.addEventListener("mouseenter", () => { b.style.background = "#4a4a4a"; });
      b.addEventListener("mouseleave", () => { b.style.background = "#585858"; });
      grid.appendChild(b);
    }

    hydrateRemoteImages();

    const updateCategoryCounts = () => {
      const buttons = Array.from(grid.querySelectorAll("button"));
      const total = buttons.length;
      let internet = 0;
      let tv = 0;
      let other = 0;
      for (const btn of buttons) {
        const c = btn.dataset.wifiOssSwapMaterialCategory || "other";
        if (c === "internet") internet += 1;
        else if (c === "tv") tv += 1;
        else other += 1;
      }
      const setCount = (id, count) => {
        const cb = catButtons.get(id);
        if (!cb) return;
        const lbl = cb.dataset.wifiOssCatLabel || cb.textContent || "";
        cb.textContent = `${lbl} - (${count})`;
      };
      setCount("all", total);
      setCount("internet", internet);
      setCount("tv", tv);
      setCount("other", other);
    };
    updateCategoryCounts();

    panel.appendChild(grid);
    root.appendChild(panel);

    const applyFilter = () => {
      const q = String(search.value || "").trim().toLowerCase();
      const buttons = grid.querySelectorAll("button");
      buttons.forEach(btn => {
        const n = (btn.dataset.wifiOssSwapMaterialName || "");
        const id = (btn.dataset.wifiOssSwapMaterialId || "");
        const c = (btn.dataset.wifiOssSwapMaterialCategory || "other");
        // Search stays scoped to the rendered button set; for the normal panel it ignores broad category chips.
        // Category chips apply only when the search box is empty.
        const okCat = recycleMaterialFilter ? true : (q ? true : ((activeCategory === "all") || (c === activeCategory)));
        const okQuery = !q || n.includes(q) || id.includes(q);
        btn.style.display = (okCat && okQuery) ? "" : "none";
      });
    };
    search.addEventListener("input", applyFilter);
    // focus for faster workflow
    try { search.focus(); } catch (e) {}
    // initial apply (category defaults to "all")
    applyFilter();

    return true;
  }

  function startSwapMaterialObserver() {
    const tryInject = () => injectSwapMaterialButtons();
    if (tryInject()) return;
    const obs = new MutationObserver(() => { tryInject(); });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  // -----------------------------------------
  // Recycle device entry: Category + validation
  // -----------------------------------------
  const RECYCLE_ENTRY_ROOT_ID = "_wflowEnterDeviceDataForRecycle";
  const RECYCLE_ENTRY_SERIAL_INPUT_ID = "_wflowEnterDeviceDataForRecycle_SerialNo";
  const RECYCLE_ENTRY_CONTINUE_BTN_ID = "_wflowEnterDeviceDataForRecycle_save";
  const RECYCLE_ENTRY_PANEL_CLASS = "wifi-oss-recycle-category-panel";
  const RECYCLE_ENTRY_SELECTED_KEY = "wifi_oss_recycle_entry_category";
  const RECYCLE_ENTRY_SELECTED_DATE_KEY = "wifi_oss_recycle_entry_category_date";
  const RECYCLE_ENTRY_SELECTED_DEVICES_KEY = "wifi_oss_recycle_entry_selected_devices";
  const RECYCLE_ENTRY_DEVICE_REQUIRED_DEBUG_KEY = "wifi_oss_debug_recycle_device_required_enabled";
  const RECYCLE_ENTRY_DEVICE_REQUIRED_EXCLUDED_CATEGORY_IDS = new Set(["cam_modules", "modems"]);
  const RECYCLE_DEBUG_GUARDS_TRAY_ATTR = "data-wifi-oss-recycle-debug-guards-tray";
  const RECYCLE_DEBUG_GUARDS_STATUS_ATTR = "data-wifi-oss-recycle-debug-guards-status";
  const RECYCLE_DEVICE_REQUIRED_TOGGLE_ATTR = "data-wifi-oss-recycle-device-required-toggle";
  const RECYCLE_ENTRY_LAST_SERIAL_KEY = "wifi_oss_recycle_entry_last_serial";
  const RECYCLE_ENTRY_PENDING_MATERIAL_KEY = "wifi_oss_recycle_entry_pending_material";
  const RECYCLE_ENTRY_MATERIAL_SNAPSHOT_KEY = "wifi_oss_recycle_entry_material_snapshot";
  const RECYCLE_HISTORY_TEMPLATE_KEY = "wifi_oss_recycle_history_url_template";
  const RECYCLE_SERIAL_ALERT_ID = "wifi-oss-recycle-serial-msg";
  const RECYCLE_SERIAL_HELP_BUTTON_ID = "wifi-oss-recycle-serial-help-btn";
  const RECYCLE_SERIAL_HELP_PANEL_ID = "wifi-oss-recycle-serial-help-panel";
  const RECYCLE_STATE_ROOT_ID = "_wflowRecycleState";
  const RECYCLE_STATE_SERIAL_INPUT_ID = "_wflowRecycleState_SerialNo";
  const RECYCLE_STATE_MAC_INPUT_ID = "_wflowRecycleState_Mac";
  const RECYCLE_STATE_STB_PROFILE_SELECT_ID = "_wflowRecycleState_StbProfile";
  const RECYCLE_STATE_SSID1_INPUT_ID = "_wflowRecycleState_Ssid1";
  const RECYCLE_STATE_SSID2_INPUT_ID = "_wflowRecycleState_Ssid2";

  function isRecycleDeviceRequiredGuardEnabled() {
    try { return sessionStorage.getItem(RECYCLE_ENTRY_DEVICE_REQUIRED_DEBUG_KEY) !== "0"; } catch (e) {}
    return true;
  }

  function setRecycleDeviceRequiredGuardEnabled(enabled) {
    try {
      if (enabled) sessionStorage.removeItem(RECYCLE_ENTRY_DEVICE_REQUIRED_DEBUG_KEY);
      else sessionStorage.setItem(RECYCLE_ENTRY_DEVICE_REQUIRED_DEBUG_KEY, "0");
    } catch (e) {}
    updateRecycleDebugGuardsToggles();
  }

  function updateRecycleDebugGuardsToggles(root = document) {
    const materialEnabled = isMaterialAutoContinueEnabled();
    const deviceRequiredEnabled = isRecycleDeviceRequiredGuardEnabled();
    const statusText = `material ${materialEnabled ? "ON" : "OFF"} | device required ${deviceRequiredEnabled ? "ON" : "OFF"}`;
    const trays = [];
    if (root?.matches?.(`[${RECYCLE_DEBUG_GUARDS_TRAY_ATTR}]`)) trays.push(root);
    root?.querySelectorAll?.(`[${RECYCLE_DEBUG_GUARDS_TRAY_ATTR}]`).forEach(tray => trays.push(tray));
    trays.forEach(tray => {
      const status = tray.querySelector(`[${RECYCLE_DEBUG_GUARDS_STATUS_ATTR}]`);
      if (status) status.textContent = statusText;

      const btn = tray.querySelector(`[${RECYCLE_DEVICE_REQUIRED_TOGGLE_ATTR}]`);
      if (!btn) return;
      btn.textContent = `Device required ${deviceRequiredEnabled ? "ON" : "OFF"}`;
      btn.style.background = deviceRequiredEnabled ? "#f3f3f3" : "#fff4e5";
      btn.style.borderColor = deviceRequiredEnabled ? "#c9c9c9" : "#d28a1d";
      btn.style.color = deviceRequiredEnabled ? "#333" : "#8a4b00";
    });
  }
  const RECYCLE_STATE_KSTB5019_DEVICE_ID = "kaon_kstb5019_xploretv";
  const RECYCLE_STATE_KSTB5019_CATEGORY_ID = "xplore_zapper";
  const RECYCLE_STATE_KSTB5019_OTT_INFO_ID = "wifi-oss-recycle-state-kstb5019-ott-info";
  const RECYCLE_STATE_KSTB5019_OTT_INFO_TEXT = "OTT е избрано по подразбиране.";
  const RECYCLE_STATE_EX220_SSID_WARNING_ID = "wifi-oss-recycle-state-ex220-ssid-warning";
  const RECYCLE_STATE_EX220_DEVICE_IDS = new Set(["tp_link_ex220", "tp_link_ex220_home"]);
  const RECYCLE_STATE_EX220_SSID_WARNING_TEXT = "\u0418\u043c\u0435\u0442\u043e \u043d\u0430 \u043c\u0440\u0435\u0436\u0430\u0442\u0430 \u0435 \u043d\u0435\u043e\u0431\u0438\u0447\u0430\u0439\u043d\u043e \u0437\u0430 \u0442\u043e\u0437\u0438 \u043c\u043e\u0434\u0435\u043b. \u041f\u0440\u043e\u0432\u0435\u0440\u0438 \u043e\u0442 \u0435\u0442\u0438\u043a\u0435\u0442\u0430 \u043d\u0430 \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u043e\u0442\u043e \u0434\u0430\u043b\u0438 \u0442\u043e\u0432\u0430 \u043d\u0430\u0438\u0441\u0442\u0438\u043d\u0430 \u0435 TP-Link EX220.";
  const RECYCLE_STATE_DTH_AUTOFILL_CONFIG_BY_DEVICE_ID = {
    dth_kaon_kstb1001: {
      categoryId: "dth_kaon_nagra",
      sourceInputId: "_wflowRecycleState_ChipIdDth",
      targetInputId: "_wflowRecycleState_SerialNoDth",
      focusInputId: "_wflowRecycleState_CardNo"
    },
    dth_nagra_dts3460: {
      categoryId: "dth_kaon_nagra",
      sourceInputId: "_wflowRecycleState_ChipIdDth",
      targetInputId: "_wflowRecycleState_SerialNoDth",
      focusInputId: "_wflowRecycleState_CardNo"
    }
  };
  const RECYCLE_HISTORY_PATH_RE = /^(.*\/sap-recycle-devices-by-technician\/\d+\/\d+)\/?$/;
  const RECYCLE_HISTORY_DAYS_BACK = 3;
  const RECYCLE_HISTORY_FROM_PARAM = "RecycleDevicesByTechnician.From";
  const RECYCLE_HISTORY_TO_PARAM = "RecycleDevicesByTechnician.To";
  let recycleHistoryCache = {
    key: "",
    lookup: new Map(),
    loaded: false,
    inFlight: null
  };
  let recycleHistoryDuplicateOverrideSerial = "";
  const recycleHistoryWarnedKeys = new Set();

  function warnRecycleHistoryOnce(key, ...args) {
    const k = String(key || "generic");
    if (recycleHistoryWarnedKeys.has(k)) return;
    recycleHistoryWarnedKeys.add(k);
    try { console.warn("[recycleHistory]", ...args); } catch (e) {}
  }

  function normalizeRecycleHistorySerial(serialRaw) {
    return String(serialRaw || "").trim().toUpperCase();
  }

  function formatRecycleHistoryDate(d) {
    const date = d instanceof Date ? d : new Date();
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }

  function addRecycleHistoryDays(d, deltaDays) {
    const date = d instanceof Date ? d : new Date();
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + Number(deltaDays || 0));
  }

  function sanitizeRecycleHistoryUrl(rawUrl) {
    if (!rawUrl) return "";
    try {
      const url = new URL(String(rawUrl), window.location.href);
      if (url.origin !== window.location.origin) return "";
      const m = url.pathname.match(RECYCLE_HISTORY_PATH_RE);
      if (!m) return "";
      return m[1];
    } catch (e) {}
    return "";
  }

  function readRecycleHistoryTemplatePath() {
    try {
      const raw = String(localStorage.getItem(RECYCLE_HISTORY_TEMPLATE_KEY) || "");
      const path = sanitizeRecycleHistoryUrl(raw);
      if (path) return path;
      if (raw) localStorage.removeItem(RECYCLE_HISTORY_TEMPLATE_KEY);
    } catch (e) {}
    return "";
  }

  function writeRecycleHistoryTemplatePath(path) {
    const clean = sanitizeRecycleHistoryUrl(path);
    if (!clean) return "";
    try { localStorage.setItem(RECYCLE_HISTORY_TEMPLATE_KEY, clean); } catch (e) {}
    return clean;
  }

  function discoverRecycleHistoryTemplateFromDom() {
    const candidates = [];
    try { candidates.push(window.location.href); } catch (e) {}
    try {
      document.querySelectorAll('a[href*="sap-recycle-devices-by-technician"]').forEach(a => {
        candidates.push(a.getAttribute("href") || a.href || "");
      });
    } catch (e) {}

    for (const raw of candidates) {
      const clean = sanitizeRecycleHistoryUrl(raw);
      if (clean) return writeRecycleHistoryTemplatePath(clean);
    }
    return readRecycleHistoryTemplatePath();
  }

  function buildRecycleHistoryUrlForDateRange(now = new Date()) {
    const templatePath = discoverRecycleHistoryTemplateFromDom();
    if (!templatePath) return "";
    try {
      const url = new URL(templatePath, window.location.origin);
      url.search = "";
      url.searchParams.set(RECYCLE_HISTORY_FROM_PARAM, formatRecycleHistoryDate(addRecycleHistoryDays(now, -RECYCLE_HISTORY_DAYS_BACK)));
      url.searchParams.set(RECYCLE_HISTORY_TO_PARAM, formatRecycleHistoryDate(addRecycleHistoryDays(now, 1)));
      return url.href;
    } catch (e) {}
    return "";
  }

  function findRecycleHistoryColumnIndex(headerCells, relName, textMatchers, fallbackIdx) {
    const rel = String(relName || "").toLowerCase();
    let idx = headerCells.findIndex(th => (th.getAttribute("rel") || "").toLowerCase() === rel);
    if (idx < 0) {
      idx = headerCells.findIndex(th => {
        const text = (th.textContent || "").trim().toLowerCase();
        return textMatchers.some(m => (typeof m === "string" ? text === m : m.test(text)));
      });
    }
    return idx >= 0 ? idx : fallbackIdx;
  }

  function normalizeRecycleHistorySuccess(raw) {
    const text = String(raw || "").replace(/\s+/g, " ").trim();
    const lower = text.toLowerCase();
    if (lower === "да") return "yes";
    if (lower === "не") return "no";
    return "";
  }

  function parseRecycleHistoryItemsFromDocument(doc) {
    const root = doc?.getElementById?.(RECYCLE_LIST_ID);
    if (!root) return [];
    const table = root.querySelector("table");
    if (!table) return [];

    const headerCells = Array.from(table.querySelectorAll("tr th"));
    const serialIdx = findRecycleHistoryColumnIndex(headerCells, "SerialNumber", ["сериен номер", /serial/], 4);
    const sapIdx = findRecycleHistoryColumnIndex(headerCells, "SapId", ["sapid", "sap id"], 5);
    const successIdx = findRecycleHistoryColumnIndex(headerCells, "IsSuccess", ["успешно рециклиран"], 6);

    const rows = Array.from(table.querySelectorAll("tbody tr")).filter(tr => tr.querySelectorAll("td").length > 0);
    const items = [];
    for (const tr of rows) {
      const tds = tr.querySelectorAll("td");
      const serial = (tds[serialIdx]?.textContent || "").trim();
      const serialKey = normalizeRecycleHistorySerial(serial);
      if (!serialKey) continue;
      const sapId = (tds[sapIdx]?.textContent || "").trim();
      const successText = (tds[successIdx]?.textContent || "").trim();
      const success = normalizeRecycleHistorySuccess(successText);
      items.push({ serial, serialKey, sapId, successText, success });
    }
    return items;
  }

  function buildRecycleHistoryLookup(items) {
    const lookup = new Map();
    for (const item of Array.from(items || [])) {
      const serialKey = normalizeRecycleHistorySerial(item?.serialKey || item?.serial);
      if (!serialKey) continue;
      if (item?.success !== "yes" && item?.success !== "no") continue;
      if (!lookup.has(serialKey)) lookup.set(serialKey, { ...item, serialKey });
    }
    return lookup;
  }

  async function preloadRecycleHistoryCache({ force = false } = {}) {
    const url = buildRecycleHistoryUrlForDateRange();
    if (!url) {
      warnRecycleHistoryOnce("missing-url", "History URL/template is unavailable; duplicate validation will fail open.");
      return false;
    }

    if (!force && recycleHistoryCache.loaded && recycleHistoryCache.key === url) return true;
    if (recycleHistoryCache.inFlight && recycleHistoryCache.key === url) return recycleHistoryCache.inFlight;

    recycleHistoryCache.key = url;
    recycleHistoryCache.inFlight = (async () => {
      try {
        const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        if (!doc.getElementById(RECYCLE_LIST_ID)) throw new Error("Recycle history list not found");
        const items = parseRecycleHistoryItemsFromDocument(doc);
        recycleHistoryCache.lookup = buildRecycleHistoryLookup(items);
        recycleHistoryCache.loaded = true;
        try { console.info("[recycleHistory] loaded", { url, rows: items.length }); } catch (e) {}
        return true;
      } catch (e) {
        recycleHistoryCache.lookup = new Map();
        recycleHistoryCache.loaded = false;
        warnRecycleHistoryOnce(`fetch:${url}`, "History fetch/parse failed; duplicate validation will fail open.", e);
        return false;
      } finally {
        recycleHistoryCache.inFlight = null;
      }
    })();

    return recycleHistoryCache.inFlight;
  }

  function getRecycleHistoryDuplicateForSerial(serialRaw) {
    if (!recycleHistoryCache.loaded || !(recycleHistoryCache.lookup instanceof Map)) return null;
    const serialKey = normalizeRecycleHistorySerial(serialRaw);
    if (!serialKey) return null;
    return recycleHistoryCache.lookup.get(serialKey) || null;
  }

  function consumeRecycleHistoryDuplicateOverride(serialKey) {
    const key = normalizeRecycleHistorySerial(serialKey);
    if (!key) {
      recycleHistoryDuplicateOverrideSerial = "";
      return false;
    }
    if (recycleHistoryDuplicateOverrideSerial === key) {
      recycleHistoryDuplicateOverrideSerial = "";
      return true;
    }
    if (recycleHistoryDuplicateOverrideSerial) recycleHistoryDuplicateOverrideSerial = "";
    return false;
  }

  function showRecycleDuplicateWarning(container, duplicate, serialInput, continueBtn) {
    if (!container || !duplicate) return;
    const serialKey = normalizeRecycleHistorySerial(duplicate.serialKey || duplicate.serial || serialInput?.value);
    const recycled = duplicate.success === "yes";
    const message = recycled
      ? "Това устройство вече е рециклирано, искате ли да продължите?"
      : "Това устройство вече е бракувано, искате ли да продължите?";

    container.textContent = "";
    container.dataset.wifiOssRecycleSerialAlertKind = "duplicate";
    container.dataset.wifiOssRecycleDuplicateSerial = serialKey;
    container.style.display = "inline-flex";
    container.style.alignItems = "center";
    container.style.flexWrap = "wrap";
    container.style.gap = "8px";
    container.style.boxSizing = "border-box";
    container.style.padding = "7px 10px";
    container.style.borderRadius = "6px";
    container.style.border = "1px solid #d28a1d";
    container.style.background = "#fff7e6";
    container.style.color = "#7a4300";
    container.style.fontWeight = "700";
    container.style.fontSize = "13px";
    container.style.lineHeight = "1.25";
    container.style.verticalAlign = "middle";
    container.setAttribute("role", "alert");

    const text = document.createElement("span");
    text.textContent = message;
    text.style.minWidth = "0";
    text.style.flex = "1 1 auto";
    container.appendChild(text);

    const yesBtn = document.createElement("button");
    yesBtn.type = "button";
    yesBtn.textContent = "Да";
    yesBtn.style.padding = "5px 11px";
    yesBtn.style.border = "1px solid #8a8a8a";
    yesBtn.style.borderRadius = "4px";
    yesBtn.style.background = "#eeeeee";
    yesBtn.style.color = "#444";
    yesBtn.style.fontWeight = "700";
    yesBtn.style.cursor = "pointer";

    const noBtn = document.createElement("button");
    noBtn.type = "button";
    noBtn.textContent = "Не";
    noBtn.style.padding = "5px 11px";
    noBtn.style.border = "1px solid #DA291C";
    noBtn.style.borderRadius = "4px";
    noBtn.style.background = "#DA291C";
    noBtn.style.color = "#fff";
    noBtn.style.fontWeight = "800";
    noBtn.style.cursor = "pointer";

    yesBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      recycleHistoryDuplicateOverrideSerial = serialKey;
      clearRecycleInlineAlert(container);
      try { continueBtn?.click?.(); } catch (e2) {}
    }, true);

    noBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (serialInput && serialInput.value !== "") {
        serialInput.value = "";
        try { serialInput.dispatchEvent(new Event("input", { bubbles: true })); } catch (e2) {}
        try { serialInput.dispatchEvent(new Event("change", { bubbles: true })); } catch (e2) {}
      }
      try { serialInput?.focus?.(); serialInput?.select?.(); } catch (e2) {}
    }, true);

    container.appendChild(yesBtn);
    container.appendChild(noBtn);
    playRecycleInlineAlertShake(container);
    setTimeout(() => {
      try { noBtn.focus({ preventScroll: true }); } catch (e) {
        try { noBtn.focus(); } catch (e2) {}
      }
    }, 0);
  }

  function clearRecycleEntrySelectedDevicesStorage() {
    try { localStorage.removeItem(RECYCLE_ENTRY_SELECTED_DEVICES_KEY); } catch (e) {}
  }

  function clearRecycleEntryMaterialSnapshotStorage() {
    try { sessionStorage.removeItem(RECYCLE_ENTRY_MATERIAL_SNAPSHOT_KEY); } catch (e) {}
  }

  function clearRecycleEntrySelectionStorage() {
    try { localStorage.removeItem(RECYCLE_ENTRY_SELECTED_KEY); } catch (e) {}
    try { localStorage.removeItem(RECYCLE_ENTRY_SELECTED_DATE_KEY); } catch (e) {}
    clearRecycleEntrySelectedDevicesStorage();
    clearRecycleEntryMaterialSnapshotStorage();
    try { sessionStorage.removeItem(RECYCLE_ENTRY_SELECTED_KEY); } catch (e) {}
  }

  function isRecycleEntrySelectionDateExpired() {
    try {
      const savedDate = String(localStorage.getItem(RECYCLE_ENTRY_SELECTED_DATE_KEY) || "");
      return Boolean(savedDate && savedDate !== localDateKey());
    } catch (e) {}
    return false;
  }

  function readSelectedRecycleEntryCategory() {
    if (isRecycleEntrySelectionDateExpired()) {
      clearRecycleEntrySelectionStorage();
      return "";
    }

    try {
      const selected = String(localStorage.getItem(RECYCLE_ENTRY_SELECTED_KEY) || "").trim();
      if (selected) return selected;
    } catch (e) {}

    try {
      const legacy = String(sessionStorage.getItem(RECYCLE_ENTRY_SELECTED_KEY) || "").trim();
      if (legacy) {
        writeSelectedRecycleEntryCategory(legacy);
        return legacy;
      }
    } catch (e) {}

    return "";
  }

  function writeSelectedRecycleEntryCategory(id) {
    const selected = String(id || "").trim();
    if (!selected) {
      clearRecycleEntrySelectionStorage();
      return;
    }
    try {
      localStorage.setItem(RECYCLE_ENTRY_SELECTED_DATE_KEY, localDateKey());
      localStorage.setItem(RECYCLE_ENTRY_SELECTED_KEY, selected);
      sessionStorage.removeItem(RECYCLE_ENTRY_SELECTED_KEY);
    } catch (e) {}
  }

  function readSelectedRecycleDeviceIdsStorage() {
    try {
      const parsed = JSON.parse(String(localStorage.getItem(RECYCLE_ENTRY_SELECTED_DEVICES_KEY) || "[]"));
      if (!Array.isArray(parsed)) return [];
      const clean = [];
      const seen = new Set();
      parsed.forEach(id => {
        const value = String(id || "").trim();
        if (!value || seen.has(value)) return;
        seen.add(value);
        clean.push(value);
      });
      return clean;
    } catch (e) {}
    return [];
  }

  function writeSelectedRecycleDeviceIdsStorage(ids) {
    const clean = [];
    const seen = new Set();
    Array.from(ids || []).forEach(id => {
      const value = String(id || "").trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      clean.push(value);
    });
    try {
      if (clean.length) localStorage.setItem(RECYCLE_ENTRY_SELECTED_DEVICES_KEY, JSON.stringify(clean));
      else localStorage.removeItem(RECYCLE_ENTRY_SELECTED_DEVICES_KEY);
    } catch (e) {}
  }

  function createRecycleEntryMaterialSnapshot(categoryId, serialRaw) {
    const category = String(categoryId || "").trim();
    const deviceIds = [];
    const materialIds = [];
    const seenDevices = new Set();
    const seenMaterials = new Set();

    if (category) {
      readSelectedRecycleDeviceIdsStorage().forEach(deviceId => {
        const id = String(deviceId || "").trim();
        if (!id || seenDevices.has(id)) return;
        const device = getRecycleDeviceById(id);
        if (isRecycleRemoteAddedDevice(device) && !isRecycleRemoteMaterialEnabledDevice(device)) return;
        if (!device || device.categoryId !== category) return;
        seenDevices.add(id);
        deviceIds.push(id);
        const materialId = getRecycleEffectiveMaterialId(device, "sap");
        if (materialId && !seenMaterials.has(materialId)) {
          seenMaterials.add(materialId);
          materialIds.push(materialId);
        }
      });
    }

    return {
      categoryId: category,
      deviceIds,
      materialIds,
      serial: String(serialRaw || "").trim(),
      date: localDateKey()
    };
  }

  function writeRecycleEntryMaterialSnapshot(categoryId, serialRaw) {
    const snapshot = createRecycleEntryMaterialSnapshot(categoryId, serialRaw);
    try {
      sessionStorage.setItem(RECYCLE_ENTRY_MATERIAL_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch (e) {}
  }

  function normalizeRecycleEntryMaterialSnapshot(snapshot, categoryId) {
    if (!snapshot || typeof snapshot !== "object") return null;
    const category = String(categoryId || "").trim();
    const snapshotCategory = String(snapshot.categoryId || "").trim();
    if (!category || snapshotCategory !== category) return null;
    if (String(snapshot.date || "") !== localDateKey()) return null;
    if (!Array.isArray(snapshot.deviceIds) || !Array.isArray(snapshot.materialIds)) return null;

    const deviceIds = [];
    const materialIds = [];
    const seenDevices = new Set();
    const seenMaterials = new Set();

    for (const rawId of snapshot.deviceIds) {
      const id = String(rawId || "").trim();
      if (!id || seenDevices.has(id)) return null;
      const device = getRecycleDeviceById(id);
      if (isRecycleRemoteAddedDevice(device) && !isRecycleRemoteMaterialEnabledDevice(device)) return null;
      if (!device || device.categoryId !== category) return null;
      seenDevices.add(id);
      deviceIds.push(id);
      const materialId = getRecycleEffectiveMaterialId(device, "sap");
      if (materialId && !seenMaterials.has(materialId)) {
        seenMaterials.add(materialId);
        materialIds.push(materialId);
      }
    }

    const snapshotMaterialIds = [];
    const seenSnapshotMaterials = new Set();
    for (const rawMaterialId of snapshot.materialIds) {
      const materialId = normalizeSwapMaterialId(rawMaterialId);
      if (!materialId || seenSnapshotMaterials.has(materialId)) return null;
      seenSnapshotMaterials.add(materialId);
      snapshotMaterialIds.push(materialId);
    }

    if (snapshotMaterialIds.length !== materialIds.length) return null;
    for (let i = 0; i < materialIds.length; i += 1) {
      if (snapshotMaterialIds[i] !== materialIds[i]) return null;
    }

    return {
      categoryId: category,
      deviceIds,
      materialIds,
      serial: String(snapshot.serial || "").trim(),
      date: String(snapshot.date || "")
    };
  }

  function readValidRecycleEntryMaterialSnapshot(categoryId) {
    let parsed = null;
    try {
      const raw = String(sessionStorage.getItem(RECYCLE_ENTRY_MATERIAL_SNAPSHOT_KEY) || "");
      if (!raw) return null;
      parsed = JSON.parse(raw);
    } catch (e) {}

    const snapshot = normalizeRecycleEntryMaterialSnapshot(parsed, categoryId);
    if (!snapshot) clearRecycleEntryMaterialSnapshotStorage();
    return snapshot;
  }

  function hasSelectedRecycleMaterialSnapshotDevices(categoryId) {
    const snapshot = readValidRecycleEntryMaterialSnapshot(categoryId);
    return Boolean(snapshot && snapshot.deviceIds.length);
  }

  function getRecycleMaterialOrderFromSnapshot(categoryId) {
    const snapshot = readValidRecycleEntryMaterialSnapshot(categoryId);
    if (!snapshot) return null;
    const order = new Map();
    snapshot.materialIds.forEach(materialId => {
      if (!order.has(materialId)) order.set(materialId, order.size);
    });
    return order;
  }

  function getRecycleMaterialFillCandidate(categoryId, inputEl, models = swapMaterialModels) {
    const category = String(categoryId || "").trim();
    if (!category) return { ok: false, materialId: "", reason: "missing_category" };
    if (category === "cam_modules") return { ok: false, materialId: "", reason: "special_cam_modules" };
    if (category === "modems") return { ok: false, materialId: "", reason: "special_modems" };
    if (normalizeSwapMaterialId(inputEl?.value)) return { ok: false, materialId: "", reason: "material_prefilled" };

    const snapshot = readValidRecycleEntryMaterialSnapshot(category);
    if (category === "austrian" && (!snapshot || !snapshot.deviceIds.length)) {
      return { ok: false, materialId: "", reason: "austrian_legacy_preset" };
    }
    if (!snapshot) return { ok: false, materialId: "", reason: "missing_or_invalid_snapshot" };
    if (!snapshot.deviceIds.length) return { ok: false, materialId: "", reason: "no_selected_devices" };
    if (snapshot.materialIds.length !== 1) return { ok: false, materialId: "", reason: "ambiguous_material" };

    const materialId = normalizeSwapMaterialId(snapshot.materialIds[0]);
    if (!materialId) return { ok: false, materialId: "", reason: "missing_material" };

    const modelList = Array.isArray(models) ? models : [];
    const hasMaterialModel = modelList.some(model => normalizeSwapMaterialId(model?.id) === materialId);
    if (!hasMaterialModel) return { ok: false, materialId, reason: "missing_material_model" };

    return { ok: true, materialId, reason: "ok" };
  }

  const RECYCLE_SERIAL_CYRILLIC_WARNING = "\u0417\u0430\u0441\u0435\u0447\u0435\u043d\u0430 \u0435 \u043a\u0438\u0440\u0438\u043b\u0438\u0446\u0430 \u0432 \u0441\u0435\u0440\u0438\u0439\u043d\u0438\u044f \u043d\u043e\u043c\u0435\u0440. \u0421\u043c\u0435\u043d\u0438 \u043a\u043b\u0430\u0432\u0438\u0430\u0442\u0443\u0440\u0430\u0442\u0430 \u043d\u0430 EN \u0438 \u0441\u043a\u0430\u043d\u0438\u0440\u0430\u0439 \u043e\u0442\u043d\u043e\u0432\u043e.";
  const RECYCLE_SERIAL_HELP_BY_CATEGORY = {
    android_iptv: [
      {
        title: "B866V2F02 (AndroidTV)",
        imagePath: "images/recycle-help/android_iptv-zte-zxv10-b866v2f02-richmedia-box.webp",
        alt: "Правилен barcode за ZTE ZXV10 B866V2F02 / RichMedia Box"
      },
      {
        title: "DV9161 (AndroidTV)",
        imagePath: "images/recycle-help/android_iptv-a1-sdmc-dv9161.webp",
        alt: "Правилен barcode за A1 / SDMC DV9161"
      },
      {
        title: "STB ZXV B700v5",
        imagePath: "images/recycle-help/android_iptv-zte-zxv10-b700v5-iptv.webp",
        alt: "Правилен barcode за ZTE ZXV10 B700V5 IPTV"
      }
    ],
    modems: [
      {
        title: "Modem Technivolor v1",
        imagePath: "images/recycle-help/Modem Technivolor v1.webp",
        alt: "РџСЂР°РІРёР»РµРЅ barcode Р·Р° Modem Technivolor v1"
      },
      {
        title: "Modem Technivolor v2",
        imagePath: "images/recycle-help/Modem Technivolor v2.webp",
        alt: "РџСЂР°РІРёР»РµРЅ barcode Р·Р° Modem Technivolor v2"
      }
    ]
  };
  const RECYCLE_SERIAL_KEYBOARD_DEBUG_KEY = "wifi_oss_serial_keyboard_debug";
  const RECYCLE_SERIAL_KEYBOARD_DEBUG_EVENTS_KEY = "wifi_oss_serial_keyboard_debug_events";
  const RECYCLE_SERIAL_KEYBOARD_DEBUG_LIMIT = 500;
  let recycleSerialDebugLastTs = 0;
  let recycleSerialDebugNoticeShown = false;
  let recycleSerialHelpUi = null;
  let recycleSerialHelpCloseTimer = 0;
  let recycleSerialHelpPreviewUi = null;
  let recycleSerialHelpPreviewTimer = 0;
  let recycleSerialHelpPreviewCloseTimer = 0;
  const recycleInlineAlertAnimations = new WeakMap();

  function stopRecycleInlineAlertAnimation(el) {
    const animation = recycleInlineAlertAnimations.get(el);
    if (!animation) return;
    try { animation.cancel(); } catch (e) {}
    recycleInlineAlertAnimations.delete(el);
  }

  function playRecycleInlineAlertShake(el) {
    if (!el) return;
    if (typeof el.animate !== "function") return;
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    } catch (e) {}

    stopRecycleInlineAlertAnimation(el);
    const animation = el.animate([
      { transform: "translateX(0)" },
      { transform: "translateX(-7px)" },
      { transform: "translateX(7px)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(0)" }
    ], {
      duration: 220,
      easing: "ease-out"
    });
    recycleInlineAlertAnimations.set(el, animation);

    const cleanup = () => {
      if (recycleInlineAlertAnimations.get(el) === animation) {
        recycleInlineAlertAnimations.delete(el);
      }
    };
    try {
      animation.addEventListener("finish", cleanup, { once: true });
      animation.addEventListener("cancel", cleanup, { once: true });
    } catch (e) {}
  }

  function playRecycleSerialErrorShake(el) {
    if (!el || el.id !== RECYCLE_SERIAL_ALERT_ID) return;
    playRecycleInlineAlertShake(el);
  }

  function setRecycleInlineAlert(el, message, variant) {
    if (!el) return;
    const warning = variant === "warning";
    el.textContent = "";
    el.style.display = "inline-flex";
    el.style.alignItems = "center";
    el.style.gap = "8px";
    el.style.boxSizing = "border-box";
    el.style.padding = "7px 10px";
    el.style.borderRadius = "6px";
    el.style.border = warning ? "1px solid #d28a1d" : "1px solid #DA291C";
    el.style.background = warning ? "#fff7e6" : "#fff1f0";
    el.style.color = warning ? "#7a4300" : "#9f1d14";
    el.style.fontWeight = "700";
    el.style.fontSize = "13px";
    el.style.lineHeight = "1.25";
    el.style.verticalAlign = "middle";
    el.setAttribute("role", warning ? "status" : "alert");

    const icon = document.createElement("span");
    icon.textContent = "!";
    icon.setAttribute("aria-hidden", "true");
    icon.style.flex = "0 0 auto";
    icon.style.width = "18px";
    icon.style.height = "18px";
    icon.style.borderRadius = "999px";
    icon.style.border = warning ? "2px solid #d28a1d" : "2px solid #DA291C";
    icon.style.color = warning ? "#b46500" : "#DA291C";
    icon.style.display = "inline-flex";
    icon.style.alignItems = "center";
    icon.style.justifyContent = "center";
    icon.style.fontSize = "13px";
    icon.style.fontWeight = "900";
    icon.style.lineHeight = "1";

    const text = document.createElement("span");
    text.textContent = message;
    text.style.minWidth = "0";

    el.appendChild(icon);
    el.appendChild(text);

    if (warning) {
      playRecycleInlineAlertShake(el);
    } else {
      playRecycleSerialErrorShake(el);
    }
  }

  function clearRecycleInlineAlert(el) {
    if (!el) return;
    stopRecycleInlineAlertAnimation(el);
    el.textContent = "";
    el.style.display = "none";
    el.removeAttribute("role");
    delete el.dataset.wifiOssRecycleSerialAlertKind;
    delete el.dataset.wifiOssRecycleDuplicateSerial;
  }

  function isRecycleReducedMotionPreferred() {
    try { return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; } catch (e) {}
    return false;
  }

  function getRecycleSerialHelpItems(categoryId) {
    const items = RECYCLE_SERIAL_HELP_BY_CATEGORY[String(categoryId || "").trim()];
    return Array.isArray(items) ? items : [];
  }

  function getSelectedRecycleDeviceHelpItems(categoryId) {
    const category = String(categoryId || "").trim();
    if (!category) return [];
    const selectedIds = readSelectedRecycleDeviceIdsStorage();
    if (!selectedIds.length) return [];
    return selectedIds
      .map(id => getRecycleDeviceById(id))
      .map(device => getRecycleDeviceVisualView(device))
      .filter(device => device && device.categoryId === category && String(device.helpImagePath || "").trim())
      .map(device => ({
        title: String(device.displayName || device.materialId || device.deviceId || "").trim(),
        imagePath: String(device.helpImagePath || "").trim(),
        alt: `Правилен barcode за ${String(device.displayName || device.deviceId || "").trim()}`
      }));
  }

  function getRecycleSerialHelpItemsForContext(categoryId) {
    const deviceItems = getSelectedRecycleDeviceHelpItems(categoryId);
    return deviceItems.length ? deviceItems : getRecycleSerialHelpItems(categoryId);
  }

  function resolveRecycleSerialHelpImageUrl(imagePath) {
    return resolveRecycleImageUrl(imagePath);
  }

  function setRecycleSerialHelpButtonVisible(ui, visible) {
    if (!ui?.button) return;
    const btn = ui.button;
    if (visible) {
      const wasHidden = btn.style.display === "none" || btn.getAttribute("aria-hidden") === "true";
      btn.style.display = "inline-flex";
      btn.setAttribute("aria-hidden", "false");
      if (isRecycleReducedMotionPreferred()) {
        btn.style.opacity = "1";
        btn.style.transform = "none";
      } else if (wasHidden) {
        btn.style.opacity = "0";
        btn.style.transform = "translateX(14px)";
        requestAnimationFrame(() => {
          if (btn.style.display !== "none") {
            btn.style.opacity = "1";
            btn.style.transform = "translateX(0)";
          }
        });
      } else {
        btn.style.opacity = "1";
        btn.style.transform = "translateX(0)";
      }
      return;
    }
    btn.style.opacity = "0";
    btn.style.transform = isRecycleReducedMotionPreferred() ? "none" : "translateX(14px)";
    btn.style.display = "none";
    btn.setAttribute("aria-hidden", "true");
  }

  function renderRecycleSerialHelpContent(ui, categoryId) {
    const items = getRecycleSerialHelpItemsForContext(categoryId);
    if (!ui?.content || !items.length) return false;
    const contextKey = JSON.stringify(items.map(item => [item.title, item.imagePath]));
    if (ui.categoryId === categoryId && ui.helpContextKey === contextKey && ui.content.childElementCount) return true;

    ui.categoryId = categoryId;
    ui.helpContextKey = contextKey;
    ui.panel.dataset.wifiOssRecycleHelpCategory = categoryId;
    ui.content.textContent = "";

    items.forEach(item => {
      const card = document.createElement("section");
      card.style.boxSizing = "border-box";
      card.style.padding = "9px";
      card.style.border = "1px solid #d8dee6";
      card.style.borderRadius = "8px";
      card.style.background = "#ffffff";
      card.style.boxShadow = "0 6px 18px rgba(15, 23, 42, 0.10)";

      const title = document.createElement("div");
      title.textContent = item.title;
      title.style.marginBottom = "8px";
      title.style.color = "#2f343a";
      title.style.fontSize = "13px";
      title.style.fontWeight = "800";
      title.style.lineHeight = "1.25";

      const media = document.createElement("div");
      media.style.boxSizing = "border-box";
      media.style.width = "100%";
      media.style.aspectRatio = "4 / 3";
      media.style.overflow = "hidden";
      media.style.border = "1px solid #e5e7eb";
      media.style.borderRadius = "7px";
      media.style.background = "#f8fafc";

      const img = document.createElement("img");
      img.src = resolveRecycleSerialHelpImageUrl(item.imagePath);
      img.alt = item.alt || item.title || "";
      img.loading = "lazy";
      img.style.display = "block";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.style.background = "#fff";

      card.appendChild(title);
      media.appendChild(img);
      card.appendChild(media);
      ui.content.appendChild(card);
    });

    return true;
  }

  function clearRecycleSerialHelpPreviewTimers() {
    if (recycleSerialHelpPreviewTimer) {
      clearTimeout(recycleSerialHelpPreviewTimer);
      recycleSerialHelpPreviewTimer = 0;
    }
    if (recycleSerialHelpPreviewCloseTimer) {
      clearTimeout(recycleSerialHelpPreviewCloseTimer);
      recycleSerialHelpPreviewCloseTimer = 0;
    }
  }

  function renderRecycleSerialHelpPreviewContent(ui, categoryId) {
    const items = getRecycleSerialHelpItemsForContext(categoryId);
    if (!ui?.content || !items.length) return false;
    const contextKey = JSON.stringify(items.map(item => [item.title, item.imagePath]));
    if (ui.categoryId === categoryId && ui.helpContextKey === contextKey && ui.content.childElementCount) return true;

    ui.categoryId = categoryId;
    ui.helpContextKey = contextKey;
    ui.preview.dataset.wifiOssRecycleHelpPreviewCategory = categoryId;
    ui.content.textContent = "";

    items.forEach(item => {
      const card = document.createElement("section");
      card.setAttribute("aria-label", item.alt || item.title || "Recycle barcode help");
      card.style.boxSizing = "border-box";
      card.style.width = "100%";
      card.style.aspectRatio = "4 / 3";
      card.style.padding = "0";
      card.style.margin = "0";
      card.style.border = "1px solid #d7d7d7";
      card.style.borderRadius = "8px";
      card.style.overflow = "hidden";
      card.style.background = "#f4f4f4";
      card.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.16)";

      const img = document.createElement("img");
      img.src = resolveRecycleSerialHelpImageUrl(item.imagePath);
      img.alt = item.alt || item.title || "";
      img.loading = "lazy";
      img.style.display = "block";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.padding = "0";
      img.style.margin = "0";
      img.style.objectFit = "cover";
      img.style.background = "#f4f4f4";

      card.appendChild(img);
      ui.content.appendChild(card);
    });

    return true;
  }

  function ensureRecycleSerialHelpPreviewUi() {
    if (recycleSerialHelpPreviewUi && document.body?.contains(recycleSerialHelpPreviewUi.preview)) {
      return recycleSerialHelpPreviewUi;
    }
    const parent = document.body || document.documentElement;
    if (!parent) return null;

    const preview = document.createElement("aside");
    preview.id = `${RECYCLE_SERIAL_HELP_PANEL_ID}-preview`;
    preview.setAttribute("aria-label", "РџРѕРґСЃРєР°Р·РєР° Р·Р° РїСЂР°РІРёР»РЅРёСЏ barcode");
    preview.setAttribute("aria-hidden", "true");
    preview.style.position = "fixed";
    preview.style.top = "88px";
    preview.style.right = "18px";
    preview.style.bottom = "24px";
    preview.style.zIndex = "2147483002";
    preview.style.width = "min(330px, calc(100vw - 36px))";
    preview.style.maxHeight = "calc(100vh - 112px)";
    preview.style.boxSizing = "border-box";
    preview.style.display = "none";
    preview.style.overflowX = "hidden";
    preview.style.overflowY = "auto";
    preview.style.overscrollBehavior = "contain";
    preview.style.scrollbarWidth = "none";
    preview.style.msOverflowStyle = "none";
    preview.style.opacity = "0";
    preview.style.transform = "translateX(115%)";
    preview.style.transition = isRecycleReducedMotionPreferred()
      ? "none"
      : "opacity 200ms ease, transform 200ms cubic-bezier(0.2, 0, 0.2, 1)";
    preview.style.pointerEvents = "auto";

    const content = document.createElement("div");
    content.style.display = "grid";
    content.style.gap = "10px";
    content.style.width = "100%";
    content.style.boxSizing = "border-box";
    content.style.padding = "clamp(72px, 22vh, 190px) 0 24px";
    content.style.margin = "0";

    preview.appendChild(content);
    parent.appendChild(preview);

    if (!document.getElementById(`${preview.id}-style`)) {
      const style = document.createElement("style");
      style.id = `${preview.id}-style`;
      style.textContent = `#${preview.id}::-webkit-scrollbar{display:none;}`;
      parent.appendChild(style);
    }

    recycleSerialHelpPreviewUi = { preview, content, categoryId: "", helpContextKey: "" };

    document.addEventListener("pointerdown", (e) => {
      const ui = recycleSerialHelpPreviewUi;
      if (!ui?.preview || ui.preview.dataset.wifiOssRecycleHelpPreviewOpen !== "1") return;
      if (ui.preview.contains(e.target)) return;
      hideRecycleSerialHelpPreview();
    }, true);

    return recycleSerialHelpPreviewUi;
  }

  function ensureRecycleSerialHelpUi() {
    if (recycleSerialHelpUi && document.body?.contains(recycleSerialHelpUi.panel)) {
      return recycleSerialHelpUi;
    }
    const parent = document.body || document.documentElement;
    if (!parent) return null;

    const button = document.createElement("button");
    button.id = RECYCLE_SERIAL_HELP_BUTTON_ID;
    button.type = "button";
    button.title = "Покажи помощ за правилния barcode";
    button.setAttribute("aria-label", "Покажи помощ за правилния barcode");
    button.setAttribute("aria-hidden", "true");
    button.style.position = "fixed";
    button.style.top = "154px";
    button.style.right = "18px";
    button.style.zIndex = "2147483000";
    button.style.width = "48px";
    button.style.height = "48px";
    button.style.boxSizing = "border-box";
    button.style.padding = "0";
    button.style.border = "1px solid #cda100";
    button.style.borderRadius = "6px";
    button.style.background = "#f6d33a";
    button.style.boxShadow = "0 3px 10px rgba(93, 67, 0, 0.22)";
    button.style.cursor = "pointer";
    button.style.display = "none";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.opacity = "0";
    button.style.transform = "translateX(14px)";
    button.style.transition = isRecycleReducedMotionPreferred()
      ? "none"
      : "opacity 180ms ease, transform 180ms cubic-bezier(0.2, 0, 0.2, 1), box-shadow 160ms ease";

    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.style.position = "relative";
    icon.style.width = "28px";
    icon.style.height = "22px";
    icon.style.borderRadius = "3px";
    icon.style.border = "2px solid #4b3a00";
    icon.style.background = "linear-gradient(90deg, #4b3a00 0 7%, transparent 7% 13%, #4b3a00 13% 20%, transparent 20% 28%, #4b3a00 28% 32%, transparent 32% 40%, #4b3a00 40% 50%, transparent 50% 58%, #4b3a00 58% 64%, transparent 64% 74%, #4b3a00 74% 82%, transparent 82% 90%, #4b3a00 90% 100%)";

    const question = document.createElement("span");
    question.textContent = "?";
    question.setAttribute("aria-hidden", "true");
    question.style.position = "absolute";
    question.style.right = "-8px";
    question.style.top = "-10px";
    question.style.width = "18px";
    question.style.height = "18px";
    question.style.borderRadius = "999px";
    question.style.background = "#fff7bf";
    question.style.border = "1px solid #cda100";
    question.style.color = "#4b3a00";
    question.style.display = "inline-flex";
    question.style.alignItems = "center";
    question.style.justifyContent = "center";
    question.style.fontSize = "13px";
    question.style.fontWeight = "900";
    question.style.lineHeight = "1";
    icon.appendChild(question);
    button.appendChild(icon);

    button.addEventListener("mouseenter", () => {
      button.style.boxShadow = "0 5px 14px rgba(93, 67, 0, 0.30)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.boxShadow = "0 3px 10px rgba(93, 67, 0, 0.22)";
    });

    const panel = document.createElement("aside");
    panel.id = RECYCLE_SERIAL_HELP_PANEL_ID;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Помощ за правилния barcode");
    panel.setAttribute("aria-hidden", "true");
    panel.style.position = "fixed";
    panel.style.top = "176px";
    panel.style.right = "16px";
    panel.style.bottom = "70px";
    panel.style.zIndex = "2147483001";
    panel.style.width = "min(360px, calc(100vw - 32px))";
    panel.style.boxSizing = "border-box";
    panel.style.display = "none";
    panel.style.flexDirection = "column";
    panel.style.padding = "12px";
    panel.style.border = "1px solid #d0d5dd";
    panel.style.borderRadius = "8px";
    panel.style.background = "#f6f7f9";
    panel.style.boxShadow = "0 12px 30px rgba(15, 23, 42, 0.18)";
    panel.style.opacity = "0";
    panel.style.transform = "translateX(110%)";
    panel.style.transition = isRecycleReducedMotionPreferred()
      ? "none"
      : "opacity 220ms ease, transform 220ms cubic-bezier(0.2, 0, 0.2, 1)";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.gap = "8px";
    header.style.flex = "0 0 auto";
    header.style.marginBottom = "10px";
    header.style.paddingBottom = "10px";
    header.style.borderBottom = "1px solid #e5e7eb";

    const heading = document.createElement("div");
    heading.textContent = "Кой barcode да сканирам?";
    heading.style.color = "#2f343a";
    heading.style.fontSize = "15px";
    heading.style.fontWeight = "900";
    heading.style.lineHeight = "1.2";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "x";
    closeBtn.setAttribute("aria-label", "Затвори помощта");
    closeBtn.style.flex = "0 0 auto";
    closeBtn.style.width = "28px";
    closeBtn.style.height = "28px";
    closeBtn.style.padding = "0";
    closeBtn.style.border = "1px solid #cfd6df";
    closeBtn.style.borderRadius = "6px";
    closeBtn.style.background = "#ffffff";
    closeBtn.style.color = "#475467";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.fontSize = "16px";
    closeBtn.style.fontWeight = "900";
    closeBtn.style.lineHeight = "1";

    const content = document.createElement("div");
    content.style.display = "grid";
    content.style.gap = "12px";
    content.style.flex = "1 1 auto";
    content.style.minHeight = "0";
    content.style.overflowY = "auto";
    content.style.paddingRight = "4px";

    header.appendChild(heading);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    panel.appendChild(content);
    parent.appendChild(button);
    parent.appendChild(panel);

    recycleSerialHelpUi = { button, panel, content, closeBtn, categoryId: "", helpContextKey: "" };

    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setRecycleSerialHelpPanelOpen(true);
    });
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setRecycleSerialHelpPanelOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.dataset.wifiOssRecycleHelpOpen === "1") {
        setRecycleSerialHelpPanelOpen(false);
      }
    }, true);

    return recycleSerialHelpUi;
  }

  function setRecycleSerialHelpPanelOpen(open, options = {}) {
    const ui = ensureRecycleSerialHelpUi();
    if (!ui) return;
    const keepButton = options.keepButton !== false;
    if (recycleSerialHelpCloseTimer) {
      clearTimeout(recycleSerialHelpCloseTimer);
      recycleSerialHelpCloseTimer = 0;
    }

    if (open) {
      if (!getRecycleSerialHelpItemsForContext(ui.categoryId).length) return;
      hideRecycleSerialHelpPreview();
      ui.panel.dataset.wifiOssRecycleHelpOpen = "1";
      ui.panel.style.display = "flex";
      ui.panel.setAttribute("aria-hidden", "false");
      setRecycleSerialHelpButtonVisible(ui, false);
      if (isRecycleReducedMotionPreferred()) {
        ui.panel.style.opacity = "1";
        ui.panel.style.transform = "none";
      } else {
        ui.panel.style.opacity = "0";
        ui.panel.style.transform = "translateX(110%)";
        requestAnimationFrame(() => {
          if (ui.panel.dataset.wifiOssRecycleHelpOpen === "1") {
            ui.panel.style.opacity = "1";
            ui.panel.style.transform = "translateX(0)";
          }
        });
      }
      return;
    }

    ui.panel.dataset.wifiOssRecycleHelpOpen = "";
    ui.panel.setAttribute("aria-hidden", "true");
    if (keepButton && getRecycleSerialHelpItemsForContext(ui.categoryId).length) {
      setRecycleSerialHelpButtonVisible(ui, true);
    } else {
      setRecycleSerialHelpButtonVisible(ui, false);
    }

    if (isRecycleReducedMotionPreferred()) {
      ui.panel.style.display = "none";
      ui.panel.style.opacity = "0";
      ui.panel.style.transform = "translateX(110%)";
      return;
    }

    ui.panel.style.opacity = "0";
    ui.panel.style.transform = "translateX(110%)";
    recycleSerialHelpCloseTimer = setTimeout(() => {
      if (ui.panel.dataset.wifiOssRecycleHelpOpen !== "1") {
        ui.panel.style.display = "none";
      }
    }, 230);
  }

  function showRecycleSerialHelp(categoryId) {
    const items = getRecycleSerialHelpItemsForContext(categoryId);
    if (!items.length) {
      hideRecycleSerialHelp();
      return false;
    }
    const ui = ensureRecycleSerialHelpUi();
    if (!ui) return false;
    if (!renderRecycleSerialHelpContent(ui, categoryId)) return false;

    if (ui.panel.dataset.wifiOssRecycleHelpOpen === "1") {
      setRecycleSerialHelpPanelOpen(true);
    } else {
      setRecycleSerialHelpButtonVisible(ui, true);
    }
    return true;
  }

  function showRecycleSerialHelpPreview(categoryId) {
    const items = getRecycleSerialHelpItemsForContext(categoryId);
    if (!items.length) {
      hideRecycleSerialHelp();
      return false;
    }

    const manualUi = recycleSerialHelpUi;
    if (manualUi?.panel?.dataset.wifiOssRecycleHelpOpen === "1") {
      return showRecycleSerialHelp(categoryId);
    }

    showRecycleSerialHelp(categoryId);
    const ui = ensureRecycleSerialHelpPreviewUi();
    if (!ui) return false;
    if (!renderRecycleSerialHelpPreviewContent(ui, categoryId)) return false;

    clearRecycleSerialHelpPreviewTimers();
    ui.preview.dataset.wifiOssRecycleHelpPreviewOpen = "1";
    ui.preview.style.display = "block";
    ui.preview.setAttribute("aria-hidden", "false");

    if (isRecycleReducedMotionPreferred()) {
      ui.preview.style.opacity = "1";
      ui.preview.style.transform = "none";
    } else {
      ui.preview.style.opacity = "0";
      ui.preview.style.transform = "translateX(115%)";
      requestAnimationFrame(() => {
        if (ui.preview.dataset.wifiOssRecycleHelpPreviewOpen === "1") {
          ui.preview.style.opacity = "1";
          ui.preview.style.transform = "translateX(0)";
        }
      });
    }

    recycleSerialHelpPreviewTimer = setTimeout(() => {
      hideRecycleSerialHelpPreview();
    }, 5000);
    return true;
  }

  function hideRecycleSerialHelpPreview() {
    const ui = recycleSerialHelpPreviewUi;
    clearRecycleSerialHelpPreviewTimers();
    if (!ui?.preview) return;

    ui.preview.dataset.wifiOssRecycleHelpPreviewOpen = "";
    ui.preview.setAttribute("aria-hidden", "true");

    if (isRecycleReducedMotionPreferred()) {
      ui.preview.style.display = "none";
      ui.preview.style.opacity = "0";
      ui.preview.style.transform = "translateX(115%)";
      return;
    }

    ui.preview.style.opacity = "0";
    ui.preview.style.transform = "translateX(115%)";
    recycleSerialHelpPreviewCloseTimer = setTimeout(() => {
      if (ui.preview.dataset.wifiOssRecycleHelpPreviewOpen !== "1") {
        ui.preview.style.display = "none";
      }
    }, 210);
  }

  function refreshRecycleSerialHelpAvailability(categoryId) {
    const category = String(categoryId || "").trim();
    if (!category || !getRecycleSerialHelpItemsForContext(category).length) {
      hideRecycleSerialHelp();
      return false;
    }
    const ui = ensureRecycleSerialHelpUi();
    if (!ui) return false;
    if (!renderRecycleSerialHelpContent(ui, category)) return false;
    if (ui.panel.dataset.wifiOssRecycleHelpOpen === "1") {
      setRecycleSerialHelpPanelOpen(true);
    } else {
      setRecycleSerialHelpButtonVisible(ui, true);
    }
    return true;
  }

  function hideRecycleSerialHelp() {
    hideRecycleSerialHelpPreview();
    const ui = recycleSerialHelpUi;
    if (!ui) return;
    setRecycleSerialHelpPanelOpen(false, { keepButton: false });
  }

  function hasRecycleSerialCyrillic(value) {
    return /[\u0400-\u04FF]/.test(String(value || ""));
  }

  function getRecycleSerialCyrillicValidation(serialRaw) {
    if (!hasRecycleSerialCyrillic(serialRaw)) return { ok: true, msg: "" };
    return {
      ok: false,
      msg: RECYCLE_SERIAL_CYRILLIC_WARNING,
      variant: "warning",
      kind: "cyrillic"
    };
  }

  function getRecycleSerialCodeNormalizationChar(e) {
    if (!e || !e.isTrusted) return "";
    if (e.ctrlKey || e.altKey || e.metaKey) return "";

    const key = String(e.key || "");
    if ([...key].length !== 1 || !hasRecycleSerialCyrillic(key)) return "";

    const code = String(e.code || "");
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (code === "Semicolon" && e.shiftKey) return ":";
    return "";
  }

  function setRecycleSerialInputValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (typeof setter === "function") setter.call(input, value);
    else input.value = value;
  }

  function dispatchRecycleSerialInputEvent(input, data) {
    try {
      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data
      }));
    } catch (e) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function normalizeRecycleSerialKeydown(input, e) {
    if (!input || !e || e.target !== input || e.defaultPrevented) return false;
    if (input.disabled || input.readOnly) return false;

    const replacement = getRecycleSerialCodeNormalizationChar(e);
    if (!replacement) return false;

    let start = null;
    let end = null;
    try {
      start = input.selectionStart;
      end = input.selectionEnd;
    } catch (e2) {}

    const value = String(input.value || "");
    if (typeof start !== "number" || typeof end !== "number") {
      start = value.length;
      end = value.length;
    }

    e.preventDefault();
    const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    setRecycleSerialInputValue(input, next);
    const caret = start + replacement.length;
    try { input.setSelectionRange(caret, caret); } catch (e2) {}
    e.__wifiOssSerialNormalized = replacement;
    dispatchRecycleSerialInputEvent(input, replacement);
    return true;
  }

  function isRecycleSerialKeyboardDebugEnabled() {
    try { return sessionStorage.getItem(RECYCLE_SERIAL_KEYBOARD_DEBUG_KEY) === "1"; } catch (e) {}
    return false;
  }

  function getRecycleSerialDebugEvents() {
    if (!Array.isArray(window.__wifiOssSerialDebugEvents)) {
      let saved = [];
      try {
        const parsed = JSON.parse(sessionStorage.getItem(RECYCLE_SERIAL_KEYBOARD_DEBUG_EVENTS_KEY) || "[]");
        if (Array.isArray(parsed)) saved = parsed;
      } catch (e) {}
      window.__wifiOssSerialDebugEvents = saved;
    }
    return window.__wifiOssSerialDebugEvents;
  }

  function persistRecycleSerialDebugEvents(events) {
    try { sessionStorage.setItem(RECYCLE_SERIAL_KEYBOARD_DEBUG_EVENTS_KEY, JSON.stringify(events)); } catch (e) {}
  }

  function getRecycleSerialSelection(input) {
    const selection = { start: null, end: null, direction: "" };
    try {
      selection.start = input.selectionStart;
      selection.end = input.selectionEnd;
      selection.direction = input.selectionDirection || "";
    } catch (e) {}
    return selection;
  }

  function getRecycleSerialDebugDecision(e, input) {
    if (!e) return "observed";
    const key = String(e.key || "");
    const code = String(e.code || "");
    const data = String(e.data || "");
    if (e.type === "keydown") {
      const normalized = e.__wifiOssSerialNormalized || (e.defaultPrevented ? getRecycleSerialCodeNormalizationChar(e) : "");
      if (normalized) return `normalized-to-${normalized}`;
      if (key === "Enter") return "enter-guard";
      if (e.ctrlKey || e.metaKey || e.altKey) return "modifier-shortcut";
      if (/^Arrow/.test(key) || ["Backspace", "Delete", "Tab", "Escape", "Home", "End"].includes(key)) return "navigation-or-edit-key";
      if (hasRecycleSerialCyrillic(key)) return code ? "observed-cyrillic-key-with-code-no-normalization" : "observed-cyrillic-key-no-normalization";
      return "observed-no-change";
    }
    if (e.type === "beforeinput") {
      if (hasRecycleSerialCyrillic(data)) return "observed-cyrillic-beforeinput-no-normalization";
      return "observed-beforeinput";
    }
    if (e.type === "input") {
      if (hasRecycleSerialCyrillic(input?.value)) return "warn-cyrillic";
      return "observed-input";
    }
    if (e.type === "paste") return "observed-paste-no-normalization";
    if (e.type === "keyup") return "observed-keyup";
    return "observed";
  }

  function pushRecycleSerialDebugEvent(input, e, valueBefore, decision) {
    if (!isRecycleSerialKeyboardDebugEnabled() || !input || !e) return;
    const now = (typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now()
      : Date.now();
    const deltaMs = recycleSerialDebugLastTs ? Math.round((now - recycleSerialDebugLastTs) * 1000) / 1000 : null;
    recycleSerialDebugLastTs = now;

    const entry = {
      type: e.type,
      key: typeof e.key === "string" ? e.key : "",
      code: typeof e.code === "string" ? e.code : "",
      inputType: typeof e.inputType === "string" ? e.inputType : "",
      data: typeof e.data === "string" ? e.data : "",
      shiftKey: !!e.shiftKey,
      ctrlKey: !!e.ctrlKey,
      altKey: !!e.altKey,
      metaKey: !!e.metaKey,
      repeat: !!e.repeat,
      isTrusted: !!e.isTrusted,
      defaultPrevented: !!e.defaultPrevented,
      timestamp: new Date().toISOString(),
      timeMs: Math.round(now * 1000) / 1000,
      deltaMs,
      selection: getRecycleSerialSelection(input),
      valueBefore: String(valueBefore || ""),
      valueAfter: String(input.value || ""),
      decision
    };

    const events = getRecycleSerialDebugEvents();
    events.push(entry);
    if (events.length > RECYCLE_SERIAL_KEYBOARD_DEBUG_LIMIT) {
      events.splice(0, events.length - RECYCLE_SERIAL_KEYBOARD_DEBUG_LIMIT);
    }
    persistRecycleSerialDebugEvents(events);
  }

  function logRecycleSerialDebugEvent(input, e, valueBefore) {
    if (!isRecycleSerialKeyboardDebugEnabled()) return;
    const before = valueBefore === undefined ? String(input?.value || "") : String(valueBefore || "");
    setTimeout(() => {
      const decision = getRecycleSerialDebugDecision(e, input);
      pushRecycleSerialDebugEvent(input, e, before, decision);
    }, 0);
  }

  function attachRecycleSerialDebug(input) {
    if (!input) return;
    if (input.dataset.wifiOssSerialDebugAttached === "1") return;
    input.dataset.wifiOssSerialDebugAttached = "1";

    if (isRecycleSerialKeyboardDebugEnabled()) {
      window.__wifiOssSerialDebugEvents = [];
      persistRecycleSerialDebugEvents(window.__wifiOssSerialDebugEvents);
      recycleSerialDebugLastTs = 0;
      if (!recycleSerialDebugNoticeShown) {
        recycleSerialDebugNoticeShown = true;
        console.info("[recycleSerialDebug] enabled. Copy with copy(JSON.stringify(window.__wifiOssSerialDebugEvents, null, 2)) or copy(sessionStorage.getItem(\"wifi_oss_serial_keyboard_debug_events\")).");
      }
    }

    let lastValue = String(input.value || "");
    ["keydown", "keyup", "beforeinput", "paste"].forEach(type => {
      input.addEventListener(type, (e) => {
        logRecycleSerialDebugEvent(input, e, String(input.value || ""));
      }, true);
    });
    input.addEventListener("input", (e) => {
      const before = lastValue;
      logRecycleSerialDebugEvent(input, e, before);
      setTimeout(() => { lastValue = String(input.value || ""); }, 0);
    }, true);
  }

  function refreshRecycleEntryCategoryPanel(panel) {
    if (!panel) return false;
    const render = panel.__wifiOssRenderRecycleCategories;
    if (typeof render !== "function") return false;
    render();
    return true;
  }

  function refreshRecycleRemoteVisualOverlayPanels() {
    const panels = Array.from(document.querySelectorAll(`.${RECYCLE_ENTRY_PANEL_CLASS}`));
    let renderedPanels = 0;
    panels.forEach(panel => {
      if (refreshRecycleEntryCategoryPanel(panel)) renderedPanels += 1;
    });
    return renderedPanels;
  }

  function buildRecycleRemoteVisualOverlayMap(entries) {
    const overlayMap = new Map();
    const ignoredUnknownDeviceIds = [];
    (Array.isArray(entries) ? entries : []).forEach(entry => {
      const deviceId = String(entry?.deviceId || "").trim();
      if (!deviceId) return;
      if (!RECYCLE_DEVICE_ID_SET.has(deviceId)) {
        ignoredUnknownDeviceIds.push(deviceId);
        return;
      }

      const overlay = {};
      RECYCLE_REMOTE_VISUAL_OVERLAY_FIELDS.forEach(field => {
        if (typeof entry?.[field] !== "string") return;
        const value = entry[field].trim();
        if (!value) return;
        overlay[field] = value;
      });
      if (Object.keys(overlay).length) overlayMap.set(deviceId, overlay);
    });
    return { overlayMap, ignoredUnknownDeviceIds };
  }

  async function applyRecycleRemoteVisualOverlay() {
    const response = await sendRecycleRemoteConfigDebugMessage("recycleConfig.getVisualOverlay");
    const sourceRevision = String(response?.meta?.revision || "").trim();

    if (!response?.ok || response.result === "no_data" || response.result === "no_overlay" || !Array.isArray(response.overlay)) {
      recycleRemoteVisualOverlayByDeviceId = new Map();
      return {
        ok: Boolean(response?.ok),
        result: response?.result || "no_data",
        sourceRevision,
        appliedCount: 0,
        ignoredUnknownDeviceIds: [],
        renderedPanels: refreshRecycleRemoteVisualOverlayPanels()
      };
    }

    const { overlayMap, ignoredUnknownDeviceIds } = buildRecycleRemoteVisualOverlayMap(response.overlay);
    recycleRemoteVisualOverlayByDeviceId = overlayMap;
    return {
      ok: true,
      result: "applied",
      sourceRevision,
      appliedCount: overlayMap.size,
      ignoredUnknownDeviceIds,
      renderedPanels: refreshRecycleRemoteVisualOverlayPanels()
    };
  }

  function buildRecycleRemoteAddedDeviceOverlay(entries) {
    const overlayMap = new Map();
    const blocked = [];
    (Array.isArray(entries) ? entries : []).forEach(entry => {
      const normalized = normalizeRecycleRemoteAddedDeviceEntry(entry, overlayMap);
      if (normalized.ok) {
        overlayMap.set(normalized.device.deviceId, normalized.device);
      } else {
        blocked.push({
          deviceId: normalized.deviceId,
          displayName: normalized.displayName,
          reasons: normalized.reasons
        });
      }
    });
    return { overlayMap, blocked };
  }

  function setRecycleRemoteAutoApplyState(patch) {
    recycleRemoteAutoApplyState = {
      result: "not_checked",
      autoAddedCount: 0,
      autoBlockedCount: 0,
      blockReason: "",
      ...(patch || {})
    };
  }

  function setRecycleRemoteAutoMaterialApplyState(patch) {
    recycleRemoteAutoMaterialApplyState = {
      result: "not_checked",
      autoMaterialEnabledCount: 0,
      autoMaterialBlockedCount: 0,
      blockReason: "",
      ...(patch || {})
    };
  }

  function shouldDeferRecycleSelectedDevicePrune() {
    const autoResult = String(recycleRemoteAutoApplyState?.result || "").trim();
    const autoBlockReason = String(recycleRemoteAutoApplyState?.blockReason || "").trim();
    return Boolean(recycleRemoteAutoApplyInFlight)
      || autoResult === "not_checked"
      || autoBlockReason === "stale LKG";
  }

  function getRecycleRemoteAutoCapabilityBlockReason(response) {
    const compatibility = response?.contractCompatibility;
    if (!compatibility || typeof compatibility !== "object") return "contract missing";
    if (compatibility.ok === false) return "contract incompatible";
    if (compatibility.mode !== "explicit_contract") return "no auto capability";
    const supported = Array.isArray(compatibility.supportedCapabilities) ? compatibility.supportedCapabilities : [];
    if (!supported.includes(RECYCLE_REMOTE_AUTO_ADDITIONS_CAPABILITY)) return "no auto capability";
    if (response?.hasLastKnownGood === false) return "no LKG";
    if (response?.isStale === true && !isRecycleRemoteUsingStaleLastKnownGood(response)) return "stale LKG";
    return "";
  }

  function isRecycleRemoteUsingStaleLastKnownGood(response) {
    const statusResult = String(response?.status?.result || "").trim();
    return response?.normalRefreshEnabled === true
      && response?.hasLastKnownGood === true
      && response?.isStale === true
      && statusResult === "fetch_failed";
  }

  function getRecycleRemoteAutoMaterialCapabilityBlockReason(response) {
    const baseReason = getRecycleRemoteAutoCapabilityBlockReason(response);
    if (baseReason) return baseReason;
    const supported = Array.isArray(response?.contractCompatibility?.supportedCapabilities)
      ? response.contractCompatibility.supportedCapabilities
      : [];
    if (!supported.includes(RECYCLE_REMOTE_AUTO_MATERIAL_CAPABILITY)) return "no material auto capability";
    return "";
  }

  function getRecycleRemoteAutoMaterialModelsCapabilityBlockReason(response) {
    const baseReason = getRecycleRemoteAutoCapabilityBlockReason(response);
    if (baseReason) return baseReason;
    const supported = Array.isArray(response?.contractCompatibility?.supportedCapabilities)
      ? response.contractCompatibility.supportedCapabilities
      : [];
    if (!supported.includes(RECYCLE_REMOTE_AUTO_MATERIAL_MODELS_CAPABILITY)) return "no remote material models capability";
    return "";
  }

  function clearRecycleRemoteAutoMaterialOverlay(reason) {
    recycleRemoteAutoMaterialEnabledByDeviceId = new Map();
    clearRecycleRemoteAutoSessionState();
    setRecycleRemoteAutoMaterialApplyState({
      result: reason || "local_fallback",
      autoMaterialEnabledCount: 0,
      autoMaterialBlockedCount: 0,
      blockReason: reason || ""
    });
  }

  function clearRecycleRemoteAutoDeviceOverlay(reason) {
    recycleRemoteAutoDevicesByDeviceId = new Map();
    recycleRemoteAutoMaterialModelsByMaterialId = new Map();
    clearRecycleRemoteAutoMaterialOverlay(reason || "local_fallback");
    setRecycleRemoteAutoApplyState({
      result: reason || "local_fallback",
      autoAddedCount: 0,
      autoBlockedCount: 0,
      blockReason: reason || ""
    });
  }

  function applyRecycleRemoteAutomaticMaterialEnablementFromPlan(response) {
    const sourceRevision = String(response?.sourceRevision || response?.meta?.revision || "").trim();
    const blockReason = getRecycleRemoteAutoMaterialCapabilityBlockReason(response);
    if (blockReason) {
      clearRecycleRemoteAutoMaterialOverlay(blockReason);
      return {
        ok: false,
        result: "auto_material_blocked",
        sourceRevision,
        blockReason,
        autoMaterialEnabledCount: 0,
        autoMaterialBlockedCount: blockReason === "no material auto capability" ? 0 : 1
      };
    }

    const candidates = Array.isArray(response?.materialEligibleAdditions?.entries)
      ? response.materialEligibleAdditions.entries
      : [];
    const candidateIds = new Set();
    const enabledMap = new Map();
    const blocked = [];
    let blockedCount = 0;
    const pushBlocked = (sample) => {
      blockedCount += 1;
      if (blocked.length < 5) blocked.push(sample);
    };

    candidates.forEach(entry => {
      const deviceId = String(entry?.deviceId || "").trim();
      if (!deviceId || candidateIds.has(deviceId)) return;
      candidateIds.add(deviceId);
      const device = recycleRemoteAutoDevicesByDeviceId.get(deviceId);
      if (!device) {
        pushBlocked(buildRecycleRemoteMaterialPlanSample(entry, ["not auto-applied"], []));
        return;
      }

      const eligibility = classifyRecycleRemoteAddedMaterialEligibility(device, { appliedMap: recycleRemoteAutoDevicesByDeviceId });
      const planMaterialId = normalizeSwapMaterialId(entry?.materialId);
      if (eligibility.eligible && planMaterialId && eligibility.materialId === planMaterialId) {
        enabledMap.set(deviceId, eligibility.materialId);
      } else {
        const reasons = eligibility.reasons.slice();
        if (eligibility.eligible) reasons.push("material plan mismatch");
        pushBlocked(buildRecycleRemoteMaterialEligibilitySample(device, reasons, eligibility.warnings));
      }
    });

    Array.from(recycleRemoteAutoDevicesByDeviceId.values()).forEach(device => {
      if (!isRecycleRemoteAddedDevice(device)) return;
      const deviceId = String(device?.deviceId || "").trim();
      if (!deviceId || candidateIds.has(deviceId)) return;
      pushBlocked(buildRecycleRemoteMaterialEligibilitySample(device, ["not in resolved material plan"], []));
    });

    recycleRemoteAutoMaterialEnabledByDeviceId = enabledMap;
    setRecycleRemoteAutoMaterialApplyState({
      ok: true,
      result: enabledMap.size ? "auto_material_enabled" : "auto_material_none",
      sourceRevision,
      autoMaterialEnabledCount: enabledMap.size,
      autoMaterialBlockedCount: blockedCount,
      blockedSamples: blocked,
      blockReason: enabledMap.size ? "" : "no material enabled"
    });
    saveRecycleRemoteAutoSessionState();
    return {
      ok: true,
      result: recycleRemoteAutoMaterialApplyState.result,
      sourceRevision,
      autoMaterialEnabledCount: enabledMap.size,
      autoMaterialBlockedCount: blockedCount,
      blockedSamples: blocked
    };
  }

  async function applyRecycleRemoteAutomaticEligibleDevices() {
    if (recycleRemoteAutoApplyInFlight) return recycleRemoteAutoApplyInFlight;

    recycleRemoteAutoApplyInFlight = (async () => {
      const response = await getRecycleRemoteResolvedCatalogApplyPlan();
      const sourceRevision = String(response?.sourceRevision || response?.meta?.revision || "").trim();
      const blockReason = getRecycleRemoteAutoCapabilityBlockReason(response);
      if (blockReason) {
        clearRecycleRemoteAutoDeviceOverlay(blockReason);
        return {
          ok: false,
          result: "auto_blocked",
          sourceRevision,
          blockReason,
          autoAddedCount: 0,
          autoBlockedCount: blockReason === "no auto capability" ? 0 : 1
        };
      }

      const additions = Array.isArray(response?.eligibleAdditions?.entries) ? response.eligibleAdditions.entries : [];
      if (!response?.ok || !additions.length) {
        clearRecycleRemoteAutoDeviceOverlay(response?.result || "no_eligible");
        return {
          ok: Boolean(response?.ok),
          result: response?.result || "no_eligible",
          sourceRevision,
          autoAddedCount: 0,
          autoBlockedCount: Number(response?.summary?.blocked || 0)
        };
      }

      const materialModelsBlockReason = getRecycleRemoteAutoMaterialModelsCapabilityBlockReason(response);
      if (materialModelsBlockReason) {
        recycleRemoteAutoMaterialModelsByMaterialId = new Map();
      } else {
        const materialModelEntries = Array.isArray(response?.remoteMaterialModels?.entries)
          ? response.remoteMaterialModels.entries
          : [];
        const materialModelResult = buildRecycleRemoteAutoMaterialModelOverlay(materialModelEntries, additions);
        recycleRemoteAutoMaterialModelsByMaterialId = materialModelResult.overlayMap;
      }

      const { overlayMap, blocked } = buildRecycleRemoteAddedDeviceOverlay(additions);
      recycleRemoteAutoDevicesByDeviceId = overlayMap;
      const autoBlockedCount = blocked.length + Number(response?.summary?.blocked || 0);
      const autoMaterial = applyRecycleRemoteAutomaticMaterialEnablementFromPlan(response);
      setRecycleRemoteAutoApplyState({
        ok: true,
        result: overlayMap.size ? "auto_applied" : "auto_no_eligible",
        sourceRevision,
        autoAddedCount: overlayMap.size,
        autoBlockedCount,
        blockedSamples: blocked.slice(0, 5),
        blockReason: overlayMap.size ? "" : "no eligible"
      });
      return {
        ok: true,
        result: recycleRemoteAutoApplyState.result,
        sourceRevision,
        autoAddedCount: overlayMap.size,
        autoBlockedCount,
        blockedSamples: blocked.slice(0, 5),
        autoMaterial
      };
    })();

    try {
      return await recycleRemoteAutoApplyInFlight;
    } finally {
      recycleRemoteAutoApplyInFlight = null;
    }
  }

  function scheduleRecycleRemoteAutomaticEligibleDevices() {
    setTimeout(async () => {
      try {
        await sendRecycleRemoteConfigDebugMessage(RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.maybeRefresh);
        const result = await applyRecycleRemoteAutomaticEligibleDevices();
        refreshRecycleRemoteVisualOverlayPanels();
      } catch (error) {
        clearRecycleRemoteAutoDeviceOverlay(String(error?.message || error || "auto failed"));
        refreshRecycleRemoteVisualOverlayPanels();
      }
    }, 0);
  }

  async function applyRecycleRemoteEligibleDevices() {
    const response = await sendRecycleRemoteConfigDebugMessage(
      RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.resolvedApplyPlan,
      {
        localDevices: getRecycleLocalCatalogDiffPreviewDevices(),
        eligibilityContext: getRecycleRemoteDiffEligibilityContext()
      }
    );
    const sourceRevision = String(response?.sourceRevision || response?.meta?.revision || "").trim();
    const contractBlockReason = getRecycleRemoteApplyPlanContractBlockReason(response);
    if (contractBlockReason) {
      return {
        ok: false,
        result: "blocked_contract_incompatible",
        sourceRevision,
        contractCompatibility: response?.contractCompatibility || null,
        blockReason: contractBlockReason,
        addedCount: 0,
        blockedCount: 1,
        renderedPanels: refreshRecycleRemoteVisualOverlayPanels()
      };
    }

    const additions = Array.isArray(response?.eligibleAdditions?.entries) ? response.eligibleAdditions.entries : [];

    if (!response?.ok || !additions.length) {
      clearRecycleRemoteMaterialEnablement();
      recycleRemoteAddedDevicesByDeviceId = new Map();
      clearRecycleRemoteDebugSessionState();
      return {
        ok: Boolean(response?.ok),
        result: response?.result || "no_eligible",
        sourceRevision,
        addedCount: 0,
        blockedCount: Number(response?.summary?.blocked || 0),
        renderedPanels: refreshRecycleRemoteVisualOverlayPanels()
      };
    }

    const { overlayMap, blocked } = buildRecycleRemoteAddedDeviceOverlay(additions);
    clearRecycleRemoteMaterialEnablement();
    recycleRemoteAddedDevicesByDeviceId = overlayMap;
    saveRecycleRemoteDebugSessionState();
    return {
      ok: true,
      result: overlayMap.size ? "applied" : "no_eligible",
      sourceRevision,
      addedCount: overlayMap.size,
      blockedCount: blocked.length + Number(response?.summary?.blocked || 0),
      blockedSamples: blocked.slice(0, 5),
      renderedPanels: refreshRecycleRemoteVisualOverlayPanels()
    };
  }

  function clearRecycleRemoteVisualOverlay(reason) {
    recycleRemoteVisualOverlayByDeviceId = new Map();
    clearRecycleRemoteAutoDeviceOverlay(reason || "local_fallback");
    recycleRemoteAddedDevicesByDeviceId = new Map();
    clearRecycleRemoteMaterialEnablement();
    clearRecycleRemoteDebugSessionState();
    return {
      ok: true,
      result: reason || "local_fallback",
      sourceRevision: "",
      appliedCount: 0,
      addedCount: 0,
      ignoredUnknownDeviceIds: [],
      renderedPanels: refreshRecycleRemoteVisualOverlayPanels()
    };
  }

  function buildRecycleRemoteMaterialEligibilitySample(device, reasons, warnings) {
    return {
      deviceId: String(device?.deviceId || "").trim(),
      displayName: String(device?.displayName || "").trim(),
      materialId: getRecycleEffectiveMaterialId(device, "diagnostic"),
      reasons: Array.isArray(reasons) ? reasons.slice(0, 3) : [],
      warnings: Array.isArray(warnings) ? warnings.slice(0, 3) : []
    };
  }

  function buildRecycleRemoteMaterialPlanSample(entry, reasons, warnings) {
    return {
      deviceId: String(entry?.deviceId || "").trim(),
      displayName: String(entry?.displayName || "").trim(),
      materialId: normalizeSwapMaterialId(entry?.materialId),
      reasons: Array.isArray(reasons) ? reasons.slice(0, 3) : [],
      warnings: Array.isArray(warnings) ? warnings.slice(0, 3) : []
    };
  }

  function getRecycleRemoteAddedMaterialEligibilitySummary() {
    const summary = { total: 0, eligible: 0, blocked: 0 };
    const samples = { eligible: [], blocked: [] };

    Array.from(recycleRemoteAddedDevicesByDeviceId.values()).forEach(device => {
      if (!isRecycleRemoteAddedDevice(device)) return;
      summary.total += 1;
      const eligibility = classifyRecycleRemoteAddedMaterialEligibility(device);

      if (!eligibility.eligible) {
        summary.blocked += 1;
        if (samples.blocked.length < 3) samples.blocked.push(buildRecycleRemoteMaterialEligibilitySample(device, eligibility.reasons, eligibility.warnings));
      } else {
        summary.eligible += 1;
        if (samples.eligible.length < 3) samples.eligible.push(buildRecycleRemoteMaterialEligibilitySample(device, eligibility.reasons, eligibility.warnings));
      }
    });

    return { summary, samples };
  }

  function clearRecycleRemoteMaterialEnablement() {
    recycleRemoteMaterialEnabledByDeviceId = new Map();
  }

  async function applyRecycleRemoteMaterialEnablement() {
    const response = await getRecycleRemoteResolvedCatalogApplyPlan();
    const contractBlockReason = getRecycleRemoteApplyPlanContractBlockReason(response);
    if (contractBlockReason) {
      return {
        ok: false,
        result: "blocked_contract_incompatible",
        sourceRevision: String(response?.sourceRevision || response?.meta?.revision || "").trim(),
        contractCompatibility: response?.contractCompatibility || null,
        blockReason: contractBlockReason,
        materialEnabledCount: 0,
        materialBlockedCount: 1,
        materialBlockedSamples: [],
        renderedPanels: refreshRecycleRemoteVisualOverlayPanels()
      };
    }

    const candidates = Array.isArray(response?.materialEligibleAdditions?.entries) ? response.materialEligibleAdditions.entries : [];
    const candidateIds = new Set();
    const enabledMap = new Map();
    const blocked = [];
    let blockedCount = 0;
    const pushBlocked = (sample) => {
      blockedCount += 1;
      if (blocked.length < 5) blocked.push(sample);
    };

    candidates.forEach(entry => {
      const deviceId = String(entry?.deviceId || "").trim();
      if (!deviceId || candidateIds.has(deviceId)) return;
      candidateIds.add(deviceId);
      const device = recycleRemoteAddedDevicesByDeviceId.get(deviceId);
      if (!device) {
        pushBlocked(buildRecycleRemoteMaterialPlanSample(entry, ["not applied"], []));
        return;
      }

      const eligibility = classifyRecycleRemoteAddedMaterialEligibility(device);
      const planMaterialId = normalizeSwapMaterialId(entry?.materialId);
      if (eligibility.eligible && planMaterialId && eligibility.materialId === planMaterialId) {
        enabledMap.set(deviceId, eligibility.materialId);
      } else {
        const reasons = eligibility.reasons.slice();
        if (eligibility.eligible) reasons.push("material plan mismatch");
        pushBlocked(buildRecycleRemoteMaterialEligibilitySample(device, reasons, eligibility.warnings));
      }
    });

    Array.from(recycleRemoteAddedDevicesByDeviceId.values()).forEach(device => {
      if (!isRecycleRemoteAddedDevice(device)) return;
      const deviceId = String(device?.deviceId || "").trim();
      if (!deviceId || candidateIds.has(deviceId)) return;
      pushBlocked(buildRecycleRemoteMaterialEligibilitySample(device, ["not in resolved material plan"], []));
    });

    recycleRemoteMaterialEnabledByDeviceId = enabledMap;
    saveRecycleRemoteDebugSessionState();
    return {
      ok: Boolean(response?.ok),
      result: enabledMap.size ? "material_enabled" : "no_material_enabled",
      sourceRevision: String(response?.sourceRevision || response?.meta?.revision || "").trim(),
      materialEnabledCount: enabledMap.size,
      materialBlockedCount: blockedCount,
      materialBlockedSamples: blocked,
      renderedPanels: refreshRecycleRemoteVisualOverlayPanels()
    };
  }

  function formatRecycleRemoteDiffSample(sample) {
    const deviceId = String(sample?.deviceId || "").trim();
    const displayName = String(sample?.displayName || "").trim();
    const fields = Array.isArray(sample?.fields)
      ? sample.fields.map(field => String(field || "").trim()).filter(Boolean)
      : [];
    const reasons = Array.isArray(sample?.reasons)
      ? sample.reasons.map(reason => String(reason || "").trim()).filter(Boolean)
      : [];
    const warnings = Array.isArray(sample?.warnings)
      ? sample.warnings.map(warning => String(warning || "").trim()).filter(Boolean)
      : [];
    const label = [deviceId, displayName && displayName !== deviceId ? displayName : ""].filter(Boolean).join(": ");
    if (!label) return "";
    const details = fields.concat(reasons, warnings.map(warning => `warn:${warning}`));
    return details.length ? `${label} (${details.join(",")})` : label;
  }

  function appendRecycleRemoteDiffPreviewStatus(parts, response) {
    const summary = response?.summary;
    if (!summary || typeof summary !== "object") return;
    const visualChanges = Number(summary.visualChanges || 0);
    const riskyChanges = Number(summary.riskyChanges || 0);
    const unknownRemoteDevices = Number(summary.unknownRemoteDevices || 0);
    const missingLocalDevices = Number(summary.missingLocalDevices || 0);
    const unknownEligibility = summary.unknownEligibility || {};
    const eligibleUnknownDevices = Number(unknownEligibility.eligible || 0);
    const blockedUnknownDevices = Number(unknownEligibility.blocked || 0);
    parts.push(`visual ${visualChanges}`);
    parts.push(`risky ${riskyChanges}`);
    parts.push(`unknown ${unknownRemoteDevices}`);
    if (unknownRemoteDevices) {
      parts.push(`eligible ${eligibleUnknownDevices}`);
      parts.push(`blocked ${blockedUnknownDevices}`);
    }
    parts.push(`missing ${missingLocalDevices}`);

    const samples = response?.samples || {};
    const sampleParts = [
      ["visual", samples.visualChanges],
      ["risky", samples.riskyChanges],
      ["unknown", samples.unknownRemoteDevices],
      ["eligible", samples.unknownEligibleDevices],
      ["blocked", samples.unknownBlockedDevices],
      ["missing", samples.missingLocalDevices]
    ]
      .map(([label, items]) => {
        const formatted = (Array.isArray(items) ? items : [])
          .map(formatRecycleRemoteDiffSample)
          .filter(Boolean)
          .slice(0, 3);
        return formatted.length ? `${label}: ${formatted.join("; ")}` : "";
      })
      .filter(Boolean);
    if (sampleParts.length) parts.push(sampleParts.join(" | "));
  }

  function appendRecycleRemoteResolvedPlanStatus(parts, response) {
    const counts = response?.counts;
    if (!counts || typeof counts !== "object" || response?.appliedMode !== "preview_only") return;
    const visual = Number(counts.visualUpdates || 0);
    const add = Number(counts.eligibleAdditions || 0);
    const material = Number(counts.materialEligibleAdditions || 0);
    const blocked = Number(counts.blocked || 0);
    const warnings = Number(counts.warnings || 0);
    parts.push(`plan: visual ${visual} | add ${add} | material ${material} | blocked ${blocked}${warnings ? ` | warnings ${warnings}` : ""}`);

    const sampleParts = [
      ["plan visual", response?.visualUpdates?.samples],
      ["plan add", response?.eligibleAdditions?.samples],
      ["plan blocked", response?.blocked?.samples],
      ["plan warnings", response?.warnings?.samples]
    ]
      .map(([label, items]) => {
        const formatted = (Array.isArray(items) ? items : [])
          .map(formatRecycleRemoteDiffSample)
          .filter(Boolean)
          .slice(0, 3);
        return formatted.length ? `${label}: ${formatted.join("; ")}` : "";
      })
      .filter(Boolean);
    if (sampleParts.length) parts.push(sampleParts.join(" | "));
  }

  function appendRecycleRemoteContractStatus(parts, response) {
    const compatibility = response?.contractCompatibility;
    if (!compatibility || typeof compatibility !== "object") return;
    if (compatibility.mode === "no_data") return;

    if (compatibility.ok === false) {
      parts.push("contract incompatible");
    } else if (compatibility.mode === "legacy_v1") {
      parts.push("contract legacy ok");
    } else if (compatibility.contractVersion) {
      parts.push(`contract v${compatibility.contractVersion} ok`);
    } else {
      parts.push("contract ok");
    }

    const warnings = Array.isArray(compatibility.warnings) ? compatibility.warnings.length : 0;
    const errors = Array.isArray(compatibility.errors) ? compatibility.errors.length : 0;
    if (errors) parts.push(`contract errors ${errors}`);
    if (warnings && compatibility.mode !== "legacy_v1") parts.push(`contract warnings ${warnings}`);
  }

  function getRecycleRemoteApplyPlanContractBlockReason(response) {
    const compatibility = response?.contractCompatibility;
    if (!compatibility || typeof compatibility !== "object") return "";
    return compatibility.ok === false ? "contract incompatible" : "";
  }

  function formatRecycleRemoteMaterialEligibilitySample(sample) {
    const deviceId = String(sample?.deviceId || "").trim();
    const displayName = String(sample?.displayName || "").trim();
    const materialId = String(sample?.materialId || "").trim();
    const reasons = Array.isArray(sample?.reasons)
      ? sample.reasons.map(reason => String(reason || "").trim()).filter(Boolean)
      : [];
    const warnings = Array.isArray(sample?.warnings)
      ? sample.warnings.map(warning => String(warning || "").trim()).filter(Boolean)
      : [];
    const label = [deviceId, displayName && displayName !== deviceId ? displayName : ""].filter(Boolean).join(": ");
    if (!label) return "";
    const details = []
      .concat(materialId ? [`material ${materialId}`] : [])
      .concat(reasons)
      .concat(warnings.map(warning => `warn:${warning}`));
    return details.length ? `${label} (${details.join(",")})` : label;
  }

  function appendRecycleRemoteMaterialEligibilityStatus(parts) {
    const { summary, samples } = getRecycleRemoteAddedMaterialEligibilitySummary();
    if (!summary.total) return;
    parts.push(`remote material: eligible ${summary.eligible}, blocked ${summary.blocked}`);
    const sampleParts = [
      ["material eligible", samples.eligible],
      ["material blocked", samples.blocked]
    ]
      .map(([label, items]) => {
        const formatted = (Array.isArray(items) ? items : [])
          .map(formatRecycleRemoteMaterialEligibilitySample)
          .filter(Boolean)
          .slice(0, 3);
        return formatted.length ? `${label}: ${formatted.join("; ")}` : "";
      })
      .filter(Boolean);
    if (sampleParts.length) parts.push(sampleParts.join(" | "));
  }

  function appendRecycleRemoteAutoApplyStatus(parts, response) {
    const autoState = response?.autoRemote && typeof response.autoRemote === "object"
      ? response.autoRemote
      : recycleRemoteAutoApplyState;
    if (!autoState || autoState.result === "not_checked") return;

    const result = String(autoState.result || "").trim();
    if (result === "auto_applied") {
      parts.push(`auto remote applied ${Number(autoState.autoAddedCount || 0)}`);
    } else if (result === "auto_blocked") {
      parts.push(`auto remote blocked${autoState.blockReason ? `: ${String(autoState.blockReason).trim()}` : ""}`);
    } else if (result === "no auto capability" || autoState.blockReason === "no auto capability") {
      parts.push("auto remote disabled: no capability");
    } else if (result) {
      parts.push(`auto remote ${result}`);
    }

    if (Number(autoState.autoBlockedCount || 0)) {
      parts.push(`auto blocked ${Number(autoState.autoBlockedCount || 0)}`);
    }

    const materialState = response?.autoMaterial && typeof response.autoMaterial === "object"
      ? response.autoMaterial
      : autoState.autoMaterial || recycleRemoteAutoMaterialApplyState;
    if (!materialState || materialState.result === "not_checked") return;
    if (materialState.result === "auto_material_enabled") {
      parts.push(`auto material enabled ${Number(materialState.autoMaterialEnabledCount || 0)}`);
    } else if (materialState.result === "auto_material_blocked") {
      parts.push(`auto material blocked${materialState.blockReason ? `: ${String(materialState.blockReason).trim()}` : ""}`);
    } else if (materialState.blockReason === "no material auto capability") {
      parts.push("auto material disabled: no capability");
    } else if (materialState.result) {
      parts.push(`auto material ${String(materialState.result).trim()}`);
    }
    if (Number(materialState.autoMaterialBlockedCount || 0)) {
      parts.push(`auto material blocked ${Number(materialState.autoMaterialBlockedCount || 0)}`);
    }
  }

  function formatRecycleRemoteDebugStatus(action, response) {
    const result = String(response?.result || (response?.ok ? "ok" : "error")).trim();
    const meta = response?.meta || {};
    const status = response?.status || {};
    const revision = String(response?.sourceRevision || meta.revision || "").trim();
    const lastSuccessAt = String(status.lastSuccessAt || meta.fetchedAt || "").trim();
    const lastError = String(status.lastError || response?.error || "").trim();
    const parts = [action, result].filter(Boolean);
    const sourceLabel = String(response?.activeSourceLabel || response?.activeSourceId || "").trim();
    const usingStaleLkg = isRecycleRemoteUsingStaleLastKnownGood(response);
    if (sourceLabel) parts.push(`source ${sourceLabel}`);
    if (typeof response?.autoRefreshEnabled === "boolean") parts.push(`auto ${response.autoRefreshEnabled ? "ON" : "OFF"}`);
    if (response?.normalRefreshEnabled === true) {
      const ttlHours = Math.max(1, Math.round(Number(response?.ttlMs || 0) / (60 * 60 * 1000)));
      parts.push(`normal refresh ${ttlHours}h`);
    }
    if (typeof response?.isStale === "boolean") parts.push(response.isStale ? (usingStaleLkg ? "stale using LKG" : "stale") : "fresh");
    if (revision) parts.push(`rev ${revision}`);
    appendRecycleRemoteContractStatus(parts, response);
    if (typeof response?.appliedCount === "number") parts.push(`applied ${response.appliedCount}`);
    if (typeof response?.addedCount === "number") parts.push(`added ${response.addedCount}`);
    if (typeof response?.blockedCount === "number") parts.push(`blocked ${response.blockedCount}`);
    if (typeof response?.materialEnabledCount === "number") parts.push(`material enabled ${response.materialEnabledCount}`);
    if (typeof response?.materialBlockedCount === "number") parts.push(`material blocked ${response.materialBlockedCount}`);
    if (typeof response?.renderedPanels === "number") parts.push(`rendered ${response.renderedPanels}`);
    if (response?.blockReason) parts.push(`blocked: ${String(response.blockReason).trim()}`);
    appendRecycleRemoteAutoApplyStatus(parts, response);
    appendRecycleRemoteResolvedPlanStatus(parts, response);
    appendRecycleRemoteDiffPreviewStatus(parts, response);
    if (response?.hasLastKnownGood === true) parts.push("LKG yes");
    if (response?.hasLastKnownGood === false) parts.push("LKG no");
    if (lastSuccessAt) parts.push(`success ${lastSuccessAt}`);
    if (lastError) parts.push(`error ${lastError}`);
    if (Array.isArray(response?.errors) && response.errors.length) parts.push(`errors ${response.errors.length}`);
    if (Array.isArray(response?.ignoredUnknownDeviceIds) && response.ignoredUnknownDeviceIds.length) {
      parts.push(`ignored unknown ${response.ignoredUnknownDeviceIds.length}`);
    }
    if (Array.isArray(response?.materialBlockedSamples) && response.materialBlockedSamples.length) {
      const blockedSamples = response.materialBlockedSamples
        .map(formatRecycleRemoteMaterialEligibilitySample)
        .filter(Boolean)
        .slice(0, 3);
      if (blockedSamples.length) parts.push(`material blocked samples: ${blockedSamples.join("; ")}`);
    }
    appendRecycleRemoteMaterialEligibilityStatus(parts);
    return parts.join(" | ");
  }

  function ensureRecycleRemoteConfigDebugTray(panel) {
    if (!panel) return null;
    const existing = panel.querySelector("[data-wifi-oss-recycle-remote-debug-tray]");
    if (existing) return existing;

    const wrap = document.createElement("div");
    wrap.dataset.wifiOssRecycleRemoteDebugTray = "1";
    wrap.style.margin = "10px 0 0";
    wrap.style.display = "flex";
    wrap.style.justifyContent = "flex-end";
    wrap.style.alignItems = "flex-start";

    const details = document.createElement("details");
    details.style.maxWidth = "680px";
    details.style.width = "min(680px, 100%)";
    details.style.border = "1px solid #dedede";
    details.style.borderRadius = "6px";
    details.style.background = "#fafafa";
    details.style.color = "#555";
    details.style.fontSize = "11px";
    details.style.lineHeight = "1.35";
    details.style.boxSizing = "border-box";
    details.style.padding = "5px 7px";
    details.style.opacity = "0.82";

    let autoRefreshEnabled = false;
    let sourceInput = null;

    const summary = document.createElement("summary");
    summary.style.cursor = "pointer";
    summary.style.userSelect = "none";
    summary.style.display = "flex";
    summary.style.alignItems = "center";
    summary.style.justifyContent = "space-between";
    summary.style.gap = "10px";

    const labelWrap = document.createElement("span");
    labelWrap.style.display = "inline-flex";
    labelWrap.style.alignItems = "center";
    labelWrap.style.gap = "6px";
    labelWrap.style.minWidth = "0";

    const label = document.createElement("span");
    label.textContent = "Remote config";
    label.style.fontWeight = "700";

    const hint = document.createElement("span");
    hint.textContent = "debug/manual";
    hint.style.padding = "1px 5px";
    hint.style.border = "1px solid #e2e2e2";
    hint.style.borderRadius = "999px";
    hint.style.background = "#fff";
    hint.style.color = "#777";
    hint.style.fontSize = "10px";
    hint.style.fontWeight = "600";

    const compactStatus = document.createElement("span");
    compactStatus.dataset.wifiOssRecycleRemoteCompactStatus = "1";
    compactStatus.textContent = "not checked";
    compactStatus.style.fontWeight = "500";
    compactStatus.style.color = "#777";
    compactStatus.style.textAlign = "right";
    compactStatus.style.overflow = "hidden";
    compactStatus.style.textOverflow = "ellipsis";
    compactStatus.style.whiteSpace = "nowrap";

    labelWrap.appendChild(label);
    labelWrap.appendChild(hint);
    summary.appendChild(labelWrap);
    summary.appendChild(compactStatus);
    details.appendChild(summary);

    const controls = document.createElement("div");
    controls.style.marginTop = "7px";
    controls.style.display = "grid";
    controls.style.gridTemplateColumns = "repeat(auto-fit, minmax(150px, 1fr))";
    controls.style.gap = "7px";

    const summaryGrid = document.createElement("div");
    summaryGrid.dataset.wifiOssRecycleRemoteSummary = "1";
    summaryGrid.style.marginTop = "7px";
    summaryGrid.style.display = "flex";
    summaryGrid.style.flexWrap = "wrap";
    summaryGrid.style.gap = "5px";
    summaryGrid.style.alignItems = "center";

    const resultText = document.createElement("div");
    resultText.dataset.wifiOssRecycleRemoteResult = "1";
    resultText.textContent = "Manual only. No startup auto-apply.";
    resultText.style.marginTop = "6px";
    resultText.style.padding = "5px 6px";
    resultText.style.borderRadius = "4px";
    resultText.style.background = "#fff";
    resultText.style.border = "1px solid #ececec";
    resultText.style.color = "#666";
    resultText.style.overflowWrap = "anywhere";

    const buttons = [];
    let autoRefreshBtn = null;
    const createGroup = (title) => {
      const group = document.createElement("div");
      group.style.display = "flex";
      group.style.flexDirection = "column";
      group.style.gap = "4px";
      group.style.minWidth = "0";
      group.style.padding = "5px";
      group.style.border = "1px solid #ececec";
      group.style.borderRadius = "5px";
      group.style.background = "#fff";

      const groupTitle = document.createElement("div");
      groupTitle.textContent = title;
      groupTitle.style.fontSize = "10px";
      groupTitle.style.fontWeight = "700";
      groupTitle.style.color = "#777";
      groupTitle.style.textTransform = "uppercase";
      groupTitle.style.letterSpacing = "0";

      const groupButtons = document.createElement("div");
      groupButtons.style.display = "flex";
      groupButtons.style.flexWrap = "wrap";
      groupButtons.style.gap = "4px";

      group.appendChild(groupTitle);
      group.appendChild(groupButtons);
      controls.appendChild(group);
      return groupButtons;
    };
    const addSummaryChip = (text, tone) => {
      const chip = document.createElement("span");
      chip.textContent = String(text || "").trim();
      chip.style.display = "inline-flex";
      chip.style.alignItems = "center";
      chip.style.maxWidth = "100%";
      chip.style.padding = "2px 6px";
      chip.style.border = "1px solid #e1e1e1";
      chip.style.borderRadius = "999px";
      chip.style.background = "#fff";
      chip.style.color = "#666";
      chip.style.fontSize = "10px";
      chip.style.fontWeight = "600";
      chip.style.lineHeight = "1.35";
      chip.style.overflow = "hidden";
      chip.style.textOverflow = "ellipsis";
      chip.style.whiteSpace = "nowrap";
      if (tone === "ok") {
        chip.style.borderColor = "#b9d8bf";
        chip.style.background = "#f3fbf4";
        chip.style.color = "#2f6b38";
      } else if (tone === "warn") {
        chip.style.borderColor = "#e0ad55";
        chip.style.background = "#fff8ea";
        chip.style.color = "#8a4b00";
      } else if (tone === "info") {
        chip.style.borderColor = "#c9d8ef";
        chip.style.background = "#f4f8ff";
        chip.style.color = "#335f99";
      }
      summaryGrid.appendChild(chip);
    };
    const renderSummary = (response, isError, labelText) => {
      summaryGrid.textContent = "";
      if (!response || typeof response !== "object") {
        addSummaryChip("manual only", "info");
        return;
      }

      const sourceLabel = String(response.activeSourceLabel || response.activeSourceId || "").trim();
      if (sourceLabel) addSummaryChip(`source ${sourceLabel}`, response.sourceOverrideActive ? "warn" : "info");

      const compatibility = response.contractCompatibility;
      if (compatibility && typeof compatibility === "object" && compatibility.mode !== "no_data") {
        if (compatibility.ok === false) addSummaryChip("contract incompatible", "warn");
        else if (compatibility.mode === "legacy_v1") addSummaryChip("contract legacy ok", "ok");
        else if (compatibility.contractVersion) addSummaryChip(`contract v${compatibility.contractVersion} ok`, "ok");
        else addSummaryChip("contract ok", "ok");
      }

      const counts = response.counts && typeof response.counts === "object" ? response.counts : null;
      if (counts) {
        addSummaryChip(`visual ${Number(counts.visualUpdates || 0)}`, "info");
        addSummaryChip(`add ${Number(counts.eligibleAdditions || 0)}`, "info");
        addSummaryChip(`material ${Number(counts.materialEligibleAdditions || 0)}`, "info");
        addSummaryChip(`blocked ${Number(counts.blocked || 0)}`, Number(counts.blocked || 0) ? "warn" : "ok");
        if (Number(counts.warnings || 0)) addSummaryChip(`warnings ${Number(counts.warnings || 0)}`, "warn");
      }

      if (typeof response.addedCount === "number") addSummaryChip(`added ${response.addedCount}`, response.addedCount ? "ok" : "info");
      if (typeof response.appliedCount === "number") addSummaryChip(`visual applied ${response.appliedCount}`, response.appliedCount ? "ok" : "info");
      if (typeof response.materialEnabledCount === "number") addSummaryChip(`material enabled ${response.materialEnabledCount}`, response.materialEnabledCount ? "ok" : "info");
      if (typeof response.blockedCount === "number") addSummaryChip(`blocked ${response.blockedCount}`, response.blockedCount ? "warn" : "ok");
      if (typeof response.materialBlockedCount === "number") addSummaryChip(`material blocked ${response.materialBlockedCount}`, response.materialBlockedCount ? "warn" : "ok");
      if (response.autoRemote && typeof response.autoRemote === "object") {
        const autoRemote = response.autoRemote;
        if (autoRemote.result === "auto_applied") addSummaryChip(`auto remote applied ${Number(autoRemote.autoAddedCount || 0)}`, Number(autoRemote.autoAddedCount || 0) ? "ok" : "info");
        else if (autoRemote.blockReason === "no auto capability") addSummaryChip("auto remote disabled", "info");
        else if (autoRemote.result === "auto_blocked") addSummaryChip("auto remote blocked", "warn");
        const autoMaterial = autoRemote.autoMaterial || response.autoMaterial;
        if (autoMaterial && typeof autoMaterial === "object") {
          if (autoMaterial.result === "auto_material_enabled") addSummaryChip(`auto material ${Number(autoMaterial.autoMaterialEnabledCount || 0)}`, Number(autoMaterial.autoMaterialEnabledCount || 0) ? "ok" : "info");
          else if (autoMaterial.blockReason === "no material auto capability") addSummaryChip("auto material disabled", "info");
          else if (autoMaterial.result === "auto_material_blocked") addSummaryChip("auto material blocked", "warn");
        }
      }
      if (typeof response.autoRefreshEnabled === "boolean") addSummaryChip(`auto ${response.autoRefreshEnabled ? "ON" : "OFF"}`, response.autoRefreshEnabled ? "warn" : "info");
      if (response.normalRefreshEnabled === true) {
        const ttlHours = Math.max(1, Math.round(Number(response.ttlMs || 0) / (60 * 60 * 1000)));
        addSummaryChip(`normal refresh ${ttlHours}h`, "info");
      }
      const usingStaleLkg = isRecycleRemoteUsingStaleLastKnownGood(response);
      if (typeof response.isStale === "boolean") addSummaryChip(response.isStale ? (usingStaleLkg ? "stale using LKG" : "stale") : "fresh", response.isStale ? "warn" : "ok");
      if (response.hasLastKnownGood === true) addSummaryChip("LKG yes", "ok");
      if (response.hasLastKnownGood === false) addSummaryChip("LKG no", "warn");
      if (response.blockReason) addSummaryChip(`blocked: ${String(response.blockReason).trim()}`, "warn");
      if (!summaryGrid.children.length) addSummaryChip(`${labelText || "last"} ${response.ok === false || isError ? "needs attention" : "ok"}`, response.ok === false || isError ? "warn" : "ok");
    };
    const updateAutoRefreshButton = (enabled) => {
      autoRefreshEnabled = enabled === true;
      if (!autoRefreshBtn) return;
      autoRefreshBtn.textContent = `Auto-refresh: ${autoRefreshEnabled ? "ON" : "OFF"}`;
      autoRefreshBtn.style.background = autoRefreshEnabled ? "#fff8ea" : "#fff";
      autoRefreshBtn.style.borderColor = autoRefreshEnabled ? "#d28a1d" : "#c9c9c9";
      autoRefreshBtn.style.color = autoRefreshEnabled ? "#8a4b00" : "#444";
    };
    const setBusy = (busy) => {
      buttons.forEach(btn => { btn.disabled = busy; });
      details.dataset.wifiOssRecycleRemoteBusy = busy ? "1" : "0";
    };
    const updateSourceInputFromResponse = (response) => {
      if (!sourceInput || !response || typeof response !== "object") return;
      const activeUrl = String(response.activeSourceUrl || "").trim();
      if (response.sourceOverrideActive && activeUrl) {
        sourceInput.value = activeUrl;
      } else if (!response.sourceOverrideActive) {
        sourceInput.value = "";
      }
    };
    const setStatus = (text, isError, response, labelText) => {
      const value = String(text || "").trim() || "no status";
      updateSourceInputFromResponse(response);
      compactStatus.textContent = value;
      compactStatus.style.color = isError ? "#8a4b00" : "#777";
      resultText.textContent = value;
      resultText.style.color = isError ? "#8a4b00" : "#666";
      resultText.style.borderColor = isError ? "#e0ad55" : "#ececec";
      resultText.style.background = isError ? "#fff8ea" : "#fff";
      renderSummary(response, isError, labelText);
    };
    const runAction = async (action, labelText, fn) => {
      setBusy(true);
      setStatus(`${labelText}: running...`, false, null, labelText);
      try {
        const response = await fn();
        if (typeof response?.autoRefreshEnabled === "boolean") updateAutoRefreshButton(response.autoRefreshEnabled);
        setStatus(formatRecycleRemoteDebugStatus(labelText, response), !response?.ok, response, labelText);
      } catch (error) {
        setStatus(`${labelText}: ${String(error?.message || error || "failed")}`, true, null, labelText);
      } finally {
        setBusy(false);
      }
    };
    const addButton = (parent, action, labelText, fn) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.wifiOssRecycleRemoteAction = action;
      btn.textContent = labelText;
      btn.style.padding = "3px 7px";
      btn.style.border = "1px solid #c9c9c9";
      btn.style.borderRadius = "999px";
      btn.style.background = "#fff";
      btn.style.color = "#444";
      btn.style.fontSize = "11px";
      btn.style.lineHeight = "1.35";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", () => runAction(action, labelText, fn));
      buttons.push(btn);
      parent.appendChild(btn);
      return btn;
    };

    const readRemoteStatus = () => sendRecycleRemoteConfigDebugMessage(RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.status);
    const initializeAutoRefreshState = async () => {
      try {
        const response = await readRemoteStatus();
        if (typeof response?.autoRefreshEnabled === "boolean") updateAutoRefreshButton(response.autoRefreshEnabled);
        updateSourceInputFromResponse(response);
        const sourceLabel = String(response?.activeSourceLabel || response?.activeSourceId || "production").trim();
        compactStatus.textContent = `source ${sourceLabel} | auto ${response?.autoRefreshEnabled ? "ON" : "OFF"} | not checked`;
        renderSummary(response, false, "Status");
      } catch (e) {
        compactStatus.textContent = "auto status unavailable";
        renderSummary(null, true, "Status");
      }
    };
    const refreshRemoteAndStatus = async () => {
      const response = await sendRecycleRemoteConfigDebugMessage(RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.refresh);
      const statusResponse = await readRemoteStatus();
      const autoRemote = response?.ok ? await applyRecycleRemoteAutomaticEligibleDevices() : null;
      if (autoRemote) autoRemote.renderedPanels = refreshRecycleRemoteVisualOverlayPanels();
      return { ...statusResponse, ...response, autoRemote, autoRefreshEnabled: statusResponse.autoRefreshEnabled, isStale: statusResponse.isStale, ttlMs: statusResponse.ttlMs, hasLastKnownGood: statusResponse.hasLastKnownGood };
    };

    const sourceButtons = createGroup("Source");
    sourceInput = document.createElement("input");
    sourceInput.type = "url";
    sourceInput.placeholder = "https://oss-assistant.github.io/oss-assistant-config/...json";
    sourceInput.autocomplete = "off";
    sourceInput.spellcheck = false;
    sourceInput.style.flex = "1 1 100%";
    sourceInput.style.minWidth = "0";
    sourceInput.style.boxSizing = "border-box";
    sourceInput.style.padding = "3px 6px";
    sourceInput.style.border = "1px solid #d7d7d7";
    sourceInput.style.borderRadius = "4px";
    sourceInput.style.background = "#fff";
    sourceInput.style.color = "#444";
    sourceInput.style.fontSize = "11px";
    sourceInput.style.lineHeight = "1.35";
    sourceButtons.appendChild(sourceInput);

    const checkButtons = createGroup("Check");
    const reviewButtons = createGroup("Review");
    const applyButtons = createGroup("Apply");
    const resetButtons = createGroup("Reset/debug");

    addButton(sourceButtons, "setSourceOverride", "Use debug source", () => {
      clearRecycleRemoteVisualOverlay("source_changed");
      return sendRecycleRemoteConfigDebugMessage(RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.setSourceOverride, { url: sourceInput?.value || "" });
    });
    addButton(sourceButtons, "clearSourceOverride", "Use production", () => {
      clearRecycleRemoteVisualOverlay("source_changed");
      return sendRecycleRemoteConfigDebugMessage(RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.clearSourceOverride);
    });
    addButton(checkButtons, "status", "Status", () => sendRecycleRemoteConfigDebugMessage(RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.maybeRefresh));
    addButton(checkButtons, "refresh", "Refresh remote", () => refreshRemoteAndStatus());
    addButton(reviewButtons, "previewPlan", "Preview plan", () => previewRecycleRemoteResolvedCatalogPlan());
    addButton(reviewButtons, "previewDiff", "Preview diff", () => previewRecycleRemoteCatalogDiff());
    addButton(applyButtons, "applyEligibleDevices", "Apply eligible", () => applyRecycleRemoteEligibleDevices());
    addButton(applyButtons, "enableMaterial", "Enable material", () => applyRecycleRemoteMaterialEnablement());
    addButton(applyButtons, "applyVisualOverlay", "Apply visual", () => applyRecycleRemoteVisualOverlay());
    addButton(resetButtons, "clear", "Clear", async () => {
      const response = await sendRecycleRemoteConfigDebugMessage(RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.clear);
      const local = clearRecycleRemoteVisualOverlay("local_fallback");
      return { ...response, result: response?.result || "cleared", appliedCount: local.appliedCount, addedCount: local.addedCount, renderedPanels: local.renderedPanels };
    });
    autoRefreshBtn = addButton(resetButtons, "toggleAutoRefresh", "Auto-refresh: OFF", async () => {
      return sendRecycleRemoteConfigDebugMessage(RECYCLE_REMOTE_CONFIG_DEBUG_MESSAGE_TYPES.setAutoRefresh, { enabled: !autoRefreshEnabled });
    });
    updateAutoRefreshButton(false);
    renderSummary(null, false, "Status");
    initializeAutoRefreshState();

    details.appendChild(controls);
    details.appendChild(summaryGrid);
    details.appendChild(resultText);
    wrap.appendChild(details);
    return wrap;
  }

  function ensureRecycleDebugGuardsTray(panel) {
    if (!panel) return null;
    const existing = panel.querySelector(`[${RECYCLE_DEBUG_GUARDS_TRAY_ATTR}]`);
    if (existing) {
      updateMaterialAutoContinueDebugToggles();
      updateRecycleDebugGuardsToggles(panel);
      return existing;
    }

    const wrap = document.createElement("div");
    wrap.setAttribute(RECYCLE_DEBUG_GUARDS_TRAY_ATTR, "1");
    wrap.style.margin = "6px 0 0";
    wrap.style.display = "flex";
    wrap.style.justifyContent = "flex-end";
    wrap.style.alignItems = "flex-start";

    const details = document.createElement("details");
    details.style.maxWidth = "420px";
    details.style.width = "min(420px, 100%)";
    details.style.border = "1px solid #dedede";
    details.style.borderRadius = "6px";
    details.style.background = "#fafafa";
    details.style.color = "#555";
    details.style.fontSize = "11px";
    details.style.lineHeight = "1.35";
    details.style.boxSizing = "border-box";
    details.style.padding = "5px 7px";
    details.style.opacity = "0.76";

    const summary = document.createElement("summary");
    summary.style.cursor = "pointer";
    summary.style.userSelect = "none";
    summary.style.display = "flex";
    summary.style.alignItems = "center";
    summary.style.justifyContent = "space-between";
    summary.style.gap = "10px";

    const label = document.createElement("span");
    label.textContent = "Debug guards";
    label.style.fontWeight = "700";
    label.style.whiteSpace = "nowrap";

    const compactStatus = document.createElement("span");
    compactStatus.setAttribute(RECYCLE_DEBUG_GUARDS_STATUS_ATTR, "1");
    compactStatus.style.fontWeight = "500";
    compactStatus.style.color = "#777";
    compactStatus.style.textAlign = "right";
    compactStatus.style.overflow = "hidden";
    compactStatus.style.textOverflow = "ellipsis";
    compactStatus.style.whiteSpace = "nowrap";

    summary.appendChild(label);
    summary.appendChild(compactStatus);
    details.appendChild(summary);

    const controls = document.createElement("div");
    controls.style.marginTop = "7px";
    controls.style.display = "flex";
    controls.style.flexWrap = "wrap";
    controls.style.gap = "5px";
    controls.style.alignItems = "center";

    const materialToggle = ensureMaterialAutoContinueDebugToggle(controls);
    if (materialToggle) {
      materialToggle.style.margin = "0";
      materialToggle.style.justifyContent = "flex-start";
      materialToggle.style.opacity = "1";
      const materialBtn = materialToggle.querySelector("button[data-wifi-oss-material-auto-continue-toggle]");
      if (materialBtn) {
        materialBtn.style.padding = "2px 6px";
        materialBtn.style.fontSize = "10px";
        materialBtn.style.lineHeight = "1.25";
      }
    }

    const deviceBtn = document.createElement("button");
    deviceBtn.type = "button";
    deviceBtn.setAttribute(RECYCLE_DEVICE_REQUIRED_TOGGLE_ATTR, "1");
    deviceBtn.style.padding = "2px 6px";
    deviceBtn.style.border = "1px solid #c9c9c9";
    deviceBtn.style.borderRadius = "999px";
    deviceBtn.style.fontSize = "10px";
    deviceBtn.style.lineHeight = "1.25";
    deviceBtn.style.cursor = "pointer";
    deviceBtn.style.boxShadow = "none";
    deviceBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setRecycleDeviceRequiredGuardEnabled(!isRecycleDeviceRequiredGuardEnabled());
    });
    controls.appendChild(deviceBtn);

    const dailyworkDryRunWrap = document.createElement("div");
    dailyworkDryRunWrap.style.flex = "1 1 100%";
    dailyworkDryRunWrap.style.display = "flex";
    dailyworkDryRunWrap.style.flexWrap = "wrap";
    dailyworkDryRunWrap.style.gap = "5px";
    dailyworkDryRunWrap.style.alignItems = "center";
    dailyworkDryRunWrap.style.marginTop = "2px";

    const dailyworkInput = document.createElement("input");
    dailyworkInput.type = "text";
    dailyworkInput.placeholder = "dailywork Device value";
    dailyworkInput.autocomplete = "off";
    dailyworkInput.spellcheck = false;
    dailyworkInput.style.flex = "1 1 170px";
    dailyworkInput.style.minWidth = "0";
    dailyworkInput.style.boxSizing = "border-box";
    dailyworkInput.style.padding = "2px 6px";
    dailyworkInput.style.border = "1px solid #d7d7d7";
    dailyworkInput.style.borderRadius = "4px";
    dailyworkInput.style.background = "#fff";
    dailyworkInput.style.color = "#444";
    dailyworkInput.style.fontSize = "10px";
    dailyworkInput.style.lineHeight = "1.25";
    dailyworkDryRunWrap.appendChild(dailyworkInput);

    const dailyworkBtn = document.createElement("button");
    dailyworkBtn.type = "button";
    dailyworkBtn.textContent = "Dailywork dry-run";
    dailyworkBtn.style.padding = "2px 6px";
    dailyworkBtn.style.border = "1px solid #c9c9c9";
    dailyworkBtn.style.borderRadius = "999px";
    dailyworkBtn.style.background = "#fff";
    dailyworkBtn.style.color = "#444";
    dailyworkBtn.style.fontSize = "10px";
    dailyworkBtn.style.lineHeight = "1.25";
    dailyworkBtn.style.cursor = "pointer";
    dailyworkBtn.style.boxShadow = "none";
    dailyworkDryRunWrap.appendChild(dailyworkBtn);

    const dailyworkOutput = document.createElement("div");
    dailyworkOutput.style.flex = "1 1 100%";
    dailyworkOutput.style.display = "none";
    dailyworkOutput.style.boxSizing = "border-box";
    dailyworkOutput.style.padding = "5px 6px";
    dailyworkOutput.style.border = "1px solid #ececec";
    dailyworkOutput.style.borderRadius = "4px";
    dailyworkOutput.style.background = "#fff";
    dailyworkOutput.style.color = "#555";
    dailyworkOutput.style.fontSize = "10px";
    dailyworkOutput.style.lineHeight = "1.35";
    dailyworkOutput.style.whiteSpace = "pre-wrap";
    dailyworkOutput.style.overflowWrap = "anywhere";
    dailyworkDryRunWrap.appendChild(dailyworkOutput);

    dailyworkBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const original = String(dailyworkInput.value || "");
      const normalized = normalizeDailyworkDeviceName(original);
      const selection = resolveDailyworkDeviceSelection(original);
      dailyworkOutput.textContent = [
        `original: ${original}`,
        `normalized: ${normalized}`,
        `action: ${selection.action}`,
        `categoryId: ${selection.categoryId}`,
        `deviceIds: ${selection.deviceIds.join(", ")}`,
        `confidence: ${selection.confidence}`,
        `reason: ${selection.reason}`,
        "Diagnostics only. No category/device was selected."
      ].join("\n");
      dailyworkOutput.style.display = "block";
    });

    controls.appendChild(dailyworkDryRunWrap);

    details.appendChild(controls);
    wrap.appendChild(details);
    updateMaterialAutoContinueDebugToggles();
    updateRecycleDebugGuardsToggles(wrap);
    return wrap;
  }

  let recycleEntryStorageSyncInstalled = false;
  function installRecycleEntryStorageSync() {
    if (recycleEntryStorageSyncInstalled) return;
    recycleEntryStorageSyncInstalled = true;

    window.addEventListener("storage", (event) => {
      const key = event?.key;
      if (
        key !== RECYCLE_ENTRY_SELECTED_KEY &&
        key !== RECYCLE_ENTRY_SELECTED_DATE_KEY &&
        key !== RECYCLE_ENTRY_SELECTED_DEVICES_KEY
      ) {
        return;
      }

      const root = document.getElementById(RECYCLE_ENTRY_ROOT_ID);
      const panel = root ? root.querySelector(`.${RECYCLE_ENTRY_PANEL_CLASS}`) : null;
      if (panel) refreshRecycleEntryCategoryPanel(panel);
    });
  }

  function localDateKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function isValidImeiLuhn(imei) {
    const s = String(imei || "").trim();
    if (!/^\d{15}$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 15; i++) {
      let d = s.charCodeAt(i) - 48;
      // Double every second digit from the right (i=13,11,...)
      if ((i % 2) === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    return (sum % 10) === 0;
  }

  const RECYCLE_SELECTED_DEVICE_SERIAL_INVALID_MSG = "\u041d\u0435\u0432\u0430\u043b\u0438\u0434\u0435\u043d \u0441\u0435\u0440\u0438\u0435\u043d \u043d\u043e\u043c\u0435\u0440 \u0437\u0430 \u0438\u0437\u0431\u0440\u0430\u043d\u043e\u0442\u043e \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u043e.";
  const recycleProfileOk = () => ({ ok: true, msg: "" });
  const recycleProfileInvalid = () => ({ ok: false, msg: RECYCLE_SELECTED_DEVICE_SERIAL_INVALID_MSG });

  const RECYCLE_SERIAL_VALIDATION_PROFILES = {
    android_b866v2f02_bg_plus_15_digits: (s) => (/^BG\d{15}$/i.test(s) ? recycleProfileOk() : recycleProfileInvalid()),
    android_dv9161_16_digits: (s) => (/^\d{16}$/.test(s) ? recycleProfileOk() : recycleProfileInvalid()),
    android_zxv_b700v5_12_digits: (s) => (/^\d{12}$/.test(s) ? recycleProfileOk() : recycleProfileInvalid()),
    xplore_zapper_mac12_hex_plain: (s) => (/^[0-9A-F]{12}$/i.test(s) ? recycleProfileOk() : recycleProfileInvalid()),
    dth_11_digits_prefix_00: (s) => (/^00\d{9}$/.test(s) ? recycleProfileOk() : recycleProfileInvalid()),
    imei15_luhn: (s) => (/^\d{15}$/.test(s) && isValidImeiLuhn(s) ? recycleProfileOk() : recycleProfileInvalid()),
    router_13_alnum: (s) => (/^[A-Za-z0-9]{13}$/.test(s) ? recycleProfileOk() : recycleProfileInvalid()),
    router_zte_h3601p_zte_prefix_15_alnum: (s) => (/^ZTE[A-Za-z0-9]{12}$/i.test(s) ? recycleProfileOk() : recycleProfileInvalid()),
    austrian_adb_vv2220: (s) => (/^PI[A-Za-z0-9]{17}$/i.test(s) ? recycleProfileOk() : recycleProfileInvalid()),
    austrian_huawei_ha35_22_hibrid: (s) => (/^[A-Za-z0-9]{16}$/.test(s) ? recycleProfileOk() : recycleProfileInvalid()),
    gpon_16_alnum: (s) => (/^[A-Za-z0-9]{16}$/.test(s) ? recycleProfileOk() : recycleProfileInvalid())
  };

  function getRecycleSerialCommonInvalidResult(serialRaw) {
    const s = String(serialRaw || "").trim();
    if (!s) return { ok: false, msg: "\u0412\u044a\u0432\u0435\u0434\u0438 \u0441\u0435\u0440\u0438\u0435\u043d \u043d\u043e\u043c\u0435\u0440." };
    const cyrillicCheck = getRecycleSerialCyrillicValidation(s);
    if (!cyrillicCheck.ok) return cyrillicCheck;
    return null;
  }

  function getSelectedRecycleDevicesForValidation(categoryId) {
    const category = String(categoryId || "").trim();
    if (!category) return [];
    const selectedIds = readSelectedRecycleDeviceIdsStorage();
    if (!selectedIds.length) return [];
    const activeDeviceIds = new Set(getRecycleDevicesByCategory(category).map(device => String(device?.deviceId || "").trim()).filter(Boolean));
    return selectedIds
      .map(id => getRecycleDeviceById(id))
      .filter(device => device && device.categoryId === category && activeDeviceIds.has(device.deviceId));
  }

  function isRecycleValidationProfileImplemented(profileId) {
    const id = String(profileId || "").trim();
    return Boolean(id && typeof RECYCLE_SERIAL_VALIDATION_PROFILES[id] === "function");
  }

  function validateRecycleSerialWithProfile(profileId, serialRaw) {
    const id = String(profileId || "").trim();
    const validator = RECYCLE_SERIAL_VALIDATION_PROFILES[id];
    if (typeof validator !== "function") return null;
    const commonInvalid = getRecycleSerialCommonInvalidResult(serialRaw);
    if (commonInvalid) return commonInvalid;
    return validator(String(serialRaw || "").trim());
  }

  function validateRecycleSerialForSelection(categoryId, serialRaw) {
    const selectedDevices = getSelectedRecycleDevicesForValidation(categoryId);
    if (!selectedDevices.length) return validateRecycleSerial(categoryId, serialRaw);

    const profileDevices = selectedDevices.filter(device => isRecycleValidationProfileImplemented(device.validationProfileId));
    const hasFallbackDevice = profileDevices.length !== selectedDevices.length;
    if (!profileDevices.length) return validateRecycleSerial(categoryId, serialRaw);

    const commonInvalid = getRecycleSerialCommonInvalidResult(serialRaw);
    if (commonInvalid) return commonInvalid;

    for (const device of profileDevices) {
      const result = validateRecycleSerialWithProfile(device.validationProfileId, serialRaw);
      if (result?.ok) return result;
    }

    if (hasFallbackDevice) {
      const fallback = validateRecycleSerial(categoryId, serialRaw);
      if (fallback.ok) return fallback;
    }

    return recycleProfileInvalid();
  }

  function validateRecycleSerial(categoryId, serialRaw) {
    const s = String(serialRaw || "").trim();
    if (!s) return { ok: false, msg: "Въведи сериен номер." };
    const cyrillicCheck = getRecycleSerialCyrillicValidation(s);
    if (!cyrillicCheck.ok) return cyrillicCheck;
    if (categoryId === "cam_modules") return { ok: true, msg: "" };
    const upper = s.toUpperCase();
    const macWithSeparators = /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/.test(upper);
    // Important: do NOT treat 12 digits-only as MAC.
    const macPlainHex = /^[0-9A-F]{12}$/.test(upper) && /[A-F]/.test(upper);

    // XPLORE & Zapper: must be MAC (concatenated, no separators).
    if (categoryId === "xplore_zapper") {
      if (macWithSeparators) return { ok: false, msg: "MAC адресът трябва да е слят (без ':' или '-')." };
      if (!/^[0-9A-F]{12}$/.test(upper)) return { ok: false, msg: "Серийният номер трябва да е MAC адрес." };
      return { ok: true, msg: "" };
    }

    // Modems: allow a single dash at position 6 for SAAP/SAPP formats.
    // Rules:
    // - accept if starts with SAAP or SAPP AND has '-' as 6th character
    // - OR accept if starts with 0099
    // - otherwise reject
    if (categoryId === "modems") {
      if (upper.startsWith("0099")) {
        if (!/^\d+$/.test(s)) return { ok: false, msg: "Невалиден сериен номер за Модеми (0099... трябва да е само цифри)." };
        return { ok: true, msg: "" };
      }
      const sa = (upper.startsWith("SAAP") || upper.startsWith("SAPP"));
      if (sa) {
        // SAAP/SAPP: allow letters/digits, and optionally a single dash ONLY at position 6.
        if (s.includes("-")) {
          if (s.length < 6 || s[5] !== "-" || (s.split("-").length - 1) !== 1) {
            return { ok: false, msg: "Невалиден сериен номер за Модеми (ако има '-', трябва да е само един и да е на 6-ти символ)." };
          }
          if (!/^[A-Za-z0-9]{5}-[A-Za-z0-9]+$/.test(s)) return { ok: false, msg: "Невалиден сериен номер за Модеми." };
          return { ok: true, msg: "" };
        }
        if (!/^[A-Za-z0-9]+$/.test(s)) return { ok: false, msg: "Невалиден сериен номер за Модеми." };
        return { ok: true, msg: "" };
      }

      // Any other modem serial can be accepted if it has '-' at the 6th character.
      if (s.length >= 6 && s[5] === "-") {
        if (!/^[A-Za-z0-9]{5}-[A-Za-z0-9]+$/.test(s)) return { ok: false, msg: "Невалиден сериен номер за Модеми." };
        return { ok: true, msg: "" };
      }

      return { ok: false, msg: "Невалиден сериен номер за Модеми." };
    }

    // Disallow special characters: allow only letters and digits.
    // This blocks ".", "!", ":" and any other non-alphanumeric symbol.
    if (!/^[A-Za-z0-9]+$/.test(s)) return { ok: false, msg: "Серийният номер не трябва да съдържа специални символи." };

    // NOTE: These rules are tightened per category. Easy to adjust further.
    if (categoryId === "android_iptv") {
      // Reject MAC addresses (with separators or plain 12 hex chars with A-F letters).
      if (macWithSeparators || macPlainHex) return { ok: false, msg: "Серийният номер не може да е MAC адрес." };
      if (s.length < 12 || s.length > 17) return { ok: false, msg: "Серийният номер за Android TV & ZTE IPTV трябва да е между 12 и 17 символа." };
      // Letters are allowed ONLY if the serial starts with "BG".
      if (!upper.startsWith("BG")) {
        if (/[A-Za-z]/.test(s)) return { ok: false, msg: "Букви в серийния номер не са позволени" };
        // Without BG prefix, require digits-only.
        if (!/^\d+$/.test(s)) return { ok: false, msg: "Серийният номер трябва да е само цифри" };
      }
    } else if (categoryId === "netbox") {
      // Netbox: IMEI only (15 digits) with Luhn verification.
      if (!/^\d{15}$/.test(s)) return { ok: false, msg: "За Netbox серийният номер трябва да е IMEI." };
      if (!isValidImeiLuhn(s)) return { ok: false, msg: "Невалиден IMEI (Luhn проверката не минава)." };
    } else if (categoryId === "routers") {
      if (upper.startsWith("ZTE")) {
        if (s.length !== 15) return { ok: false, msg: "Невалиден сериен номер за Рутери (ако започва с ZTE трябва да е точно 15 символа)." };
      } else {
        if (s.length !== 13) return { ok: false, msg: "Невалиден сериен номер за Рутери (трябва да е точно 13 символа)." };
      }
    } else if (categoryId === "gpon") {
      // GPON:
      // - accept if starts with 5A54 or 4857
      // - otherwise accept only if starts with ZTE AND is exactly 12 chars long
      if (upper.startsWith("5A54") || upper.startsWith("4857")) {
        // ok
      } else if (upper.startsWith("ZTEK") && s.length === 15) {
        // ok
      } else {
        return { ok: false, msg: "Невалиден сериен номер за GPON." };
      }
    } else if (categoryId === "austrian") {
      if (s.length < 16) return { ok: false, msg: "Невалиден сериен номер за Австрийски (трябва да е 16 или повече символи)." };
    } else if (categoryId === "dth_kaon_nagra") {
      if (!/^\d{11}$/.test(s)) return { ok: false, msg: "Невалиден сериен номер за DTH Kaon & Nagra." };
    }
    return { ok: true, msg: "" };
  }

  function injectRecycleEntryCategoryPanel() {
    const root = document.getElementById(RECYCLE_ENTRY_ROOT_ID);
    if (!root) return false;
    if (root.querySelector(`.${RECYCLE_ENTRY_PANEL_CLASS}`)) return true;

    const serialInput = root.querySelector(`#${RECYCLE_ENTRY_SERIAL_INPUT_ID}`) || document.getElementById(RECYCLE_ENTRY_SERIAL_INPUT_ID);
    if (!serialInput) return false;

    const continueBtn = root.querySelector(`#${RECYCLE_ENTRY_CONTINUE_BTN_ID}`) || document.getElementById(RECYCLE_ENTRY_CONTINUE_BTN_ID);
    if (!continueBtn) return false;

    const fieldset = root.querySelector("fieldset") || root;
    const serialRow = serialInput.closest(".row") || serialInput.parentElement;
    const serialMsg = document.createElement("div");
    serialMsg.id = "wifi-oss-recycle-serial-msg";
    serialMsg.style.marginLeft = "10px";
    serialMsg.style.display = "none";
    if (serialRow) {
      // Keep layout on one line when possible.
      if (serialRow.style && !serialRow.style.display) serialRow.style.display = "flex";
      if (serialRow.style && !serialRow.style.gap) serialRow.style.gap = "8px";
      if (serialRow.style && !serialRow.style.alignItems) serialRow.style.alignItems = "center";
      serialRow.appendChild(serialMsg);
    }

    const setSerialInlineAlert = (message, variant, kind) => {
      if (kind) serialMsg.dataset.wifiOssRecycleSerialAlertKind = kind;
      else delete serialMsg.dataset.wifiOssRecycleSerialAlertKind;
      setRecycleInlineAlert(serialMsg, message, variant);
    };
    const clearSerialInlineAlert = () => {
      clearRecycleInlineAlert(serialMsg);
      hideRecycleSerialHelp();
    };
    attachRecycleSerialDebug(serialInput);

    const panel = document.createElement("div");
    panel.className = RECYCLE_ENTRY_PANEL_CLASS;
    panel.style.marginTop = "16px";
    panel.style.paddingTop = "14px";
    panel.style.borderTop = "1px solid #e5e5e5";
    panel.style.maxWidth = "100%";
    panel.style.boxSizing = "border-box";

    const title = document.createElement("div");
    title.textContent = "Избери на каква категория си днес:";
    title.style.fontWeight = "700";
    title.style.color = "#333";
    title.style.fontSize = "16px";
    title.style.marginBottom = "8px";
    panel.appendChild(title);

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gap = "10px";
    grid.style.maxWidth = "100%";
    grid.style.overflow = "visible";
    grid.style.boxSizing = "border-box";

    const categories = [
      { id: "android_iptv", label: "Android TV & ZTE IPTV", hintModelName: "DV9161 (AndroidTV)", imagePath: "images/categories/16x9/android_iptv.webp" },
      { id: "xplore_zapper", label: "5019/5020 & Zapper", hintModelName: "Zapper", imagePath: "images/categories/16x9/xplore_zapper.webp" },
      { id: "dth_kaon_nagra", label: "DTH Kaon & Nagra", hintModelName: "DTH Nagra DTS3460", imagePath: "images/categories/16x9/dth_nagra.webp" },
      { id: "austrian", label: "Австрийски", hintModelName: "", imagePath: "images/categories/16x9/austria.webp" },
      { id: "netbox", label: "Netbox", hintModelName: "", imagePath: "images/categories/16x9/netbox.webp" },
      { id: "routers", label: "Рутери", hintModelName: "", imagePath: "images/categories/16x9/routers.webp" },
      { id: "gpon", label: "GPON", hintModelName: "", imagePath: "images/categories/16x9/GPON.webp" },
      { id: "cam_modules", label: "CAM Модули", hintModelName: "", imagePath: "images/categories/16x9/CAM_modules.webp" },
      { id: "modems", label: "Модеми", hintModelName: "", imagePath: "images/categories/16x9/modems.webp" }
    ];

    let selected = readSelectedRecycleEntryCategory();
    let selectedRecycleDeviceIds = new Set(readSelectedRecycleDeviceIdsStorage());

    panel.dataset.wifiOssRecycleSelected = selected;
    const getSelected = () => {
      selected = readSelectedRecycleEntryCategory();
      return selected;
    };

    const loadSelectedRecycleDeviceIds = () => {
      selectedRecycleDeviceIds = new Set(readSelectedRecycleDeviceIdsStorage());
    };

    const saveSelectedRecycleDeviceIds = () => {
      writeSelectedRecycleDeviceIdsStorage(selectedRecycleDeviceIds);
    };

    const clearSelectedRecycleDeviceIds = () => {
      selectedRecycleDeviceIds.clear();
      clearRecycleEntrySelectedDevicesStorage();
    };

    const isRecycleDeviceCardVisibleAndEnabled = (card) => {
      if (!card || card.disabled || card.hidden || card.getAttribute("aria-disabled") === "true") return false;
      const style = window.getComputedStyle ? window.getComputedStyle(card) : null;
      if (style && (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse")) return false;
      return card.offsetParent !== null || card.getClientRects().length > 0;
    };

    const categoryRequiresDeviceSelection = (categoryId) => {
      const category = String(categoryId || "").trim();
      if (!category || RECYCLE_ENTRY_DEVICE_REQUIRED_EXCLUDED_CATEGORY_IDS.has(category)) return false;
      if (!isRecycleDeviceRequiredGuardEnabled()) return false;
      return Array.from(panel.querySelectorAll("[data-wifi-oss-recycle-device]")).some(card => {
        const deviceId = String(card?.dataset?.wifiOssRecycleDevice || "").trim();
        const device = deviceId ? getRecycleDeviceById(deviceId) : null;
        return device?.categoryId === category && isRecycleDeviceCardVisibleAndEnabled(card);
      });
    };

    const hasSelectedRecycleDeviceForCategory = (categoryId) => (
      getSelectedRecycleDevicesForValidation(categoryId).length > 0
    );

    const setSelected = (id) => {
      const previous = getSelected();
      if (previous !== id) clearSelectedRecycleDeviceIds();
      selected = id;
      writeSelectedRecycleEntryCategory(id);
      panel.dataset.wifiOssRecycleSelected = id;
      clearSerialInlineAlert();
      renderCategories();
    };

    const resolveCategoryImageUrl = (c) => {
      const imgPath = c.imagePath ? String(c.imagePath) : deviceImageForModel(c.hintModelName);
      return resolveRecycleImageUrl(imgPath);
    };

    const resolveDeviceImageUrl = (device) => {
      const imgPath = getRecycleDeviceImagePath(device);
      return resolveRecycleImageUrl(imgPath);
    };

    const resolveDeviceFallbackImageUrl = (device) => {
      const imgPath = getRecycleDeviceFallbackImagePath(device);
      return resolveRecycleImageUrl(imgPath);
    };

    const applyRecycleDeviceSelectedState = (card, isSelected) => {
      if (!card) return;
      card.dataset.wifiOssRecycleDeviceSelected = isSelected ? "1" : "0";
      card.setAttribute("aria-pressed", isSelected ? "true" : "false");
      card.style.borderColor = isSelected ? "#DA291C" : "#d8d8d8";
      card.style.outline = "none";
      card.style.outlineOffset = "0";
      card.style.boxShadow = isSelected ? "0 8px 20px rgba(218,41,28,0.22)" : "0 2px 9px rgba(0,0,0,0.10)";
      if (isSelected) card.style.transform = "";

      const titleBar = card.querySelector("[data-wifi-oss-recycle-device-title]");
      if (titleBar) titleBar.style.background = isSelected ? "#DA291C" : "#3f3f3f";

      const check = card.querySelector("[data-wifi-oss-recycle-device-check]");
      if (check) check.style.display = isSelected ? "flex" : "none";

      const strip = card.querySelector("[data-wifi-oss-recycle-device-strip]");
      if (strip) strip.style.height = "3px";
    };

    const toggleRecycleDeviceSelection = (deviceId, card) => {
      const id = String(deviceId || "").trim();
      if (!id) return;
      if (selectedRecycleDeviceIds.has(id)) selectedRecycleDeviceIds.delete(id);
      else selectedRecycleDeviceIds.add(id);
      saveSelectedRecycleDeviceIds();
      applyRecycleDeviceSelectedState(card, selectedRecycleDeviceIds.has(id));
      if (selectedRecycleDeviceIds.has(id) && serialMsg.dataset.wifiOssRecycleSerialAlertKind === "device-required") {
        clearSerialInlineAlert();
      }
      refreshRecycleSerialHelpAvailability(getSelected());
    };

    const createCategoryCard = (c, featured) => {
      const isSelected = (c.id === getSelected());
      const red = "#DA291C";
      const baseBorder = featured ? red : "#d8d8d8";
      const baseShadow = featured ? "0 8px 20px rgba(0,0,0,0.16)" : "0 2px 9px rgba(0,0,0,0.10)";
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.wifiOssRecycleCat = c.id;
      b.setAttribute("aria-pressed", isSelected ? "true" : "false");
      b.setAttribute("aria-label", c.label);
      b.style.position = "relative";
      b.style.display = "flex";
      b.style.flexDirection = "column";
      b.style.width = "100%";
      b.style.height = featured ? "auto" : "100%";
      b.style.alignSelf = "start";
      b.style.padding = "0";
      b.style.border = `1px solid ${baseBorder}`;
      b.style.borderRadius = "6px";
      b.style.background = "#fff";
      b.style.boxShadow = baseShadow;
      b.style.overflow = "hidden";
      b.style.color = "#fff";
      b.style.cursor = "pointer";
      b.style.textAlign = "left";
      b.style.fontFamily = "inherit";
      b.style.appearance = "none";
      b.style.transition = "transform 180ms cubic-bezier(0.2, 0, 0.2, 1), border-color 180ms ease, box-shadow 180ms ease";
      b.style.willChange = "transform";

      const media = document.createElement("div");
      media.style.position = "relative";
      media.style.width = "100%";
      media.style.aspectRatio = "16 / 9";
      media.style.background = "#fafafa";
      media.style.boxSizing = "border-box";
      media.style.padding = featured ? "14px" : "8px";
      media.style.display = "flex";
      media.style.flex = "1 1 auto";
      media.style.alignItems = "center";
      media.style.justifyContent = "center";
      media.style.overflow = "hidden";

      const imgUrl = resolveCategoryImageUrl(c);
      let img = null;
      if (imgUrl) {
        img = document.createElement("img");
        img.alt = "";
        img.src = imgUrl;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        img.style.display = "block";
        img.style.transition = "transform 180ms cubic-bezier(0.2, 0, 0.2, 1)";
        media.appendChild(img);
      }

      if (featured) {
        const check = document.createElement("div");
        check.dataset.wifiOssCheck = "1";
        check.textContent = "\u2713";
        check.style.position = "absolute";
        check.style.top = "10px";
        check.style.right = "10px";
        check.style.width = "24px";
        check.style.height = "24px";
        check.style.borderRadius = "999px";
        check.style.background = red;
        check.style.color = "#fff";
        check.style.display = "flex";
        check.style.alignItems = "center";
        check.style.justifyContent = "center";
        check.style.fontSize = "16px";
        check.style.fontWeight = "900";
        check.style.boxShadow = "0 2px 8px rgba(0,0,0,0.20)";
        media.appendChild(check);
      }

      const titleBar = document.createElement("div");
      titleBar.style.minHeight = featured ? "48px" : "38px";
      titleBar.style.width = "100%";
      titleBar.style.boxSizing = "border-box";
      titleBar.style.padding = featured ? "8px 14px" : "7px 10px";
      titleBar.style.background = featured ? red : "#3f3f3f";
      titleBar.style.display = "flex";
      titleBar.style.flex = "0 0 auto";
      titleBar.style.marginTop = "auto";
      titleBar.style.alignItems = "center";
      titleBar.style.justifyContent = "center";

      const label = document.createElement("div");
      label.textContent = c.label;
      label.style.fontWeight = "800";
      label.style.fontSize = featured ? "16px" : "13px";
      label.style.lineHeight = "1.18";
      label.style.letterSpacing = "0";
      label.style.textTransform = "uppercase";
      label.style.display = "-webkit-box";
      label.style.webkitBoxOrient = "vertical";
      label.style.webkitLineClamp = "2";
      label.style.overflow = "hidden";
      label.style.textAlign = "center";
      titleBar.appendChild(label);

      b.appendChild(media);
      b.appendChild(titleBar);
      const strip = document.createElement("div");
      strip.style.position = "absolute";
      strip.style.left = "0";
      strip.style.right = "0";
      strip.style.bottom = "0";
      strip.style.height = "0";
      strip.style.background = red;
      strip.style.transition = "height 160ms ease";
      b.appendChild(strip);
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setSelected(c.id);
      });
      b.addEventListener("mouseenter", () => {
        b.style.transform = featured ? "translateY(-1px)" : "translateY(-2px)";
        b.style.borderColor = red;
        b.style.boxShadow = featured ? "0 10px 24px rgba(0,0,0,0.18)" : "0 8px 20px rgba(218,41,28,0.18)";
        if (img) img.style.transform = "scale(1.025)";
        if (!featured) strip.style.height = "6px";
      });
      b.addEventListener("mouseleave", () => {
        b.style.transform = "";
        b.style.borderColor = baseBorder;
        b.style.boxShadow = baseShadow;
        if (img) img.style.transform = "";
        strip.style.height = "0";
      });

      return b;
    };

    const createDeviceCard = (device) => {
      const visualDevice = getRecycleDeviceVisualView(device);
      const red = "#DA291C";
      const materialId = getRecycleEffectiveMaterialId(device, "sap");
      const displayName = String(visualDevice?.displayName || materialId || "").trim();
      const deviceId = String(device?.deviceId || "").trim();
      const card = document.createElement("button");
      card.type = "button";
      card.dataset.wifiOssRecycleDevice = deviceId;
      card.setAttribute("aria-label", `${displayName}${materialId ? ` SAP ${materialId}` : ""}`);
      card.style.position = "relative";
      card.style.display = "flex";
      card.style.flexDirection = "column";
      card.style.width = "100%";
      card.style.height = "100%";
      card.style.alignSelf = "start";
      card.style.padding = "0";
      card.style.border = "1px solid #d8d8d8";
      card.style.borderRadius = "6px";
      card.style.background = "#fff";
      card.style.boxShadow = "0 2px 9px rgba(0,0,0,0.10)";
      card.style.overflow = "hidden";
      card.style.color = "#fff";
      card.style.textAlign = "left";
      card.style.fontFamily = "inherit";
      card.style.appearance = "none";
      card.style.cursor = "pointer";
      card.style.transition = "transform 180ms cubic-bezier(0.2, 0, 0.2, 1), border-color 160ms ease, box-shadow 160ms ease";
      card.style.willChange = "transform";

      const media = document.createElement("div");
      media.style.position = "relative";
      media.style.width = "100%";
      media.style.aspectRatio = "16 / 9";
      media.style.background = "#fafafa";
      media.style.boxSizing = "border-box";
      media.style.padding = "8px";
      media.style.display = "flex";
      media.style.flex = "1 1 auto";
      media.style.alignItems = "center";
      media.style.justifyContent = "center";
      media.style.overflow = "hidden";

      const appendTextFallback = () => {
        if (media.querySelector("[data-wifi-oss-recycle-device-text-fallback]")) return;
        const fallback = document.createElement("div");
        fallback.dataset.wifiOssRecycleDeviceTextFallback = "1";
        fallback.textContent = materialId ? `SAP ${materialId}` : displayName;
        fallback.style.boxSizing = "border-box";
        fallback.style.width = "100%";
        fallback.style.padding = "8px";
        fallback.style.color = "#595959";
        fallback.style.fontSize = "12px";
        fallback.style.fontWeight = "800";
        fallback.style.lineHeight = "1.2";
        fallback.style.textAlign = "center";
        fallback.style.overflowWrap = "anywhere";
        media.appendChild(fallback);
      };

      const imgUrl = resolveDeviceImageUrl(visualDevice);
      if (imgUrl) {
        const img = document.createElement("img");
        img.alt = "";
        img.src = imgUrl;
        img.loading = "lazy";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        img.style.display = "block";
        img.addEventListener("error", () => {
          const fallbackUrl = resolveDeviceFallbackImageUrl(device);
          if (fallbackUrl && img.dataset.wifiOssRecycleFallbackTried !== "1") {
            img.dataset.wifiOssRecycleFallbackTried = "1";
            img.src = fallbackUrl;
            return;
          }
          try { img.remove(); } catch (e) {}
          appendTextFallback();
        });
        media.appendChild(img);
      } else {
        appendTextFallback();
      }

      const check = document.createElement("div");
      check.dataset.wifiOssRecycleDeviceCheck = "1";
      check.textContent = "\u2713";
      check.style.position = "absolute";
      check.style.top = "8px";
      check.style.right = "8px";
      check.style.width = "22px";
      check.style.height = "22px";
      check.style.borderRadius = "999px";
      check.style.background = red;
      check.style.color = "#fff";
      check.style.display = "none";
      check.style.alignItems = "center";
      check.style.justifyContent = "center";
      check.style.fontSize = "15px";
      check.style.fontWeight = "900";
      check.style.boxShadow = "0 2px 8px rgba(0,0,0,0.20)";
      media.appendChild(check);

      const titleBar = document.createElement("div");
      titleBar.dataset.wifiOssRecycleDeviceTitle = "1";
      titleBar.style.minHeight = "46px";
      titleBar.style.width = "100%";
      titleBar.style.boxSizing = "border-box";
      titleBar.style.padding = "7px 10px";
      titleBar.style.background = "#3f3f3f";
      titleBar.style.display = "flex";
      titleBar.style.flex = "0 0 auto";
      titleBar.style.marginTop = "auto";
      titleBar.style.flexDirection = "column";
      titleBar.style.alignItems = "center";
      titleBar.style.justifyContent = "center";
      titleBar.style.gap = "3px";

      const label = document.createElement("div");
      label.textContent = displayName;
      label.style.fontWeight = "800";
      label.style.fontSize = "12px";
      label.style.lineHeight = "1.16";
      label.style.letterSpacing = "0";
      label.style.textTransform = "uppercase";
      label.style.display = "-webkit-box";
      label.style.webkitBoxOrient = "vertical";
      label.style.webkitLineClamp = "2";
      label.style.overflow = "hidden";
      label.style.textAlign = "center";
      titleBar.appendChild(label);

      if (materialId) {
        const sap = document.createElement("div");
        sap.textContent = materialId;
        sap.style.color = "#e6e6e6";
        sap.style.fontSize = "11px";
        sap.style.fontWeight = "700";
        sap.style.lineHeight = "1.1";
        sap.style.letterSpacing = "0";
        sap.style.textAlign = "center";
        titleBar.appendChild(sap);
      }

      const strip = document.createElement("div");
      strip.dataset.wifiOssRecycleDeviceStrip = "1";
      strip.style.position = "absolute";
      strip.style.left = "0";
      strip.style.right = "0";
      strip.style.bottom = "0";
      strip.style.height = "3px";
      strip.style.background = red;
      strip.style.transition = "height 160ms ease";
      card.appendChild(media);
      card.appendChild(titleBar);
      card.appendChild(strip);
      const applyUnselectedHover = (isHovering) => {
        const isSelected = card.dataset.wifiOssRecycleDeviceSelected === "1";
        if (isSelected) {
          applyRecycleDeviceSelectedState(card, true);
          return;
        }
        card.style.transform = isHovering ? "translateY(-2px)" : "";
        card.style.borderColor = isHovering ? red : "#d8d8d8";
        card.style.boxShadow = isHovering ? "0 8px 20px rgba(218,41,28,0.18)" : "0 2px 9px rgba(0,0,0,0.10)";
        strip.style.height = isHovering ? "6px" : "3px";
      };
      card.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleRecycleDeviceSelection(deviceId, card);
        applyUnselectedHover(card.matches(":hover"));
      });
      card.addEventListener("mouseenter", () => applyUnselectedHover(true));
      card.addEventListener("mouseleave", () => applyUnselectedHover(false));
      applyRecycleDeviceSelectedState(card, selectedRecycleDeviceIds.has(deviceId));
      return card;
    };

    const renderLegacyCategorySwitcher = (target, activeCategory) => {
      categories
        .filter(c => c.id !== activeCategory.id)
        .forEach(c => target.appendChild(createCategoryCard(c, false)));
    };

    const renderCategories = () => {
      const activeId = getSelected();
      const activeCategory = categories.find(c => c.id === activeId);
      selected = activeCategory ? activeCategory.id : "";
      panel.dataset.wifiOssRecycleSelected = selected;
      loadSelectedRecycleDeviceIds();
      grid.textContent = "";
      grid.style.alignItems = "start";

      if (!activeCategory) {
        clearSelectedRecycleDeviceIds();
        refreshRecycleSerialHelpAvailability("");
        grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(180px, 1fr))";
        categories.forEach(c => grid.appendChild(createCategoryCard(c, false)));
        return;
      }

      const gridWidth = grid.getBoundingClientRect().width || fieldset.getBoundingClientRect().width || 0;
      const stacked = gridWidth > 0 && gridWidth < 650;
      grid.style.gridTemplateColumns = stacked ? "1fr" : "minmax(260px, 0.82fr) minmax(330px, 1.45fr)";

      grid.appendChild(createCategoryCard(activeCategory, true));

      const restGrid = document.createElement("div");
      restGrid.style.display = "grid";
      restGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(130px, 1fr))";
      restGrid.style.gap = "10px";
      restGrid.style.alignContent = "start";
      restGrid.style.minWidth = "0";

      const devices = getRecycleDevicesByCategory(activeCategory.id);
      if (devices.length) {
        const activeDeviceIds = new Set(devices.map(device => String(device?.deviceId || "").trim()).filter(Boolean));
        const deferUnknownSelectedDevicePrune = shouldDeferRecycleSelectedDevicePrune();
        let changed = false;
        selectedRecycleDeviceIds.forEach(id => {
          if (!activeDeviceIds.has(id)) {
            if (deferUnknownSelectedDevicePrune && isRecycleRemoteSafeId(id)) return;
            selectedRecycleDeviceIds.delete(id);
            changed = true;
          }
        });
        if (changed) saveSelectedRecycleDeviceIds();
        devices.forEach(device => restGrid.appendChild(createDeviceCard(device)));
      } else {
        clearSelectedRecycleDeviceIds();
        renderLegacyCategorySwitcher(restGrid, activeCategory);
      }
      grid.appendChild(restGrid);
      refreshRecycleSerialHelpAvailability(activeCategory.id);
    };

    panel.__wifiOssRenderRecycleCategories = renderCategories;
    panel.appendChild(grid);
    const remoteDebugTray = ensureRecycleRemoteConfigDebugTray(panel);
    if (remoteDebugTray) panel.appendChild(remoteDebugTray);
    const debugGuardsTray = ensureRecycleDebugGuardsTray(panel);
    if (debugGuardsTray) panel.appendChild(debugGuardsTray);
    fieldset.appendChild(panel);
    renderCategories();
    scheduleRecycleRemoteAutomaticEligibleDevices();
    try { preloadRecycleHistoryCache({ force: true }); } catch (e) {}

    const focusSerialInputOnce = () => {
      const active = document.activeElement;
      const canTakeFocus = !active || active === document.body || active === document.documentElement;
      if (!canTakeFocus || !document.contains(serialInput) || serialInput.disabled) return;
      try { serialInput.focus({ preventScroll: true }); } catch (e) {
        try { serialInput.focus(); } catch (e2) {}
      }
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(focusSerialInputOnce, 0));
    } else {
      setTimeout(focusSerialInputOnce, 0);
    }

    // Validate before continuing.
    const guardContinue = (e) => {
      const cat = getSelected();
      if (!cat) {
        e.preventDefault();
        e.stopPropagation();
        hideRecycleSerialHelp();
        setRecycleInlineAlert(serialMsg, "Избери категория преди да продължиш.", "error");
        return;
      }
      if (categoryRequiresDeviceSelection(cat) && !hasSelectedRecycleDeviceForCategory(cat)) {
        e.preventDefault();
        e.stopPropagation();
        hideRecycleSerialHelp();
        setSerialInlineAlert("\u0418\u0437\u0431\u0435\u0440\u0438 \u043f\u043e\u043d\u0435 \u0435\u0434\u043d\u043e \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u043e.", "error", "device-required");
        return;
      }
      const r = validateRecycleSerialForSelection(cat, serialInput.value);
      if (!r.ok) {
        e.preventDefault();
        e.stopPropagation();
        setSerialInlineAlert(r.msg, r.variant === "warning" ? "warning" : "error", r.kind || "validation");
        if (String(serialInput.value || "").trim()) showRecycleSerialHelpPreview(cat);
        else hideRecycleSerialHelp();
        try { serialInput.focus(); serialInput.select?.(); } catch (e2) {}
        return;
      }

      const duplicate = getRecycleHistoryDuplicateForSerial(serialInput.value);
      if (duplicate && !consumeRecycleHistoryDuplicateOverride(duplicate.serialKey)) {
        e.preventDefault();
        e.stopPropagation();
        hideRecycleSerialHelp();
        showRecycleDuplicateWarning(serialMsg, duplicate, serialInput, continueBtn);
        return;
      }

      hideRecycleSerialHelp();
      // Store context for the next step (Material Id page).
      try {
        sessionStorage.setItem(RECYCLE_ENTRY_LAST_SERIAL_KEY, String(serialInput.value || "").trim());
        sessionStorage.setItem(RECYCLE_ENTRY_PENDING_MATERIAL_KEY, "1");
        writeRecycleEntryMaterialSnapshot(cat, serialInput.value);
      } catch (e2) {}
    };

    continueBtn.addEventListener("click", guardContinue, true);
    // Also guard form submit (e.g. Enter key).
    const form = root.querySelector("form");
    if (form) form.addEventListener("submit", guardContinue, true);
    serialInput.addEventListener("keydown", (e) => {
      if (normalizeRecycleSerialKeydown(serialInput, e)) return;
      if (e.key === "Enter") guardContinue(e);
    }, true);
    serialInput.addEventListener("focus", () => {
      try { preloadRecycleHistoryCache(); } catch (e) {}
    }, true);
    serialInput.addEventListener("input", () => {
      try { preloadRecycleHistoryCache(); } catch (e) {}
      if (serialMsg.dataset.wifiOssRecycleSerialAlertKind === "duplicate") {
        if (serialMsg.dataset.wifiOssRecycleDuplicateSerial !== normalizeRecycleHistorySerial(serialInput.value)) {
          clearSerialInlineAlert();
        } else {
          return;
        }
      }

      const cyrillicCheck = getRecycleSerialCyrillicValidation(serialInput.value);
      if (!cyrillicCheck.ok) {
        setSerialInlineAlert(cyrillicCheck.msg, "warning", cyrillicCheck.kind);
        return;
      }

      const hadCyrillicAlert = serialMsg.dataset.wifiOssRecycleSerialAlertKind === "cyrillic";
      if (!serialMsg.textContent && !hadCyrillicAlert) return;
      const cat = getSelected();
      if (!cat) {
        if (hadCyrillicAlert) clearSerialInlineAlert();
        return;
      }
      const r = validateRecycleSerialForSelection(cat, serialInput.value);
      if (r.ok) {
        clearSerialInlineAlert();
      } else if (hadCyrillicAlert) {
        setSerialInlineAlert(r.msg, r.variant === "warning" ? "warning" : "error", r.kind || "validation");
      }
    });

    return true;
  }

  function startRecycleEntryObserver() {
    installRecycleEntryStorageSync();
    const tryInject = () => {
      try { discoverRecycleHistoryTemplateFromDom(); } catch (e) {}
      const injected = injectRecycleEntryCategoryPanel();
      if (!document.getElementById(RECYCLE_ENTRY_ROOT_ID)) hideRecycleSerialHelp();
      return injected;
    };
    const obs = new MutationObserver(() => { tryInject(); });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
    tryInject();
  }

  function applyRecycleCategoryMaterialPreset(inputEl) {
    if (!inputEl) return false;
    // Don't overwrite if user already has a value.
    const existing = String(inputEl.value || "").trim();
    if (existing) return false;

    let pending = "";
    let cat = "";
    let serial = "";
    try {
      pending = String(sessionStorage.getItem(RECYCLE_ENTRY_PENDING_MATERIAL_KEY) || "");
      cat = readSelectedRecycleEntryCategory();
      serial = String(sessionStorage.getItem(RECYCLE_ENTRY_LAST_SERIAL_KEY) || "").trim();
    } catch (e) {}
    if (pending !== "1") return false;
    if (!serial) return false;

    let sapId = "";
    if (cat === "austrian") {
      if (hasSelectedRecycleMaterialSnapshotDevices(cat)) return false;
      // Austrian: PI* => 1200017460, otherwise 1200017462
      sapId = serial.toUpperCase().startsWith("PI") ? "1200017460" : "1200017462";
    } else {
      return false;
    }

    setSwapMaterialInputValue(inputEl, sapId);
    try { sessionStorage.removeItem(RECYCLE_ENTRY_PENDING_MATERIAL_KEY); } catch (e) {}
    return true;
  }

  function isRecycleStatePagePath() {
    const path = String(window.location?.pathname || "");
    return path.includes("/wflow/recycle-state/");
  }

  function getRecycleStateDthAutofillConfigForContext() {
    const selectedDeviceIds = readSelectedRecycleDeviceIdsStorage();
    if (selectedDeviceIds.length !== 1) return null;
    const deviceId = String(selectedDeviceIds[0] || "").trim();
    const config = RECYCLE_STATE_DTH_AUTOFILL_CONFIG_BY_DEVICE_ID[deviceId];
    if (!config) return null;
    if (readSelectedRecycleEntryCategory() !== config.categoryId) return null;
    return config;
  }

  function setRecycleStateInputValue(input, value) {
    if (!input) return;
    const proto = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (typeof setter === "function") setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function rememberRecycleStateDthAutofillOriginalStyles(input) {
    if (!input) return;
    if (input.dataset.wifiOssDthAutoFillOriginalStyleSaved === "1") return;
    input.dataset.wifiOssDthAutoFillOriginalStyleSaved = "1";
    input.dataset.wifiOssDthAutoFillOriginalBackground = input.style.background || "";
    input.dataset.wifiOssDthAutoFillOriginalBackgroundColor = input.style.backgroundColor || "";
    input.dataset.wifiOssDthAutoFillOriginalBackgroundImage = input.style.backgroundImage || "";
    input.dataset.wifiOssDthAutoFillOriginalBorderColor = input.style.borderColor || "";
    input.dataset.wifiOssDthAutoFillOriginalBoxShadow = input.style.boxShadow || "";
  }

  function restoreRecycleStateDthAutofillOriginalStyles(input) {
    if (!input) return;
    input.style.removeProperty("background");
    input.style.removeProperty("background-color");
    input.style.removeProperty("background-image");
    input.style.removeProperty("border-color");
    input.style.removeProperty("box-shadow");
    const originalBackground = input.dataset.wifiOssDthAutoFillOriginalBackground || "";
    const originalBackgroundColor = input.dataset.wifiOssDthAutoFillOriginalBackgroundColor || "";
    const originalBackgroundImage = input.dataset.wifiOssDthAutoFillOriginalBackgroundImage || "";
    const originalBorderColor = input.dataset.wifiOssDthAutoFillOriginalBorderColor || "";
    const originalBoxShadow = input.dataset.wifiOssDthAutoFillOriginalBoxShadow || "";
    if (originalBackground) input.style.background = originalBackground;
    if (originalBackgroundColor) input.style.backgroundColor = originalBackgroundColor;
    if (originalBackgroundImage) input.style.backgroundImage = originalBackgroundImage;
    if (originalBorderColor) input.style.borderColor = originalBorderColor;
    if (originalBoxShadow) input.style.boxShadow = originalBoxShadow;
  }

  function clearRecycleStateDthAutofillVisualState(input) {
    if (!input) return;
    restoreRecycleStateDthAutofillOriginalStyles(input);
    delete input.dataset.wifiOssDthAutoFilled;
    delete input.dataset.wifiOssDthAutoFilledValue;
  }

  function markRecycleStateDthAutofillUserTouched(root, input) {
    if (!root || !input) return;
    root.dataset.wifiOssDthAutofillUserTouched = "1";
    clearRecycleStateDthAutofillVisualState(input);
  }

  function isRecycleStateDthAutofillTrustedEvent(event) {
    return !event || event.isTrusted !== false;
  }

  function isRecycleStateDthAutofillEditingKey(event) {
    if (!event) return false;
    if (event.defaultPrevented) return false;
    const key = String(event.key || "");
    if (key === "Backspace" || key === "Delete") return true;
    if (event.ctrlKey || event.altKey || event.metaKey) return false;
    return [...key].length === 1;
  }

  function handleRecycleStateDthAutofillUserEdit(root, input, event) {
    if (!root || !input) return;
    if (!isRecycleStateDthAutofillTrustedEvent(event)) return;
    if (!input.dataset.wifiOssDthAutoFilledValue) return;
    markRecycleStateDthAutofillUserTouched(root, input);
  }

  function syncRecycleStateDthAutofillVisualState(root, input, event) {
    if (!root || !input) return;
    if (!isRecycleStateDthAutofillTrustedEvent(event)) return;
    const autoFilledValue = String(input.dataset.wifiOssDthAutoFilledValue || "").trim();
    if (!autoFilledValue) return;
    if (String(input.value || "").trim() === autoFilledValue) return;
    markRecycleStateDthAutofillUserTouched(root, input);
  }

  function attachRecycleStateDthAutofillVisualReset(root, input) {
    if (!root || !input) return;
    if (input.dataset.wifiOssDthAutoFillVisualResetBound === "1") return;
    input.dataset.wifiOssDthAutoFillVisualResetBound = "1";
    const userEdit = (event) => handleRecycleStateDthAutofillUserEdit(root, input, event);
    const sync = (event) => syncRecycleStateDthAutofillVisualState(root, input, event);
    input.addEventListener("beforeinput", userEdit);
    input.addEventListener("paste", userEdit);
    input.addEventListener("cut", userEdit);
    input.addEventListener("keydown", (event) => {
      if (isRecycleStateDthAutofillEditingKey(event)) userEdit(event);
    });
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
  }

  function markRecycleStateDthAutofilled(root, input, value) {
    if (!root || !input) return;
    rememberRecycleStateDthAutofillOriginalStyles(input);
    input.dataset.wifiOssDthAutoFilled = "1";
    input.dataset.wifiOssDthAutoFilledValue = String(value || "").trim();
    input.style.setProperty("background", "#fff2b8", "important");
    input.style.setProperty("background-color", "#fff2b8", "important");
    input.style.setProperty("background-image", "none", "important");
    input.style.setProperty("border-color", "#e2231a", "important");
    input.style.setProperty("box-shadow", "0 0 0 2px rgba(226, 35, 26, 0.20) inset", "important");
    attachRecycleStateDthAutofillVisualReset(root, input);
  }

  function focusRecycleStateInputOnce(root, input) {
    if (!root || !input) return;
    if (root.dataset.wifiOssDthAutofillFocused === "1") return;
    if (!document.contains(input) || input.disabled || input.readOnly) return;
    const active = document.activeElement;
    const canTakeFocus = !active || active === document.body || active === document.documentElement || active === input;
    if (!canTakeFocus) return;
    root.dataset.wifiOssDthAutofillFocused = "1";
    try { input.focus({ preventScroll: true }); } catch (e) {
      try { input.focus(); } catch (e2) {}
    }
  }

  function injectRecycleStateDthAutofill() {
    if (!isRecycleStatePagePath()) return false;

    const root = document.getElementById(RECYCLE_STATE_ROOT_ID);
    if (!root) return false;

    const config = getRecycleStateDthAutofillConfigForContext();
    if (!config) return true;
    if (root.dataset.wifiOssDthAutofillDone === "1") return true;

    const sourceInput = document.getElementById(config.sourceInputId);
    const targetInput = document.getElementById(config.targetInputId);
    const focusInput = document.getElementById(config.focusInputId);
    if (!sourceInput || !targetInput || !focusInput) return false;

    root.dataset.wifiOssDthAutofillDone = "1";

    const sourceValue = String(sourceInput.value || "").trim();
    if (!sourceValue) return true;
    if (String(targetInput.value || "").trim()) return true;
    if (targetInput.disabled || targetInput.readOnly) return true;

    setRecycleStateInputValue(targetInput, sourceValue);
    markRecycleStateDthAutofilled(root, targetInput, sourceValue);
    setTimeout(() => focusRecycleStateInputOnce(root, focusInput), 0);
    return true;
  }

  function startRecycleStateDthAutofillObserver() {
    if (!isRecycleStatePagePath()) return;
    if (injectRecycleStateDthAutofill()) return;

    const obs = new MutationObserver(() => {
      if (injectRecycleStateDthAutofill()) obs.disconnect();
    });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  function isRecycleStateKstb5019SelectedContext() {
    if (readSelectedRecycleEntryCategory() !== RECYCLE_STATE_KSTB5019_CATEGORY_ID) return false;
    const selectedDeviceIds = readSelectedRecycleDeviceIdsStorage();
    if (selectedDeviceIds.length !== 1) return false;
    return String(selectedDeviceIds[0] || "").trim() === RECYCLE_STATE_KSTB5019_DEVICE_ID;
  }

  function normalizeRecycleStateKstb5019MacSource(value) {
    const compact = String(value || "").trim().replace(/[\s:.-]+/g, "").toUpperCase();
    return /^[0-9A-F]{12}$/.test(compact) ? compact : "";
  }

  function formatRecycleStateKstb5019Mac(value) {
    const mac = normalizeRecycleStateKstb5019MacSource(value);
    return mac ? mac.match(/.{1,2}/g).join(":") : "";
  }

  function rememberRecycleStateKstb5019AutofillOriginalStyles(input) {
    if (!input) return;
    if (input.dataset.wifiOssKstb5019AutoFillOriginalStyleSaved === "1") return;
    input.dataset.wifiOssKstb5019AutoFillOriginalStyleSaved = "1";
    input.dataset.wifiOssKstb5019AutoFillOriginalBackground = input.style.background || "";
    input.dataset.wifiOssKstb5019AutoFillOriginalBackgroundColor = input.style.backgroundColor || "";
    input.dataset.wifiOssKstb5019AutoFillOriginalBackgroundImage = input.style.backgroundImage || "";
    input.dataset.wifiOssKstb5019AutoFillOriginalBorderColor = input.style.borderColor || "";
    input.dataset.wifiOssKstb5019AutoFillOriginalBoxShadow = input.style.boxShadow || "";
  }

  function restoreRecycleStateKstb5019AutofillOriginalStyles(input) {
    if (!input) return;
    input.style.removeProperty("background");
    input.style.removeProperty("background-color");
    input.style.removeProperty("background-image");
    input.style.removeProperty("border-color");
    input.style.removeProperty("box-shadow");
    const originalBackground = input.dataset.wifiOssKstb5019AutoFillOriginalBackground || "";
    const originalBackgroundColor = input.dataset.wifiOssKstb5019AutoFillOriginalBackgroundColor || "";
    const originalBackgroundImage = input.dataset.wifiOssKstb5019AutoFillOriginalBackgroundImage || "";
    const originalBorderColor = input.dataset.wifiOssKstb5019AutoFillOriginalBorderColor || "";
    const originalBoxShadow = input.dataset.wifiOssKstb5019AutoFillOriginalBoxShadow || "";
    if (originalBackground) input.style.background = originalBackground;
    if (originalBackgroundColor) input.style.backgroundColor = originalBackgroundColor;
    if (originalBackgroundImage) input.style.backgroundImage = originalBackgroundImage;
    if (originalBorderColor) input.style.borderColor = originalBorderColor;
    if (originalBoxShadow) input.style.boxShadow = originalBoxShadow;
  }

  function clearRecycleStateKstb5019AutofillVisualState(input) {
    if (!input) return;
    restoreRecycleStateKstb5019AutofillOriginalStyles(input);
    delete input.dataset.wifiOssKstb5019AutoFilled;
    delete input.dataset.wifiOssKstb5019AutoFilledValue;
  }

  function markRecycleStateKstb5019MacUserTouched(root, input) {
    if (!root || !input) return;
    root.dataset.wifiOssKstb5019MacUserTouched = "1";
    clearRecycleStateKstb5019AutofillVisualState(input);
  }

  function handleRecycleStateKstb5019MacUserEdit(root, input, event) {
    if (!root || !input) return;
    if (!isRecycleStateDthAutofillTrustedEvent(event)) return;
    if (!input.dataset.wifiOssKstb5019AutoFilledValue) return;
    markRecycleStateKstb5019MacUserTouched(root, input);
  }

  function syncRecycleStateKstb5019MacVisualState(root, input, event) {
    if (!root || !input) return;
    if (!isRecycleStateDthAutofillTrustedEvent(event)) return;
    const autoFilledValue = String(input.dataset.wifiOssKstb5019AutoFilledValue || "").trim();
    if (!autoFilledValue) return;
    if (String(input.value || "").trim() === autoFilledValue) return;
    markRecycleStateKstb5019MacUserTouched(root, input);
  }

  function attachRecycleStateKstb5019MacVisualReset(root, input) {
    if (!root || !input) return;
    if (input.dataset.wifiOssKstb5019AutoFillVisualResetBound === "1") return;
    input.dataset.wifiOssKstb5019AutoFillVisualResetBound = "1";
    const userEdit = (event) => handleRecycleStateKstb5019MacUserEdit(root, input, event);
    const sync = (event) => syncRecycleStateKstb5019MacVisualState(root, input, event);
    input.addEventListener("beforeinput", userEdit);
    input.addEventListener("paste", userEdit);
    input.addEventListener("cut", userEdit);
    input.addEventListener("keydown", (event) => {
      if (isRecycleStateDthAutofillEditingKey(event)) userEdit(event);
    });
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
  }

  function markRecycleStateKstb5019MacAutofilled(root, input, value) {
    if (!root || !input) return;
    rememberRecycleStateKstb5019AutofillOriginalStyles(input);
    input.dataset.wifiOssKstb5019AutoFilled = "1";
    input.dataset.wifiOssKstb5019AutoFilledValue = String(value || "").trim();
    input.style.setProperty("background", "#fff2b8", "important");
    input.style.setProperty("background-color", "#fff2b8", "important");
    input.style.setProperty("background-image", "none", "important");
    input.style.setProperty("border-color", "#e2231a", "important");
    input.style.setProperty("box-shadow", "0 0 0 2px rgba(226, 35, 26, 0.20) inset", "important");
    attachRecycleStateKstb5019MacVisualReset(root, input);
  }

  function fillRecycleStateKstb5019Mac(root) {
    if (!root) return true;
    if (root.dataset.wifiOssKstb5019MacUserTouched === "1") return true;
    if (root.dataset.wifiOssKstb5019MacAutofillDone === "1") return true;

    const sourceInput = document.getElementById(RECYCLE_STATE_SERIAL_INPUT_ID);
    const targetInput = document.getElementById(RECYCLE_STATE_MAC_INPUT_ID);
    if (!targetInput) return false;
    attachRecycleStateKstb5019MacVisualReset(root, targetInput);

    const sourceMac = normalizeRecycleStateKstb5019MacSource(sourceInput?.value);
    if (!sourceMac) return true;
    if (String(targetInput.value || "").trim()) return true;
    if (targetInput.disabled || targetInput.readOnly) return true;

    const formattedMac = formatRecycleStateKstb5019Mac(sourceMac);
    if (!formattedMac) return true;
    setRecycleStateInputValue(targetInput, formattedMac);
    markRecycleStateKstb5019MacAutofilled(root, targetInput, formattedMac);
    root.dataset.wifiOssKstb5019MacAutofillDone = "1";
    return true;
  }

  function findRecycleStateKstb5019OttOption(selectEl) {
    if (!selectEl) return null;
    const options = Array.from(selectEl.options || []);
    return options.find(opt => String(opt.textContent || "").trim().toUpperCase() === "OTT")
      || options.find(opt => String(opt.value || "").trim() === "2")
      || null;
  }

  function ensureRecycleStateKstb5019OttInfo(selectEl) {
    if (!selectEl) return null;
    const existing = document.getElementById(RECYCLE_STATE_KSTB5019_OTT_INFO_ID);
    if (existing) return existing;

    const info = document.createElement("div");
    info.id = RECYCLE_STATE_KSTB5019_OTT_INFO_ID;
    info.className = "half-row";
    info.textContent = RECYCLE_STATE_KSTB5019_OTT_INFO_TEXT;
    info.style.display = "inline-flex";
    info.style.alignItems = "center";
    info.style.boxSizing = "border-box";
    info.style.width = "auto";
    info.style.marginLeft = "8px";
    info.style.marginBottom = "8px";
    info.style.padding = "7px 10px";
    info.style.border = "1px solid #d28a1d";
    info.style.borderRadius = "6px";
    info.style.background = "#fff7e6";
    info.style.color = "#7a4300";
    info.style.fontSize = "12px";
    info.style.fontWeight = "700";
    info.style.lineHeight = "1.25";
    info.style.whiteSpace = "nowrap";
    info.setAttribute("role", "status");

    const row = selectEl.closest(".half-row") || selectEl.parentElement;
    if (row?.parentElement) {
      row.insertAdjacentElement("afterend", info);
      return info;
    }
    if (selectEl.parentElement) {
      selectEl.insertAdjacentElement("afterend", info);
      return info;
    }
    return null;
  }

  function selectRecycleStateKstb5019Ott(root) {
    if (!root) return true;
    if (root.dataset.wifiOssKstb5019OttDone === "1") return true;

    const selectEl = document.getElementById(RECYCLE_STATE_STB_PROFILE_SELECT_ID);
    if (!selectEl) return false;
    if (!selectEl.options || !selectEl.options.length) return false;

    const ottOption = findRecycleStateKstb5019OttOption(selectEl);
    if (!ottOption) {
      root.dataset.wifiOssKstb5019OttDone = "1";
      return true;
    }

    if (String(selectEl.value || "") !== String(ottOption.value || "")) {
      setChosenValue(selectEl, ottOption.value);
    } else {
      updateChosenDisplay(selectEl);
    }
    ensureRecycleStateKstb5019OttInfo(selectEl);
    root.dataset.wifiOssKstb5019OttDone = "1";
    return true;
  }

  function injectRecycleStateKstb5019XploreTvHelper() {
    if (!isRecycleStatePagePath()) return true;

    const root = document.getElementById(RECYCLE_STATE_ROOT_ID);
    if (!root) return false;

    if (!isRecycleStateKstb5019SelectedContext()) return true;

    const macDone = fillRecycleStateKstb5019Mac(root);
    const ottDone = selectRecycleStateKstb5019Ott(root);
    return macDone && ottDone;
  }

  function startRecycleStateKstb5019XploreTvHelperObserver() {
    if (!isRecycleStatePagePath()) return;

    let attempts = 0;
    const maxAttempts = 24;
    let timer = 0;
    let obs = null;

    const cleanup = () => {
      if (timer) {
        clearInterval(timer);
        timer = 0;
      }
      if (obs) {
        obs.disconnect();
        obs = null;
      }
    };

    const tryInject = () => {
      attempts += 1;
      if (injectRecycleStateKstb5019XploreTvHelper() || attempts >= maxAttempts) cleanup();
    };

    tryInject();
    if (attempts >= maxAttempts) return;

    obs = new MutationObserver(tryInject);
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
    timer = setInterval(tryInject, 250);
  }

  function isRecycleStateEx220SelectedContext() {
    if (readSelectedRecycleEntryCategory() !== "routers") return false;
    return readSelectedRecycleDeviceIdsStorage()
      .some(deviceId => RECYCLE_STATE_EX220_DEVICE_IDS.has(String(deviceId || "").trim()));
  }

  function isRecycleStateEx220SsidSuspicious(value) {
    const ssid = String(value || "").trim();
    if (!ssid) return false;
    return !ssid.toUpperCase().startsWith("A1");
  }

  function ensureRecycleStateEx220SsidWarningHost(root, serialInput, ssid1Input, ssid2Input) {
    const existing = document.getElementById(RECYCLE_STATE_EX220_SSID_WARNING_ID);
    if (existing) return existing;

    const host = document.createElement("div");
    host.id = RECYCLE_STATE_EX220_SSID_WARNING_ID;
    host.className = "half-row";
    host.style.display = "none";
    host.style.boxSizing = "border-box";
    host.style.minHeight = "25px";
    host.style.marginBottom = "10px";

    const serialRow = serialInput?.closest(".half-row") || serialInput?.parentElement;
    const recycleFieldset = serialInput?.closest("fieldset");
    if (recycleFieldset && serialRow && serialRow.parentElement === recycleFieldset) {
      serialRow.insertAdjacentElement("afterend", host);
      return host;
    }

    const ssidRow = ssid2Input?.closest(".half-row") || ssid1Input?.closest(".half-row");
    if (ssidRow?.parentElement) {
      ssidRow.insertAdjacentElement("afterend", host);
      return host;
    }

    const fallbackParent = ssid1Input?.closest("fieldset") || root;
    fallbackParent.appendChild(host);
    return host;
  }

  function injectRecycleStateEx220SsidWarning() {
    if (!isRecycleStatePagePath()) return false;

    const root = document.getElementById(RECYCLE_STATE_ROOT_ID);
    if (!root) return false;

    const ssid1Input = document.getElementById(RECYCLE_STATE_SSID1_INPUT_ID);
    const ssid2Input = document.getElementById(RECYCLE_STATE_SSID2_INPUT_ID);
    if (!ssid1Input || !ssid2Input) return false;

    const serialInput = document.getElementById(RECYCLE_STATE_SERIAL_INPUT_ID);
    let warningHost = document.getElementById(RECYCLE_STATE_EX220_SSID_WARNING_ID);
    if (isRecycleStateEx220SelectedContext()) {
      warningHost = ensureRecycleStateEx220SsidWarningHost(root, serialInput, ssid1Input, ssid2Input);
    }

    const evaluate = () => {
      if (!warningHost) return;
      if (!isRecycleStateEx220SelectedContext()) {
        clearRecycleInlineAlert(warningHost);
        return;
      }

      const suspicious = [ssid1Input.value, ssid2Input.value].some(isRecycleStateEx220SsidSuspicious);
      if (suspicious) {
        setRecycleInlineAlert(warningHost, RECYCLE_STATE_EX220_SSID_WARNING_TEXT, "warning");
      } else {
        clearRecycleInlineAlert(warningHost);
      }
    };

    if (warningHost && warningHost.dataset.wifiOssEx220SsidWarningBound !== "1") {
      warningHost.dataset.wifiOssEx220SsidWarningBound = "1";
      ssid1Input.addEventListener("input", evaluate);
      ssid1Input.addEventListener("change", evaluate);
      ssid2Input.addEventListener("input", evaluate);
      ssid2Input.addEventListener("change", evaluate);
    }

    evaluate();
    return true;
  }

  function startRecycleStateEx220SsidWarningObserver() {
    if (!isRecycleStatePagePath()) return;
    if (injectRecycleStateEx220SsidWarning()) return;

    const obs = new MutationObserver(() => {
      if (injectRecycleStateEx220SsidWarning()) obs.disconnect();
    });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  const AFTER_RECYCLE_CAPTURE_SN_BTN_ID = "_wflowSavedTestPictureList_captureSn";
  const AFTER_RECYCLE_CAPTURE_SN_LABEL = "СНИМКА НА S/N";

  function relabelAfterRecycleCaptureSnButton() {
    const btn = document.getElementById(AFTER_RECYCLE_CAPTURE_SN_BTN_ID);
    if (!btn) return false;

    const icon = btn.querySelector("span");
    const nodes = Array.from(btn.childNodes);
    const startIndex = icon ? nodes.indexOf(icon) + 1 : 0;
    const textNode = nodes
      .slice(Math.max(startIndex, 0))
      .find(node => node.nodeType === Node.TEXT_NODE && String(node.nodeValue || "").trim());

    if (textNode) {
      if (textNode.nodeValue !== AFTER_RECYCLE_CAPTURE_SN_LABEL) {
        textNode.nodeValue = AFTER_RECYCLE_CAPTURE_SN_LABEL;
      }
    } else if (icon && icon.nextSibling) {
      btn.insertBefore(document.createTextNode(AFTER_RECYCLE_CAPTURE_SN_LABEL), icon.nextSibling);
    } else {
      btn.appendChild(document.createTextNode(AFTER_RECYCLE_CAPTURE_SN_LABEL));
    }

    return true;
  }

  function startAfterRecycleCaptureSnLabelObserver() {
    const path = String(window.location?.pathname || "");
    if (!path.includes("/wflow/after-recycle-state/")) return;
    if (relabelAfterRecycleCaptureSnButton()) return;

    const obs = new MutationObserver(() => {
      if (relabelAfterRecycleCaptureSnButton()) obs.disconnect();
    });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  loadLastClipboardText();
  restoreRecycleRemoteDebugSessionState();
  injectButton();
  startLabelsObservers();
  startSwapMaterialObserver();
  startSwapMaterialDashboardPolling();
  startDeviceFunctionsObserver();
  startRecycleEntryObserver();
  startCamModulesOperationHintObserver();
  startRecycleStateDthAutofillObserver();
  startRecycleStateKstb5019XploreTvHelperObserver();
  startRecycleStateEx220SsidWarningObserver();
  startAfterRecycleCaptureSnLabelObserver();
})();
