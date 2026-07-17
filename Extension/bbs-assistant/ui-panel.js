(function attachBbsAssistantPanel(global) {
  "use strict";

  const namespace = global.BbsAssistant || {};
  const PANEL_ID = "bbs-assistant-panel";
  const HIGHLIGHT_CLASS = "bbs-assistant-highlight";
  const ACTIVE_CLASS = "bbs-assistant-highlight-active";
  const EXPAND_GUIDE_CLASS = "bbs-assistant-expand-guide";
  const EXPAND_GUIDE_CONTROL_CLASS = "bbs-assistant-expand-guide-control";
  const DEFAULT_COUNT_TEXT = "Няма търсене";
  const DEFAULT_STATUS_TEXT = "Въведете MAC адрес или изберете Text режим за търсене в текущата страница.";
  const INVALID_MAC_TEXT = "Невалиден MAC. Въведете 12 hex символа, със или без разделители.";
  const ZERO_RESULTS_TEXT = "Няма намерени резултати в текущо заредената страница.";
  const HIDDEN_RESULT_TEXT = "Резултатът е в скрито/сгънато съдържание.";
  const COLLAPSED_CONTRACT_TEXT = "Резултатът е в сгънат договор. Разгънете маркираното плюсче (+) ръчно.";

  const REVEAL_SUCCESS_TEXT = "Договорът е разгънат. Показан е намереният резултат.";
  const REVEAL_FALLBACK_TEXT = "Договорът беше разгънат, но резултатът още не е видим. Проверете секцията ръчно.";
  const REVEAL_UNAVAILABLE_TEXT = "Автоматичното разгъване не е налично за този резултат. Използвайте маркираното плюсче.";

  function createButton(documentRef, label, title) {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = "bbs-assistant-button";
    button.textContent = label;
    button.title = title;
    return button;
  }

  function createModeOption(documentRef, value, label) {
    const option = documentRef.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function clearHighlights(state) {
    for (const element of state.highlightedElements) {
      if (element && element.classList) {
        element.classList.remove(HIGHLIGHT_CLASS, ACTIVE_CLASS);
      }
    }

    state.highlightedElements = [];

    for (const element of state.guidedElements) {
      if (element && element.classList) {
        element.classList.remove(EXPAND_GUIDE_CLASS, EXPAND_GUIDE_CONTROL_CLASS);
      }
    }

    state.guidedElements = [];
  }

  function markGuidanceElement(state, element, className) {
    if (!element || !element.classList) {
      return;
    }

    element.classList.add(className);
    state.guidedElements.push(element);
  }

  function applyExpandGuidance(state, result) {
    const guide = result && result.expandGuide;

    if (!guide) {
      return null;
    }

    markGuidanceElement(state, guide.target, EXPAND_GUIDE_CLASS);
    markGuidanceElement(state, guide.control, EXPAND_GUIDE_CONTROL_CLASS);

    return guide.target || guide.control || null;
  }

  function getControlSrc(control) {
    if (!control) {
      return "";
    }

    return String(namespace.getAttributeValue(control, "src") || control.src || "").toLowerCase();
  }

  function getRevealTarget(state) {
    const activeResult = state.results[state.activeIndex];
    const guide = activeResult && activeResult.expandGuide;

    if (!activeResult || activeResult.isVisible !== false || !guide || !guide.contractId || !guide.control) {
      return null;
    }

    const contractId = String(guide.contractId);
    if (!/^\d+$/.test(contractId)) {
      return null;
    }

    const matches = namespace.safeQuerySelectorAll(state.documentRef, `#ExpandContract_${contractId}`);
    if (matches.length !== 1 || matches[0] !== guide.control) {
      return null;
    }

    const control = matches[0];
    if (String(control.tagName || "").toUpperCase() !== "IMG") {
      return null;
    }

    const src = getControlSrc(control);
    if (!src.includes("plusbox.gif") || src.includes("minusbox.gif") || typeof control.click !== "function") {
      return null;
    }

    return {
      control,
      result: activeResult
    };
  }

  function setActiveResult(state, index) {
    state.activeIndex = index;
    state.highlightedElements = [];

    state.results.forEach((result, resultIndex) => {
      const container = result.container;
      if (!container || !container.classList) {
        return;
      }

      container.classList.add(HIGHLIGHT_CLASS);
      container.classList.toggle(ACTIVE_CLASS, resultIndex === state.activeIndex);
      state.highlightedElements.push(container);
    });

    const activeResult = state.results[state.activeIndex];
    const guideTarget =
      activeResult && activeResult.isVisible === false
        ? applyExpandGuidance(state, activeResult)
        : null;

    if (guideTarget && typeof guideTarget.scrollIntoView === "function") {
      guideTarget.scrollIntoView({
        block: "center",
        behavior: "smooth"
      });
      return activeResult || null;
    }

    if (
      activeResult &&
      activeResult.isVisible !== false &&
      activeResult.container &&
      typeof activeResult.container.scrollIntoView === "function"
    ) {
      activeResult.container.scrollIntoView({
        block: "center",
        behavior: "smooth"
      });
    }

    return activeResult || null;
  }

  function updateButtons(state) {
    const hasMultipleResults = state.results.length > 1;
    state.previousButton.disabled = !hasMultipleResults;
    state.nextButton.disabled = !hasMultipleResults;
    updateRevealButton(state);
  }

  function updateRevealButton(state) {
    if (!state.revealButton) {
      return;
    }

    const revealTarget = getRevealTarget(state);
    state.revealButton.hidden = !revealTarget;
    state.revealButton.disabled = !revealTarget;
  }

  function updateStatus(state, text, isError) {
    state.statusElement.textContent = text;
    state.statusElement.classList.toggle("bbs-assistant-status-error", Boolean(isError));
  }

  function formatCount(searchResult) {
    const total = searchResult.totalCount ?? searchResult.results.length;
    const hidden = searchResult.hiddenCount || 0;
    const visible = searchResult.visibleCount ?? total;
    const resultLabel = total === 1 ? "1 резултат" : `${total} резултата`;

    if (hidden > 0) {
      return `${resultLabel} (${visible} видими, ${hidden} скрити)`;
    }

    return resultLabel;
  }

  function setHelpVisible(state, isVisible) {
    state.helpPopover.setAttribute("aria-hidden", isVisible ? "false" : "true");
    state.helpButton.setAttribute("aria-expanded", isVisible ? "true" : "false");
  }

  function toggleHelp(state) {
    setHelpVisible(state, state.helpPopover.getAttribute("aria-hidden") !== "false");
  }

  function setPanelMinimized(state, isMinimized) {
    state.isMinimized = Boolean(isMinimized);
    state.panel.classList.toggle("bbs-assistant-panel-minimized", state.isMinimized);
    state.panelBody.setAttribute("aria-hidden", state.isMinimized ? "true" : "false");
    state.minimizeButton.textContent = state.isMinimized ? "+" : "-";
    state.minimizeButton.title = state.isMinimized ? "Покажи панела" : "Свий панела";
    state.minimizeButton.setAttribute(
      "aria-label",
      state.isMinimized ? "Покажи BBS Assistant панела" : "Свий BBS Assistant панела"
    );
    state.minimizeButton.setAttribute("aria-expanded", state.isMinimized ? "false" : "true");

    if (state.isMinimized) {
      setHelpVisible(state, false);
    }
  }

  function togglePanelMinimized(state) {
    setPanelMinimized(state, !state.isMinimized);
  }

  function resetPanelState(state) {
    clearHighlights(state);
    state.input.value = "";
    state.results = [];
    state.activeIndex = 0;
    state.lastSearchResult = null;
    state.countElement.textContent = DEFAULT_COUNT_TEXT;
    updateStatus(state, DEFAULT_STATUS_TEXT, false);
    updateButtons(state);
    setHelpVisible(state, false);
  }

  function getMode(state) {
    return state.modeSelect.value === "text" ? "text" : "mac";
  }

  function getSearchResult(state) {
    const value = state.input.value;
    return getMode(state) === "text"
      ? namespace.searchText(value, state.documentRef)
      : namespace.searchMacAddress(value, state.documentRef);
  }

  function updateInputForMode(state) {
    if (getMode(state) === "text") {
      state.input.placeholder = "Text";
      state.input.setAttribute("aria-label", "Text search");
      return;
    }

    state.input.placeholder = "MAC address";
    state.input.setAttribute("aria-label", "MAC address");
  }

  function getActiveResultMessage(state, searchResult) {
    const activeResult = state.results[state.activeIndex];

    if (activeResult && activeResult.isVisible === false && activeResult.expandGuide) {
      return COLLAPSED_CONTRACT_TEXT;
    }

    if (activeResult && activeResult.isVisible === false) {
      return HIDDEN_RESULT_TEXT;
    }

    const hidden = searchResult.hiddenCount || 0;
    const base = `Показан е резултат ${state.activeIndex + 1} от ${state.results.length}.`;

    if (hidden > 0) {
      const label = hidden === 1 ? "1 скрит/сгънат резултат" : `${hidden} скрити/сгънати резултата`;
      return `${base} ${label} може да изисква ръчно разгъване.`;
    }

    return base;
  }

  function renderSearchResults(state, searchResult) {
    setHelpVisible(state, false);
    clearHighlights(state);
    state.results = searchResult.results;
    state.activeIndex = 0;
    state.lastSearchResult = searchResult;

    if (searchResult.status === "empty") {
      updateStatus(state, DEFAULT_STATUS_TEXT, false);
      state.countElement.textContent = DEFAULT_COUNT_TEXT;
      updateButtons(state);
      return;
    }

    if (searchResult.status === "invalid") {
      updateStatus(state, INVALID_MAC_TEXT, true);
      state.countElement.textContent = "0 резултата";
      updateButtons(state);
      return;
    }

    if (state.results.length === 0) {
      updateStatus(state, ZERO_RESULTS_TEXT, false);
      state.countElement.textContent = "0 резултата";
      updateButtons(state);
      return;
    }

    setActiveResult(state, 0);
    state.countElement.textContent = formatCount(searchResult);
    updateStatus(state, getActiveResultMessage(state, searchResult), false);
    updateButtons(state);
  }

  function runSearch(state) {
    renderSearchResults(state, getSearchResult(state));
  }

  function rerenderPreferredResult(state, preferredIndex) {
    renderSearchResults(state, getSearchResult(state));

    if (state.results.length > 0 && preferredIndex > 0 && preferredIndex < state.results.length) {
      clearHighlights(state);
      setActiveResult(state, preferredIndex);
      updateStatus(state, getActiveResultMessage(state, state.lastSearchResult || { hiddenCount: 0 }), false);
      updateButtons(state);
    }

    return state.results[state.activeIndex] || null;
  }

  function revealActiveResult(state) {
    const revealTarget = getRevealTarget(state);
    const preferredIndex = state.activeIndex;

    if (!revealTarget) {
      updateRevealButton(state);
      updateStatus(state, REVEAL_UNAVAILABLE_TEXT, true);
      return;
    }

    revealTarget.control.click();

    const activeResult = rerenderPreferredResult(state, preferredIndex);
    if (activeResult && activeResult.isVisible !== false) {
      updateStatus(state, REVEAL_SUCCESS_TEXT, false);
      updateButtons(state);
      return;
    }

    updateStatus(state, REVEAL_FALLBACK_TEXT, false);
    updateButtons(state);
  }

  function moveResult(state, offset) {
    if (state.results.length < 2) {
      return;
    }

    clearHighlights(state);
    const nextIndex = (state.activeIndex + offset + state.results.length) % state.results.length;
    setActiveResult(state, nextIndex);
    updateStatus(state, getActiveResultMessage(state, state.lastSearchResult || { hiddenCount: 0 }), false);
    updateButtons(state);
  }

  function mountAssistantPanel(options) {
    const documentRef = (options && options.documentRef) || global.document;

    if (!documentRef || documentRef.getElementById(PANEL_ID)) {
      return null;
    }

    const panel = documentRef.createElement("section");
    panel.id = PANEL_ID;
    panel.className = "bbs-assistant-panel";
    panel.setAttribute("aria-label", "BBS Assistant");

    const titleRow = documentRef.createElement("div");
    titleRow.className = "bbs-assistant-title-row";

    const title = documentRef.createElement("strong");
    title.className = "bbs-assistant-title";
    title.textContent = "BBS Assistant";

    const badge = documentRef.createElement("span");
    badge.className = "bbs-assistant-badge";
    badge.textContent = "read-only";

    const headerActions = documentRef.createElement("div");
    headerActions.className = "bbs-assistant-header-actions";

    const minimizeButton = createButton(documentRef, "-", "Свий панела");
    minimizeButton.className = "bbs-assistant-button bbs-assistant-icon-button bbs-assistant-minimize-button";
    minimizeButton.setAttribute("aria-label", "Свий BBS Assistant панела");
    minimizeButton.setAttribute("aria-expanded", "true");

    const helpButton = createButton(documentRef, "?", "Помощ");
    helpButton.className = "bbs-assistant-button bbs-assistant-icon-button bbs-assistant-help-button";
    helpButton.setAttribute("aria-label", "Помощ за BBS Assistant");
    helpButton.setAttribute("aria-expanded", "false");

    headerActions.append(minimizeButton, helpButton, badge);
    titleRow.append(title, headerActions);

    const panelBody = documentRef.createElement("div");
    panelBody.className = "bbs-assistant-panel-body";
    panelBody.setAttribute("aria-hidden", "false");

    const helpPopover = documentRef.createElement("div");
    helpPopover.className = "bbs-assistant-help-popover";
    helpPopover.setAttribute("aria-hidden", "true");
    helpPopover.textContent =
      "READ-ONLY: extension-ът не клика автоматично, не изпраща заявки и не променя данни в BBS. " +
      "MAC режим приема MAC с или без разделители. Text режим търси текст в текущо заредената страница. " +
      "Търсенето работи само върху текущия DOM. При резултат в сгънат договор се показва къде да разгънете; бутонът Разгъни е ръчно потвърдено действие само за маркираното плюсче.";

    const input = documentRef.createElement("input");
    input.className = "bbs-assistant-input";
    input.type = "text";
    input.inputMode = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "MAC address";
    input.setAttribute("aria-label", "MAC address");

    const modeRow = documentRef.createElement("div");
    modeRow.className = "bbs-assistant-mode-row";

    const modeLabel = documentRef.createElement("label");
    modeLabel.className = "bbs-assistant-mode-label";
    modeLabel.textContent = "Mode";

    const modeSelect = documentRef.createElement("select");
    modeSelect.className = "bbs-assistant-mode-select";
    modeSelect.setAttribute("aria-label", "Search mode");
    modeSelect.append(createModeOption(documentRef, "mac", "MAC"), createModeOption(documentRef, "text", "Text"));
    modeSelect.value = "mac";
    modeRow.append(modeLabel, modeSelect);

    const controls = documentRef.createElement("div");
    controls.className = "bbs-assistant-controls";

    const previousButton = createButton(documentRef, "Prev", "Previous result");
    const clearButton = createButton(documentRef, "Clear", "Изчисти търсенето");
    const revealButton = createButton(documentRef, "Разгъни", "Разгъни маркирания договор");
    revealButton.className = "bbs-assistant-button bbs-assistant-reveal-button";
    revealButton.hidden = true;
    revealButton.disabled = true;
    const nextButton = createButton(documentRef, "Next", "Next result");
    controls.append(previousButton, clearButton, revealButton, nextButton);

    const countElement = documentRef.createElement("div");
    countElement.className = "bbs-assistant-count";
    countElement.textContent = DEFAULT_COUNT_TEXT;

    const statusElement = documentRef.createElement("div");
    statusElement.className = "bbs-assistant-status";
    statusElement.textContent = DEFAULT_STATUS_TEXT;

    panelBody.append(helpPopover, modeRow, input, controls, countElement, statusElement);
    panel.append(titleRow, panelBody);
    documentRef.body.append(panel);

    const state = {
      activeIndex: 0,
      clearButton,
      countElement,
      documentRef,
      guidedElements: [],
      helpButton,
      helpPopover,
      highlightedElements: [],
      input,
      isMinimized: false,
      lastSearchResult: null,
      minimizeButton,
      modeSelect,
      nextButton,
      panel,
      panelBody,
      previousButton,
      revealButton,
      results: [],
      statusElement
    };

    minimizeButton.addEventListener("click", () => togglePanelMinimized(state));
    helpButton.addEventListener("click", () => toggleHelp(state));
    input.addEventListener("input", () => runSearch(state));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        runSearch(state);
      }
    });
    modeSelect.addEventListener("change", () => {
      updateInputForMode(state);
      runSearch(state);
    });
    previousButton.addEventListener("click", () => moveResult(state, -1));
    clearButton.addEventListener("click", () => resetPanelState(state));
    revealButton.addEventListener("click", () => revealActiveResult(state));
    nextButton.addEventListener("click", () => moveResult(state, 1));
    updateInputForMode(state);
    updateButtons(state);

    return {
      panel,
      runSearch: () => runSearch(state),
      state
    };
  }

  global.BbsAssistant = {
    ...namespace,
    mountAssistantPanel
  };
})(typeof window !== "undefined" ? window : globalThis);

