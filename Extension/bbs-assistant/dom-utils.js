(function attachBbsAssistantDomUtils(global) {
  "use strict";

  const namespace = global.BbsAssistant || {};

  function toArray(value) {
    return Array.prototype.slice.call(value || []);
  }

  function safeQuerySelector(documentRef, selector) {
    try {
      return documentRef.querySelector(selector);
    } catch (_error) {
      return null;
    }
  }

  function safeQuerySelectorAll(documentRef, selector) {
    try {
      return toArray(documentRef.querySelectorAll(selector));
    } catch (_error) {
      return [];
    }
  }

  function getDocumentText(documentRef) {
    const root = documentRef && (documentRef.body || documentRef.documentElement);
    return root && typeof root.textContent === "string" ? root.textContent : "";
  }

  function countSelector(documentRef, selector) {
    return safeQuerySelectorAll(documentRef, selector).length;
  }

  function hasSelector(documentRef, selector) {
    return Boolean(safeQuerySelector(documentRef, selector));
  }

  function getAttributeValue(element, name) {
    if (!element || typeof element.getAttribute !== "function") {
      return "";
    }

    return element.getAttribute(name) || "";
  }

  function getFrameElement(documentRef) {
    try {
      return documentRef.defaultView && documentRef.defaultView.frameElement;
    } catch (_error) {
      return null;
    }
  }

  function isHiddenFrameDocument(documentRef) {
    const frameElement = getFrameElement(documentRef);

    if (!frameElement || typeof frameElement.getAttribute !== "function") {
      return false;
    }

    const width = frameElement.getAttribute("width");
    const height = frameElement.getAttribute("height");
    const style = (frameElement.getAttribute("style") || "").toLowerCase();

    return (width === "0" || height === "0") && style.includes("display:none");
  }

  function isFramesetDocument(documentRef) {
    return hasSelector(documentRef, "frameset") && !documentRef.body;
  }

  function isInsideAssistantPanel(element) {
    return Boolean(
      element &&
        typeof element.closest === "function" &&
        element.closest(".bbs-assistant-panel")
    );
  }

  function getInlineVisibilityReason(element) {
    if (!element || typeof element.getAttribute !== "function") {
      return "";
    }

    if (element.getAttribute("hidden") !== null) {
      return "hidden-attribute";
    }

    if ((element.getAttribute("aria-hidden") || "").toLowerCase() === "true") {
      return "aria-hidden";
    }

    const style = (element.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
    if (style.includes("display:none")) {
      return "display-none";
    }

    if (style.includes("visibility:hidden") || style.includes("visibility:collapse")) {
      return "visibility-hidden";
    }

    return "";
  }

  function getComputedVisibilityReason(element) {
    const ownerDocument = element && element.ownerDocument;
    const view = (ownerDocument && ownerDocument.defaultView) || global;

    if (!view || typeof view.getComputedStyle !== "function") {
      return "";
    }

    try {
      const style = view.getComputedStyle(element);

      if (!style) {
        return "";
      }

      if (style.display === "none") {
        return "display-none";
      }

      if (style.visibility === "hidden" || style.visibility === "collapse") {
        return "visibility-hidden";
      }
    } catch (_error) {
      return "";
    }

    return "";
  }

  function getElementVisibility(element) {
    let current = element;

    while (current && current.nodeType !== 9) {
      const inlineReason = getInlineVisibilityReason(current);
      if (inlineReason) {
        return {
          isVisible: false,
          reason: inlineReason
        };
      }

      const computedReason = getComputedVisibilityReason(current);
      if (computedReason) {
        return {
          isVisible: false,
          reason: computedReason
        };
      }

      current = current.parentElement;
    }

    return {
      isVisible: true,
      reason: ""
    };
  }

  function isElementVisible(element) {
    return getElementVisibility(element).isVisible;
  }

  function findNearestContainer(element) {
    if (!element || typeof element.closest !== "function") {
      return element || null;
    }

    return (
      element.closest("tr") ||
      element.closest("li") ||
      element.closest("div") ||
      element.closest("td") ||
      element
    );
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements.filter(Boolean)));
  }

  global.BbsAssistant = {
    ...namespace,
    countSelector,
    findNearestContainer,
    getAttributeValue,
    getDocumentText,
    getElementVisibility,
    hasSelector,
    isElementVisible,
    isFramesetDocument,
    isHiddenFrameDocument,
    isInsideAssistantPanel,
    safeQuerySelector,
    safeQuerySelectorAll,
    toArray,
    uniqueElements
  };
})(typeof window !== "undefined" ? window : globalThis);

