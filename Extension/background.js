const RECYCLE_REMOTE_CONFIG_URL = "https://oss-assistant.github.io/oss-assistant-config/config/recycle-device-catalog.json";
const RECYCLE_REMOTE_CONFIG_TIMEOUT_MS = 15000;
const RECYCLE_REMOTE_CONFIG_MAX_BYTES = 1024 * 1024;
const RECYCLE_REMOTE_CONFIG_AUTO_REFRESH_TTL_MS = 6 * 60 * 60 * 1000;

const RECYCLE_REMOTE_CONFIG_KEYS = {
  lkg: "wifi_oss_recycle_remote_config_lkg_v1",
  meta: "wifi_oss_recycle_remote_config_meta_v1",
  status: "wifi_oss_recycle_remote_config_status_v1",
  enabled: "wifi_oss_recycle_remote_config_enabled_v1"
};

const RECYCLE_REMOTE_EXPECTED_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "revision",
  "devices",
  "categoryHelp",
  "validationProfiles",
  "generatedMaterialFilters"
];

const RECYCLE_REMOTE_ALLOWED_DEVICE_FIELDS = [
  "deviceId",
  "categoryId",
  "displayName",
  "materialId",
  "legacyMaterialIds",
  "imagePath",
  "helpImagePath",
  "warningText",
  "validationProfileId",
  "enabled"
];

const RECYCLE_REMOTE_VISUAL_DIFF_FIELDS = [
  "displayName",
  "imagePath",
  "helpImagePath",
  "warningText"
];

const RECYCLE_REMOTE_RISKY_DIFF_FIELDS = [
  "materialId",
  "legacyMaterialIds",
  "validationProfileId",
  "enabled",
  "categoryId"
];

const RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT = 5;

function recycleRemoteNowIso() {
  return new Date().toISOString();
}

function recycleRemoteIsPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function recycleRemoteTrim(value) {
  return String(value || "").trim();
}

function recycleRemoteByteLength(text) {
  const raw = String(text || "");
  if (typeof TextEncoder === "function") return new TextEncoder().encode(raw).length;
  return raw.length;
}

function recycleRemoteFetchWithTimeout(url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...(opts || {}), signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function recycleRemoteReadTextWithLimit(response, maxBytes) {
  const lengthHeader = response.headers?.get?.("content-length");
  const contentLength = Number(lengthHeader || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Remote config is too large (${contentLength} bytes)`);
  }

  if (response.body && typeof response.body.getReader === "function" && typeof TextDecoder === "function") {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = "";
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        received += chunk.value?.byteLength || 0;
        if (received > maxBytes) {
          try { await reader.cancel(); } catch (e) {}
          throw new Error(`Remote config is too large (${received} bytes)`);
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      return { text, byteLength: received || recycleRemoteByteLength(text) };
    } finally {
      try { reader.releaseLock?.(); } catch (e) {}
    }
  }

  const text = await response.text();
  const byteLength = recycleRemoteByteLength(text);
  if (byteLength > maxBytes) {
    throw new Error(`Remote config is too large (${byteLength} bytes)`);
  }
  return { text, byteLength };
}

function recycleRemoteChromeGet(keys) {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) return resolve({});
    chrome.storage.local.get(keys, (value) => {
      const error = chrome.runtime?.lastError;
      if (error) return reject(new Error(error.message || String(error)));
      resolve(value || {});
    });
  });
}

function recycleRemoteChromeSet(items) {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) return resolve();
    chrome.storage.local.set(items, () => {
      const error = chrome.runtime?.lastError;
      if (error) return reject(new Error(error.message || String(error)));
      resolve();
    });
  });
}

function recycleRemoteChromeRemove(keys) {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) return resolve();
    chrome.storage.local.remove(keys, () => {
      const error = chrome.runtime?.lastError;
      if (error) return reject(new Error(error.message || String(error)));
      resolve();
    });
  });
}

function recycleRemoteAddIssue(issues, code, message) {
  issues.push({ code, message });
}

function recycleRemoteIsSafeId(value) {
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(String(value || ""));
}

function recycleRemoteIsSafeProfileId(value) {
  return /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(String(value || ""));
}

function recycleRemoteValidateAssetPath(pathValue, fieldName, label, issues) {
  const value = recycleRemoteTrim(pathValue);
  if (!value) return "";
  if (!value.startsWith("images/")) {
    recycleRemoteAddIssue(issues, "asset.invalidPrefix", `${label}.${fieldName} must start with images/: ${value}`);
  }
  if (/^(?:[A-Za-z]:|[\\/])/i.test(value) || /(?:file:\/\/|https?:\/\/)/i.test(value)) {
    recycleRemoteAddIssue(issues, "asset.absoluteOrRemote", `${label}.${fieldName} must be extension-relative: ${value}`);
  }
  if (value.includes("\\") || value.includes("..")) {
    recycleRemoteAddIssue(issues, "asset.unsafePath", `${label}.${fieldName} contains unsafe path characters: ${value}`);
  }
  if (!/\.(?:webp|png|jpe?g)$/i.test(value)) {
    recycleRemoteAddIssue(issues, "asset.invalidExtension", `${label}.${fieldName} must be an image path: ${value}`);
  }
  return value;
}

function recycleRemoteNormalizeLegacyMaterialIds(value, label, issues) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    recycleRemoteAddIssue(issues, "device.invalidLegacyMaterialIds", `${label}.legacyMaterialIds must be an array`);
    return [];
  }
  const normalized = [];
  value.forEach((raw, index) => {
    const id = recycleRemoteTrim(raw);
    if (!id) return;
    if (!/^\d+$/.test(id)) {
      recycleRemoteAddIssue(issues, "device.invalidLegacyMaterialId", `${label}.legacyMaterialIds[${index}] must be digits-only`);
      return;
    }
    normalized.push(id);
  });
  return normalized;
}

function recycleRemoteValidateValidationProfiles(value, issues) {
  if (!Array.isArray(value)) {
    recycleRemoteAddIssue(issues, "validationProfiles.notArray", "validationProfiles must be an array");
    return { profiles: [], profileSet: new Set() };
  }
  const profiles = [];
  const profileSet = new Set();
  value.forEach((raw, index) => {
    const id = recycleRemoteTrim(raw);
    if (!id) {
      recycleRemoteAddIssue(issues, "validationProfiles.empty", `validationProfiles[${index}] is empty`);
      return;
    }
    if (!recycleRemoteIsSafeProfileId(id)) {
      recycleRemoteAddIssue(issues, "validationProfiles.unsafeId", `validationProfiles[${index}] is not a safe id: ${id}`);
      return;
    }
    if (profileSet.has(id)) {
      recycleRemoteAddIssue(issues, "validationProfiles.duplicate", `${id} is duplicated`);
      return;
    }
    profileSet.add(id);
    profiles.push(id);
  });
  return { profiles, profileSet };
}

function recycleRemoteValidateCategoryHelp(value, issues) {
  if (!recycleRemoteIsPlainObject(value)) {
    recycleRemoteAddIssue(issues, "categoryHelp.notObject", "categoryHelp must be an object");
    return {};
  }
  const sanitized = {};
  Object.entries(value).forEach(([categoryId, items]) => {
    if (!recycleRemoteIsSafeId(categoryId)) {
      recycleRemoteAddIssue(issues, "categoryHelp.invalidCategoryId", `categoryHelp has unsafe categoryId: ${categoryId}`);
      return;
    }
    if (!Array.isArray(items)) {
      recycleRemoteAddIssue(issues, "categoryHelp.notArray", `categoryHelp.${categoryId} must be an array`);
      return;
    }
    sanitized[categoryId] = items
      .map((item, index) => {
        const label = `categoryHelp.${categoryId}[${index}]`;
        if (!recycleRemoteIsPlainObject(item)) {
          recycleRemoteAddIssue(issues, "categoryHelp.itemNotObject", `${label} must be an object`);
          return null;
        }
        return {
          imagePath: recycleRemoteValidateAssetPath(item.imagePath, "imagePath", label, issues),
          title: recycleRemoteTrim(item.title),
          alt: recycleRemoteTrim(item.alt)
        };
      })
      .filter(Boolean);
  });
  return sanitized;
}

function recycleRemoteValidateGeneratedMaterialFilters(value, issues) {
  if (!recycleRemoteIsPlainObject(value)) {
    recycleRemoteAddIssue(issues, "generatedMaterialFilters.notObject", "generatedMaterialFilters must be an object");
    return {};
  }
  const sanitized = {};
  Object.entries(value).forEach(([categoryId, materialIds]) => {
    if (!recycleRemoteIsSafeId(categoryId)) {
      recycleRemoteAddIssue(issues, "generatedMaterialFilters.invalidCategoryId", `generatedMaterialFilters has unsafe categoryId: ${categoryId}`);
      return;
    }
    if (!Array.isArray(materialIds)) {
      recycleRemoteAddIssue(issues, "generatedMaterialFilters.notArray", `generatedMaterialFilters.${categoryId} must be an array`);
      return;
    }
    sanitized[categoryId] = materialIds
      .map(id => recycleRemoteTrim(id))
      .filter((id, index) => {
        if (!id) return false;
        if (/^\d+$/.test(id)) return true;
        recycleRemoteAddIssue(issues, "generatedMaterialFilters.invalidMaterialId", `generatedMaterialFilters.${categoryId}[${index}] must be digits-only`);
        return false;
      });
  });
  return sanitized;
}

function recycleRemoteValidateDevices(value, profileSet, issues) {
  if (!Array.isArray(value)) {
    recycleRemoteAddIssue(issues, "devices.notArray", "devices must be an array");
    return [];
  }
  const seen = new Set();
  const sanitized = [];
  value.forEach((device, index) => {
    const label = `devices[${index}]`;
    if (!recycleRemoteIsPlainObject(device)) {
      recycleRemoteAddIssue(issues, "device.notObject", `${label} must be an object`);
      return;
    }

    Object.keys(device).forEach((field) => {
      if (!RECYCLE_REMOTE_ALLOWED_DEVICE_FIELDS.includes(field)) {
        recycleRemoteAddIssue(issues, "device.unknownField", `${label} has unknown field ${field}`);
      }
    });

    const deviceId = recycleRemoteTrim(device.deviceId);
    const categoryId = recycleRemoteTrim(device.categoryId);
    const displayName = recycleRemoteTrim(device.displayName);
    const materialId = recycleRemoteTrim(device.materialId);
    const validationProfileId = recycleRemoteTrim(device.validationProfileId);
    const idLabel = deviceId || label;

    if (!deviceId) recycleRemoteAddIssue(issues, "device.missingDeviceId", `${label} is missing deviceId`);
    else if (!recycleRemoteIsSafeId(deviceId)) recycleRemoteAddIssue(issues, "device.invalidDeviceId", `${idLabel} has unsafe deviceId`);
    else if (seen.has(deviceId)) recycleRemoteAddIssue(issues, "device.duplicateDeviceId", `${deviceId} is duplicated`);
    if (deviceId) seen.add(deviceId);

    if (!categoryId || !recycleRemoteIsSafeId(categoryId)) {
      recycleRemoteAddIssue(issues, "device.invalidCategoryId", `${idLabel} has invalid categoryId ${categoryId || "(empty)"}`);
    }
    if (!displayName) {
      recycleRemoteAddIssue(issues, "device.missingDisplayName", `${idLabel} is missing displayName`);
    }
    if (materialId && !/^\d+$/.test(materialId)) {
      recycleRemoteAddIssue(issues, "device.invalidMaterialId", `${idLabel} materialId must be digits-only`);
    }
    if (device.enabled != null && typeof device.enabled !== "boolean") {
      recycleRemoteAddIssue(issues, "device.invalidEnabled", `${idLabel} enabled must be boolean when present`);
    }
    if (validationProfileId && !profileSet.has(validationProfileId)) {
      recycleRemoteAddIssue(issues, "device.unknownValidationProfile", `${idLabel} references unknown validationProfileId ${validationProfileId}`);
    }

    sanitized.push({
      deviceId,
      categoryId,
      displayName,
      materialId,
      legacyMaterialIds: recycleRemoteNormalizeLegacyMaterialIds(device.legacyMaterialIds, idLabel, issues),
      imagePath: recycleRemoteValidateAssetPath(device.imagePath, "imagePath", idLabel, issues),
      helpImagePath: recycleRemoteValidateAssetPath(device.helpImagePath, "helpImagePath", idLabel, issues),
      warningText: recycleRemoteTrim(device.warningText),
      validationProfileId,
      enabled: device.enabled !== false
    });
  });
  return sanitized;
}

function recycleRemoteValidateCatalog(catalog) {
  const issues = [];
  if (!recycleRemoteIsPlainObject(catalog)) {
    recycleRemoteAddIssue(issues, "catalog.notObject", "Remote config root must be an object");
    return { ok: false, errors: issues, sanitized: null };
  }

  Object.keys(catalog).forEach((key) => {
    if (!RECYCLE_REMOTE_EXPECTED_TOP_LEVEL_KEYS.includes(key)) {
      recycleRemoteAddIssue(issues, "catalog.unknownTopLevelKey", `Unknown top-level key: ${key}`);
    }
  });

  RECYCLE_REMOTE_EXPECTED_TOP_LEVEL_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(catalog, key)) {
      recycleRemoteAddIssue(issues, "catalog.missingTopLevelKey", `Missing top-level key: ${key}`);
    }
  });

  if (catalog.schemaVersion !== 1) {
    recycleRemoteAddIssue(issues, "catalog.invalidSchemaVersion", `Expected schemaVersion 1, got ${JSON.stringify(catalog.schemaVersion)}`);
  }
  const revision = recycleRemoteTrim(catalog.revision);
  if (!revision) recycleRemoteAddIssue(issues, "catalog.missingRevision", "revision is required");

  const { profiles, profileSet } = recycleRemoteValidateValidationProfiles(catalog.validationProfiles, issues);
  const devices = recycleRemoteValidateDevices(catalog.devices, profileSet, issues);
  const categoryHelp = recycleRemoteValidateCategoryHelp(catalog.categoryHelp, issues);
  const generatedMaterialFilters = recycleRemoteValidateGeneratedMaterialFilters(catalog.generatedMaterialFilters, issues);

  return {
    ok: issues.length === 0,
    errors: issues,
    sanitized: issues.length ? null : {
      schemaVersion: 1,
      revision,
      devices,
      categoryHelp,
      validationProfiles: profiles,
      generatedMaterialFilters
    }
  };
}

function recycleRemoteBuildStatus(result, startedAtMs, patch) {
  return {
    result,
    lastAttemptAt: patch?.lastAttemptAt || recycleRemoteNowIso(),
    lastSuccessAt: patch?.lastSuccessAt || "",
    lastHttpStatus: patch?.lastHttpStatus || 0,
    lastError: patch?.lastError || "",
    validationErrors: Array.isArray(patch?.validationErrors) ? patch.validationErrors : [],
    durationMs: Math.max(0, Date.now() - startedAtMs)
  };
}

function recycleRemoteParseTimestampMs(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function recycleRemoteBuildStatusResponse(stored, result) {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const status = stored?.[keys.status] || null;
  const meta = stored?.[keys.meta] || null;
  const hasLastKnownGood = Boolean(stored?.[keys.lkg]);
  const autoRefreshEnabled = stored?.[keys.enabled] === true;
  const lastFreshAt = recycleRemoteTrim(meta?.fetchedAt || status?.lastSuccessAt);
  const lastFreshAtMs = recycleRemoteParseTimestampMs(lastFreshAt);
  const ageMs = lastFreshAtMs ? Math.max(0, Date.now() - lastFreshAtMs) : null;
  const isStale = !hasLastKnownGood || !lastFreshAtMs || ageMs >= RECYCLE_REMOTE_CONFIG_AUTO_REFRESH_TTL_MS;

  return {
    ok: true,
    result: result || "status",
    status,
    meta,
    enabled: autoRefreshEnabled,
    autoRefreshEnabled,
    ttlMs: RECYCLE_REMOTE_CONFIG_AUTO_REFRESH_TTL_MS,
    lastFreshAt,
    ageMs,
    isStale,
    hasLastKnownGood
  };
}

async function recycleRemoteGetStatus() {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.enabled]);
  return recycleRemoteBuildStatusResponse(stored, "status");
}

async function recycleRemoteSetAutoRefreshEnabled(enabled) {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  await recycleRemoteChromeSet({ [keys.enabled]: enabled === true });
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.enabled]);
  return recycleRemoteBuildStatusResponse(stored, enabled === true ? "auto_refresh_enabled" : "auto_refresh_disabled");
}

async function recycleRemoteMaybeRefresh() {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.enabled]);
  const current = recycleRemoteBuildStatusResponse(stored, "status");
  if (!current.autoRefreshEnabled) {
    return { ...current, result: "disabled", autoRefreshAttempted: false, errors: [] };
  }
  if (!current.isStale) {
    return { ...current, result: "fresh", autoRefreshAttempted: false, errors: [] };
  }

  const refreshed = await recycleRemoteRefresh();
  const after = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.enabled]);
  const next = recycleRemoteBuildStatusResponse(after, refreshed.result || "refreshed");
  return {
    ...refreshed,
    ...next,
    ok: refreshed.ok,
    result: refreshed.result || next.result,
    autoRefreshAttempted: true,
    errors: Array.isArray(refreshed.errors) ? refreshed.errors : []
  };
}

function recycleRemoteProjectVisualOverlay(catalog) {
  const devices = Array.isArray(catalog?.devices) ? catalog.devices : [];
  return devices
    .map(device => ({
      deviceId: recycleRemoteTrim(device?.deviceId),
      displayName: recycleRemoteTrim(device?.displayName),
      imagePath: recycleRemoteTrim(device?.imagePath),
      helpImagePath: recycleRemoteTrim(device?.helpImagePath),
      warningText: recycleRemoteTrim(device?.warningText)
    }))
    .filter(device => device.deviceId);
}

function recycleRemoteNormalizePreviewDevice(device) {
  if (!recycleRemoteIsPlainObject(device)) return null;
  const deviceId = recycleRemoteTrim(device.deviceId);
  if (!deviceId) return null;
  return {
    deviceId,
    categoryId: recycleRemoteTrim(device.categoryId),
    displayName: recycleRemoteTrim(device.displayName),
    materialId: recycleRemoteTrim(device.materialId),
    legacyMaterialIds: recycleRemoteNormalizeLegacyMaterialIds(device.legacyMaterialIds, deviceId, []),
    imagePath: recycleRemoteTrim(device.imagePath),
    helpImagePath: recycleRemoteTrim(device.helpImagePath),
    warningText: recycleRemoteTrim(device.warningText),
    validationProfileId: recycleRemoteTrim(device.validationProfileId),
    enabled: device.enabled !== false
  };
}

function recycleRemotePreviewValuesEqual(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftList = Array.isArray(left) ? left.map(recycleRemoteTrim).filter(Boolean) : [];
    const rightList = Array.isArray(right) ? right.map(recycleRemoteTrim).filter(Boolean) : [];
    if (leftList.length !== rightList.length) return false;
    return leftList.every((value, index) => value === rightList[index]);
  }
  return recycleRemoteTrim(left) === recycleRemoteTrim(right);
}

function recycleRemoteBuildPreviewSample(device, fields) {
  return {
    deviceId: recycleRemoteTrim(device?.deviceId),
    displayName: recycleRemoteTrim(device?.displayName),
    fields: Array.isArray(fields) ? fields.slice(0, RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT) : [],
    reasons: Array.isArray(device?.reasons) ? device.reasons.slice(0, RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT) : [],
    warnings: Array.isArray(device?.warnings) ? device.warnings.slice(0, RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT) : []
  };
}

function recycleRemotePushPreviewSample(samples, key, sample) {
  if (!samples[key]) samples[key] = [];
  if (samples[key].length >= RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT) return;
  samples[key].push(sample);
}

function recycleRemoteBuildPreviewSet(values) {
  return new Set((Array.isArray(values) ? values : [])
    .map(value => recycleRemoteTrim(value))
    .filter(Boolean));
}

function recycleRemoteGetPreviewAssetPathIssue(value, fieldName) {
  const pathValue = recycleRemoteTrim(value);
  if (!pathValue) return "";
  if (/^(?:[A-Za-z]:|[\\/])/i.test(pathValue) || /(?:file:\/\/|https?:\/\/)/i.test(pathValue)) {
    return `${fieldName} absolute/remote`;
  }
  if (pathValue.includes("\\") || pathValue.includes("..")) return `${fieldName} unsafe path`;
  if (!pathValue.startsWith("images/")) return `${fieldName} not images/...`;
  if (!/\.(?:webp|png|jpe?g)$/i.test(pathValue)) return `${fieldName} not image`;
  return "";
}

function recycleRemoteBuildUnknownEligibilitySample(remote, reasons, warnings) {
  return recycleRemoteBuildPreviewSample({
    ...remote,
    reasons,
    warnings
  }, []);
}

function recycleRemoteClassifyUnknownDeviceEligibility(remote, localMap, eligibilityContext) {
  const normalCategoryIds = recycleRemoteBuildPreviewSet(eligibilityContext?.normalCategoryIds);
  const specialCategoryIds = recycleRemoteBuildPreviewSet(eligibilityContext?.specialCategoryIds);
  const implementedProfileIds = recycleRemoteBuildPreviewSet(eligibilityContext?.implementedValidationProfileIds);
  const materialModelIds = recycleRemoteBuildPreviewSet(eligibilityContext?.materialModelIds);
  const hasMaterialModelContext = Array.isArray(eligibilityContext?.materialModelIds);
  const reasons = [];
  const warnings = [];
  const deviceId = recycleRemoteTrim(remote?.deviceId);
  const categoryId = recycleRemoteTrim(remote?.categoryId);
  const validationProfileId = recycleRemoteTrim(remote?.validationProfileId);
  const materialId = recycleRemoteTrim(remote?.materialId);

  if (!deviceId || !recycleRemoteIsSafeId(deviceId)) reasons.push("unsafe deviceId");
  else if (localMap.has(deviceId)) reasons.push("deviceId already local");

  if (!categoryId || !recycleRemoteIsSafeId(categoryId)) reasons.push("invalid categoryId");
  else if (specialCategoryIds.has(categoryId)) reasons.push(`special category ${categoryId}`);
  else if (!normalCategoryIds.has(categoryId)) reasons.push(`unknown category ${categoryId}`);

  if (!validationProfileId) reasons.push("missing validationProfileId");
  else if (!implementedProfileIds.has(validationProfileId)) reasons.push(`profile not local ${validationProfileId}`);

  if (!materialId) reasons.push("missing materialId");
  else if (!/^\d+$/.test(materialId)) reasons.push("invalid materialId");
  else if (hasMaterialModelContext && !materialModelIds.has(materialId)) reasons.push(`material not known ${materialId}`);
  else if (!hasMaterialModelContext) warnings.push("material availability unverified");

  if (remote?.enabled === false) reasons.push("disabled");

  const imageIssue = recycleRemoteGetPreviewAssetPathIssue(remote?.imagePath, "imagePath");
  const helpIssue = recycleRemoteGetPreviewAssetPathIssue(remote?.helpImagePath, "helpImagePath");
  if (imageIssue) reasons.push(imageIssue);
  if (helpIssue) reasons.push(helpIssue);
  if (!recycleRemoteTrim(remote?.imagePath)) warnings.push("image fallback");
  if (!recycleRemoteTrim(remote?.helpImagePath)) warnings.push("help fallback");

  return {
    eligible: reasons.length === 0,
    reasons,
    warnings
  };
}

function recycleRemoteBuildCatalogDiffPreview(localDevices, remoteCatalog, meta, status, eligibilityContext) {
  const summary = {
    visualChanges: 0,
    riskyChanges: 0,
    unknownRemoteDevices: 0,
    missingLocalDevices: 0,
    unknownEligibility: {
      eligible: 0,
      blocked: 0
    }
  };
  const samples = {
    visualChanges: [],
    riskyChanges: [],
    unknownRemoteDevices: [],
    missingLocalDevices: [],
    unknownEligibleDevices: [],
    unknownBlockedDevices: []
  };

  if (!remoteCatalog) {
    return {
      ok: true,
      result: "no_data",
      meta: meta || null,
      status: status || null,
      summary,
      samples
    };
  }

  const localMap = new Map();
  (Array.isArray(localDevices) ? localDevices : []).forEach(device => {
    const normalized = recycleRemoteNormalizePreviewDevice(device);
    if (normalized && !localMap.has(normalized.deviceId)) {
      localMap.set(normalized.deviceId, normalized);
    }
  });

  const remoteMap = new Map();
  (Array.isArray(remoteCatalog.devices) ? remoteCatalog.devices : []).forEach(device => {
    const remote = recycleRemoteNormalizePreviewDevice(device);
    if (!remote || remoteMap.has(remote.deviceId)) return;
    remoteMap.set(remote.deviceId, remote);

    const local = localMap.get(remote.deviceId);
    if (!local) {
      summary.unknownRemoteDevices += 1;
      recycleRemotePushPreviewSample(samples, "unknownRemoteDevices", recycleRemoteBuildPreviewSample(remote, []));
      const eligibility = recycleRemoteClassifyUnknownDeviceEligibility(remote, localMap, eligibilityContext);
      if (eligibility.eligible) {
        summary.unknownEligibility.eligible += 1;
        recycleRemotePushPreviewSample(samples, "unknownEligibleDevices", recycleRemoteBuildUnknownEligibilitySample(remote, [], eligibility.warnings));
      } else {
        summary.unknownEligibility.blocked += 1;
        recycleRemotePushPreviewSample(samples, "unknownBlockedDevices", recycleRemoteBuildUnknownEligibilitySample(remote, eligibility.reasons, eligibility.warnings));
      }
      return;
    }

    const visualFields = RECYCLE_REMOTE_VISUAL_DIFF_FIELDS.filter(field => !recycleRemotePreviewValuesEqual(local[field], remote[field]));
    if (visualFields.length) {
      summary.visualChanges += 1;
      recycleRemotePushPreviewSample(samples, "visualChanges", recycleRemoteBuildPreviewSample(remote, visualFields));
    }

    const riskyFields = RECYCLE_REMOTE_RISKY_DIFF_FIELDS.filter(field => !recycleRemotePreviewValuesEqual(local[field], remote[field]));
    if (riskyFields.length) {
      summary.riskyChanges += 1;
      recycleRemotePushPreviewSample(samples, "riskyChanges", recycleRemoteBuildPreviewSample(remote, riskyFields));
    }
  });

  localMap.forEach(local => {
    if (remoteMap.has(local.deviceId)) return;
    summary.missingLocalDevices += 1;
    recycleRemotePushPreviewSample(samples, "missingLocalDevices", recycleRemoteBuildPreviewSample(local, []));
  });

  return {
    ok: true,
    result: "preview",
    meta: meta || null,
    status: status || null,
    summary,
    samples
  };
}

async function recycleRemoteGetCatalogDiffPreview(localDevices, eligibilityContext) {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status]);
  return recycleRemoteBuildCatalogDiffPreview(
    Array.isArray(localDevices) ? localDevices : [],
    stored[keys.lkg] || null,
    stored[keys.meta] || null,
    stored[keys.status] || null,
    eligibilityContext || null
  );
}

async function recycleRemoteGetVisualOverlay() {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status]);
  const lkg = stored[keys.lkg] || null;
  const meta = stored[keys.meta] || null;
  const status = stored[keys.status] || null;

  if (!lkg) {
    return {
      ok: true,
      result: "no_data",
      meta,
      status,
      overlay: []
    };
  }

  const overlay = recycleRemoteProjectVisualOverlay(lkg);
  return {
    ok: true,
    result: overlay.length ? "ok" : "no_overlay",
    meta,
    status,
    overlay
  };
}

async function recycleRemoteClearCache() {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.enabled]);
  const autoRefreshEnabled = stored[keys.enabled] === true;
  await recycleRemoteChromeRemove([keys.lkg, keys.meta, keys.status]);
  return {
    ok: true,
    result: "cleared",
    status: recycleRemoteBuildStatus("cleared", Date.now(), { lastAttemptAt: recycleRemoteNowIso() }),
    meta: null,
    enabled: autoRefreshEnabled,
    autoRefreshEnabled,
    ttlMs: RECYCLE_REMOTE_CONFIG_AUTO_REFRESH_TTL_MS,
    lastFreshAt: "",
    ageMs: null,
    isStale: true,
    hasLastKnownGood: false,
    errors: []
  };
}

async function recycleRemoteRefresh() {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const startedAt = Date.now();
  const lastAttemptAt = recycleRemoteNowIso();
  let lastHttpStatus = 0;
  let previousMeta = null;

  try {
    const stored = await recycleRemoteChromeGet([keys.meta, keys.status]);
    previousMeta = stored[keys.meta] || null;
    const headers = { Accept: "application/json" };
    if (previousMeta?.etag) headers["If-None-Match"] = previousMeta.etag;

    const response = await recycleRemoteFetchWithTimeout(
      RECYCLE_REMOTE_CONFIG_URL,
      { cache: "no-cache", headers },
      RECYCLE_REMOTE_CONFIG_TIMEOUT_MS
    );
    lastHttpStatus = response.status || 0;

    if (response.status === 304) {
      const status = recycleRemoteBuildStatus("not_modified", startedAt, {
        lastAttemptAt,
        lastSuccessAt: previousMeta?.fetchedAt || stored[keys.status]?.lastSuccessAt || "",
        lastHttpStatus
      });
      await recycleRemoteChromeSet({ [keys.status]: status });
      return { ok: true, result: "not_modified", meta: previousMeta, status, errors: [] };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const { text, byteLength } = await recycleRemoteReadTextWithLimit(response, RECYCLE_REMOTE_CONFIG_MAX_BYTES);
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch (error) {
      const status = recycleRemoteBuildStatus("validation_failed", startedAt, {
        lastAttemptAt,
        lastHttpStatus,
        lastError: "Invalid JSON",
        validationErrors: [{ code: "json.parse", message: error.message || "Invalid JSON" }]
      });
      await recycleRemoteChromeSet({ [keys.status]: status });
      return { ok: false, result: "validation_failed", meta: previousMeta, status, errors: status.validationErrors };
    }

    const validation = recycleRemoteValidateCatalog(parsed);
    if (!validation.ok) {
      const status = recycleRemoteBuildStatus("validation_failed", startedAt, {
        lastAttemptAt,
        lastHttpStatus,
        lastError: "Remote config validation failed",
        validationErrors: validation.errors
      });
      await recycleRemoteChromeSet({ [keys.status]: status });
      return { ok: false, result: "validation_failed", meta: previousMeta, status, errors: validation.errors };
    }

    const etag = recycleRemoteTrim(response.headers?.get?.("etag"));
    const fetchedAt = recycleRemoteNowIso();
    const meta = {
      schemaVersion: validation.sanitized.schemaVersion,
      revision: validation.sanitized.revision,
      sourceUrl: RECYCLE_REMOTE_CONFIG_URL,
      etag,
      fetchedAt,
      byteLength,
      deviceCount: validation.sanitized.devices.length
    };
    const status = recycleRemoteBuildStatus("updated", startedAt, {
      lastAttemptAt,
      lastSuccessAt: fetchedAt,
      lastHttpStatus
    });

    await recycleRemoteChromeSet({
      [keys.lkg]: validation.sanitized,
      [keys.meta]: meta,
      [keys.status]: status
    });
    return { ok: true, result: "updated", meta, status, errors: [] };
  } catch (error) {
    const status = recycleRemoteBuildStatus("fetch_failed", startedAt, {
      lastAttemptAt,
      lastHttpStatus,
      lastError: error?.name === "AbortError" ? "Request timed out" : String(error?.message || error),
      validationErrors: []
    });
    await recycleRemoteChromeSet({ [keys.status]: status });
    return { ok: false, result: "fetch_failed", meta: previousMeta, status, errors: [] };
  }
}

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

      if (msg.type === "recycleConfig.refreshRemote") {
        return respondOnce(await recycleRemoteRefresh());
      }

      if (msg.type === "recycleConfig.getRemoteStatus") {
        return respondOnce(await recycleRemoteGetStatus());
      }

      if (msg.type === "recycleConfig.setAutoRefreshEnabled") {
        return respondOnce(await recycleRemoteSetAutoRefreshEnabled(msg.enabled === true));
      }

      if (msg.type === "recycleConfig.maybeRefreshRemote") {
        return respondOnce(await recycleRemoteMaybeRefresh());
      }

      if (msg.type === "recycleConfig.getVisualOverlay") {
        return respondOnce(await recycleRemoteGetVisualOverlay());
      }

      if (msg.type === "recycleConfig.getCatalogDiffPreview") {
        return respondOnce(await recycleRemoteGetCatalogDiffPreview(msg.localDevices, msg.eligibilityContext));
      }

      if (msg.type === "recycleConfig.clearRemoteCache") {
        return respondOnce(await recycleRemoteClearCache());
      }

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
