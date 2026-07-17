(function attachBbsAssistantMacSearch(global) {
  "use strict";

  const namespace = global.BbsAssistant || {};
  const SEPARATED_MAC_PATTERN =
    /\b[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}\b|\b[0-9A-Fa-f]{2}(?:-[0-9A-Fa-f]{2}){5}\b|\b[0-9A-Fa-f]{2}(?:\s[0-9A-Fa-f]{2}){5}\b/g;
  const PLAIN_MAC_PATTERN = /\b[0-9A-Fa-f]{12}\b/g;

  function normalizeMac(value) {
    return String(value || "")
      .replace(/[^0-9A-Fa-f]/g, "")
      .toUpperCase();
  }

  function isCompleteMac(normalizedValue) {
    return /^[0-9A-F]{12}$/.test(normalizedValue || "");
  }

  function hasMacContext(text, index) {
    const start = Math.max(0, index - 16);
    const context = text.slice(start, index + 16);
    return /\bMAC\b\s*[:=]?/i.test(context);
  }

  function pushUniqueCandidate(candidates, seen, value, index, source) {
    const normalized = normalizeMac(value);

    if (!isCompleteMac(normalized)) {
      return;
    }

    const key = `${normalized}:${index}:${source}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    candidates.push({
      raw: value,
      normalized,
      index,
      source
    });
  }

  function extractMacCandidates(text) {
    const value = String(text || "");
    const candidates = [];
    const seen = new Set();
    let match;

    SEPARATED_MAC_PATTERN.lastIndex = 0;
    while ((match = SEPARATED_MAC_PATTERN.exec(value))) {
      pushUniqueCandidate(candidates, seen, match[0], match.index, "separated");
    }

    PLAIN_MAC_PATTERN.lastIndex = 0;
    while ((match = PLAIN_MAC_PATTERN.exec(value))) {
      if (hasMacContext(value, match.index)) {
        pushUniqueCandidate(candidates, seen, match[0], match.index, "plain-with-context");
      }
    }

    return candidates.sort((left, right) => left.index - right.index);
  }

  function shouldSkipTextParent(element) {
    return Boolean(
      element &&
        typeof element.closest === "function" &&
        element.closest(".bbs-assistant-panel, script, style, noscript")
    );
  }

  function collectTextNodes(documentRef) {
    const root = documentRef && (documentRef.body || documentRef.documentElement);
    const nodeFilter = global.NodeFilter || {
      FILTER_ACCEPT: 1,
      FILTER_REJECT: 2,
      SHOW_TEXT: 4
    };

    if (!root || typeof documentRef.createTreeWalker !== "function") {
      return [];
    }

    const walker = documentRef.createTreeWalker(root, nodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return shouldSkipTextParent(node.parentElement)
          ? nodeFilter.FILTER_REJECT
          : nodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    return nodes;
  }

  function findBestResultContainer(element) {
    return namespace.findNearestContainer(element);
  }

  function getInputValue(element) {
    return namespace.getAttributeValue(element, "value").trim();
  }

  function findContractId(container, sourceElement) {
    const searchRoots = namespace.uniqueElements([container, sourceElement]);

    for (const root of searchRoots) {
      for (const input of namespace.safeQuerySelectorAll(root, "input[id^=\"CS_CID_\"], input[name^=\"CS_CID_\"]")) {
        const value = getInputValue(input);

        if (/^\d+$/.test(value)) {
          return value;
        }
      }
    }

    return "";
  }

  function findExpandGuide(documentRef, container, sourceElement) {
    const contractId = findContractId(container, sourceElement);

    if (!contractId || !documentRef) {
      return null;
    }

    const control = namespace.safeQuerySelector(documentRef, `#ExpandContract_${contractId}`);

    if (!control) {
      return null;
    }

    const target = namespace.findNearestContainer(control) || control;
    const visibility = namespace.getElementVisibility
      ? namespace.getElementVisibility(target)
      : { isVisible: true };

    if (!visibility.isVisible) {
      return null;
    }

    return {
      contractId,
      control,
      target
    };
  }

  function getResultVisibility(container, sourceElement) {
    const target = container || sourceElement;

    if (!namespace.getElementVisibility) {
      return {
        isVisible: true,
        visibilityReason: ""
      };
    }

    const visibility = namespace.getElementVisibility(target);
    return {
      isVisible: visibility.isVisible,
      visibilityReason: visibility.reason
    };
  }

  function getHiddenResultGuide(documentRef, container, sourceElement, visibility) {
    if (visibility.isVisible) {
      return null;
    }

    return findExpandGuide(documentRef, container, sourceElement);
  }

  function summarizeResults(results) {
    const visibleCount = results.filter((result) => result.isVisible).length;

    return {
      totalCount: results.length,
      visibleCount,
      hiddenCount: results.length - visibleCount
    };
  }

  function createSearchResult(status, query, results, extra) {
    const summary = summarizeResults(results || []);

    return {
      status,
      query,
      results: results || [],
      ...summary,
      ...(extra || {})
    };
  }

  function addResult(results, candidate, sourceElement, sourceKind, documentRef) {
    const container = findBestResultContainer(sourceElement);
    const alreadyFound = results.some((result) => {
      return result.normalized === candidate.normalized && result.container === (container || sourceElement);
    });

    if (alreadyFound) {
      return;
    }

    const visibility = getResultVisibility(container, sourceElement);

    results.push({
      normalized: candidate.normalized,
      raw: candidate.raw,
      sourceElement,
      container: container || sourceElement,
      sourceKind,
      ...visibility,
      expandGuide: getHiddenResultGuide(documentRef, container, sourceElement, visibility)
    });
  }

  function addTextResult(results, matchText, sourceElement, index, documentRef) {
    const container = findBestResultContainer(sourceElement);
    const targetContainer = container || sourceElement;
    const alreadyFound = results.some((result) => result.container === targetContainer);

    if (alreadyFound) {
      return;
    }

    const visibility = getResultVisibility(container, sourceElement);

    results.push({
      raw: matchText,
      index,
      sourceElement,
      container: targetContainer,
      sourceKind: "text",
      ...visibility,
      expandGuide: getHiddenResultGuide(documentRef, container, sourceElement, visibility)
    });
  }

  function searchMacAddress(query, documentRef) {
    const rawQuery = String(query || "");
    const normalizedQuery = normalizeMac(query);
    const documentToSearch = documentRef || global.document;

    if (!isCompleteMac(normalizedQuery)) {
      return createSearchResult(rawQuery.trim() ? "invalid" : "empty", query, [], {
        normalizedQuery
      });
    }

    if (!documentToSearch) {
      return createSearchResult("no-document", query, [], {
        normalizedQuery
      });
    }

    const results = [];

    for (const textNode of collectTextNodes(documentToSearch)) {
      const parent = textNode.parentElement;

      for (const candidate of extractMacCandidates(textNode.nodeValue)) {
        if (candidate.normalized === normalizedQuery) {
          addResult(results, candidate, parent, "text", documentToSearch);
        }
      }
    }

    for (const link of namespace.safeQuerySelectorAll(documentToSearch, "a[href]")) {
      if (namespace.isInsideAssistantPanel(link)) {
        continue;
      }

      const href = namespace.getAttributeValue(link, "href");
      for (const candidate of extractMacCandidates(href)) {
        if (candidate.normalized === normalizedQuery) {
          addResult(results, candidate, link, "link", documentToSearch);
        }
      }
    }

    return createSearchResult(results.length > 0 ? "found" : "not-found", query, results, {
      normalizedQuery
    });
  }

  function normalizeSearchText(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function searchText(query, documentRef) {
    const normalizedQuery = normalizeSearchText(query);
    const documentToSearch = documentRef || global.document;

    if (!normalizedQuery) {
      return createSearchResult("empty", query, []);
    }

    if (!documentToSearch) {
      return createSearchResult("no-document", query, []);
    }

    const results = [];

    for (const textNode of collectTextNodes(documentToSearch)) {
      const parent = textNode.parentElement;
      const value = String(textNode.nodeValue || "");
      const index = value.toLocaleLowerCase().indexOf(normalizedQuery);

      if (index !== -1) {
        addTextResult(results, value, parent, index, documentToSearch);
      }
    }

    return createSearchResult(results.length > 0 ? "found" : "not-found", query, results, {
      normalizedQuery
    });
  }

  global.BbsAssistant = {
    ...namespace,
    extractMacCandidates,
    findBestResultContainer,
    isCompleteMac,
    normalizeMac,
    searchMacAddress,
    searchText
  };
})(typeof window !== "undefined" ? window : globalThis);

