(function attachBbsAssistantPageDetector(global) {
  "use strict";

  const namespace = global.BbsAssistant || {};

  function hasAny(documentRef, selectors) {
    return selectors.some((selector) => namespace.hasSelector(documentRef, selector));
  }

  function countAny(documentRef, selectors) {
    return selectors.reduce((total, selector) => total + namespace.countSelector(documentRef, selector), 0);
  }

  function getElements(documentRef, selector) {
    return namespace.safeQuerySelectorAll(documentRef, selector);
  }

  function hasElementAttributeContaining(documentRef, selector, attribute, fragments) {
    return getElements(documentRef, selector).some((element) => {
      const value = namespace.getAttributeValue(element, attribute);
      return fragments.some((fragment) => value.includes(fragment));
    });
  }

  function detectSearchPage(documentRef) {
    const reasons = [];
    const hasResidentialSearch =
      namespace.hasSelector(documentRef, "#_clients.listControl") &&
      namespace.hasSelector(documentRef, "button#_clients_get[name=\"get\"]");
    const hasItsSearch =
      namespace.hasSelector(documentRef, "#_itsClientSearch.listControl") &&
      namespace.hasSelector(documentRef, "button#_itsClientSearch_find[name=\"find\"]");
    const searchFieldCount = countAny(documentRef, [
      "#_clients_ClientCode",
      "#_clients_ContractCode",
      "#_clients_Mac",
      "#_clients_SerialNo",
      "#_clients_Device",
      "#_clients_MSISDN"
    ]);
    const hasTabs = hasAny(documentRef, ["#generalDivTabs", "#clientsTab", "#itsClientsTab"]);

    if (hasResidentialSearch || hasItsSearch) {
      reasons.push("search-form-controls");
    }

    if (searchFieldCount >= 3) {
      reasons.push("search-filter-fields");
    }

    if (hasTabs) {
      reasons.push("search-tabs");
    }

    const score = [
      hasResidentialSearch || hasItsSearch,
      searchFieldCount >= 3,
      hasTabs
    ].filter(Boolean).length;

    return {
      isSearchPage: score >= 2,
      confidence: score / 3,
      reasons
    };
  }

  function getContractState(documentRef) {
    const plusCount = namespace.countSelector(documentRef, "img[src*=\"plusbox.gif\"]");
    const minusCount = namespace.countSelector(documentRef, "img[src*=\"minusbox.gif\"]");

    if (plusCount === 0 && minusCount === 0) {
      return "unknown";
    }

    if (plusCount > minusCount * 2) {
      return "mostly-collapsed";
    }

    if (minusCount > plusCount * 2) {
      return "mostly-expanded";
    }

    return "mixed";
  }

  function detectSubscriberPage(documentRef) {
    const reasons = [];
    const contractControlCount = namespace.countSelector(documentRef, "[id^=\"ExpandContract_\"]");
    const contractInfoCount = namespace.countSelector(documentRef, "[id^=\"CID_info_\"]");
    const serviceIdCount = countAny(documentRef, [
      "input[id^=\"CS_ID_\"]",
      "input[name^=\"CS_ID_\"]"
    ]);
    const serviceContractCount = countAny(documentRef, [
      "input[id^=\"CS_CID_\"]",
      "input[name^=\"CS_CID_\"]"
    ]);
    const serviceTypeCount = countAny(documentRef, [
      "input[id^=\"CS_SID_\"]",
      "input[name^=\"CS_SID_\"]"
    ]);
    const hasServiceFamily = serviceIdCount > 0 && serviceContractCount > 0 && serviceTypeCount > 0;
    const hasDeviceLinks = hasElementAttributeContaining(documentRef, "a[href]", "href", [
      "/bbs2/devices/",
      "../../../bbs2/devices/"
    ]);
    const hasDeviceHistory = hasElementAttributeContaining(documentRef, "a[href]", "href", [
      "devices-history"
    ]);
    const hasContractActions = hasElementAttributeContaining(documentRef, "a[href]", "href", [
      "ShowContract(",
      "SelectContract("
    ]) || hasElementAttributeContaining(documentRef, "[onclick]", "onclick", [
      "ExpandContractDetails(",
      "SelectContract("
    ]);
    const documentText = namespace.getDocumentText(documentRef);
    const hasDeviceText = /\b(?:MAC|MSISDN|SerialNo)\b/i.test(documentText);
    const hasMonitorLinks = hasElementAttributeContaining(documentRef, "a[href]", "href", [
      "monitor.a1.bg",
      "iptv-monitoring",
      "xploretv-monitoring",
      "net-mgn-monitoring"
    ]);

    if (contractControlCount > 0) reasons.push("contract-expand-controls");
    if (contractInfoCount > 0) reasons.push("contract-info-cells");
    if (hasContractActions) reasons.push("contract-actions");
    if (hasServiceFamily) reasons.push("service-hidden-inputs");
    if (hasDeviceLinks) reasons.push("bbs2-device-links");
    if (hasDeviceHistory) reasons.push("device-history-links");
    if (hasDeviceText) reasons.push("device-text");
    if (hasMonitorLinks) reasons.push("monitor-links");

    const requiredStructure = contractControlCount > 0 && contractInfoCount > 0;
    const deviceEvidence = hasServiceFamily || hasDeviceLinks;
    const score = [
      requiredStructure,
      hasContractActions,
      deviceEvidence,
      hasDeviceHistory,
      hasDeviceText,
      hasMonitorLinks
    ].filter(Boolean).length;

    return {
      isSubscriberPage: requiredStructure && deviceEvidence && score >= 3,
      confidence: Math.min(1, score / 6),
      contractState: getContractState(documentRef),
      reasons,
      signalCounts: {
        contractControlCount,
        contractInfoCount,
        serviceIdCount,
        serviceContractCount,
        serviceTypeCount
      }
    };
  }

  function detectBbsPage(documentRef) {
    const documentToCheck = documentRef || global.document;

    if (!documentToCheck) {
      return {
        pageType: "unknown",
        shouldActivate: false,
        confidence: 0,
        reasons: ["missing-document"],
        contractState: "unknown"
      };
    }

    if (namespace.isHiddenFrameDocument(documentToCheck)) {
      return {
        pageType: "unknown",
        shouldActivate: false,
        confidence: 0,
        reasons: ["hidden-frame"],
        contractState: "unknown"
      };
    }

    const search = detectSearchPage(documentToCheck);

    if (search.isSearchPage) {
      return {
        pageType: "search",
        shouldActivate: false,
        confidence: search.confidence,
        reasons: search.reasons,
        contractState: "unknown"
      };
    }

    const subscriber = detectSubscriberPage(documentToCheck);

    if (subscriber.isSubscriberPage) {
      return {
        pageType: "subscriber",
        shouldActivate: true,
        confidence: subscriber.confidence,
        reasons: subscriber.reasons,
        contractState: subscriber.contractState,
        signalCounts: subscriber.signalCounts
      };
    }

    const hasFrameSet = namespace.hasSelector(documentToCheck, "frameset");

    return {
      pageType: "unknown",
      shouldActivate: false,
      confidence: 0,
      reasons: hasFrameSet ? ["frameset-without-target-content"] : ["insufficient-signals"],
      contractState: "unknown",
      signalCounts: subscriber.signalCounts
    };
  }

  global.BbsAssistant = {
    ...namespace,
    detectBbsPage
  };
})(typeof window !== "undefined" ? window : globalThis);

