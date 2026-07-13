const RECYCLE_REMOTE_CONFIG_URL = "https://oss-assistant.github.io/oss-assistant-config/config/recycle-device-catalog.json";
const RECYCLE_REMOTE_CONFIG_ALLOWED_SOURCE_PREFIX = "https://oss-assistant.github.io/oss-assistant-config/";
const RECYCLE_REMOTE_EXTERNAL_SIMPLE_CONFIG_URL = "https://raw.githubusercontent.com/AgLogiV/oss-assistant-extension/main/config/recycle-device-catalog.fixture.json";
const RECYCLE_REMOTE_CONFIG_PRODUCTION_SOURCE_ID = "production";
const RECYCLE_REMOTE_CONFIG_DEBUG_SOURCE_ID = "debug";
const RECYCLE_REMOTE_CONFIG_EXTERNAL_SIMPLE_SOURCE_ID = "external_simple";
const RECYCLE_REMOTE_CONFIG_TIMEOUT_MS = 15000;
const RECYCLE_REMOTE_CONFIG_MAX_BYTES = 1024 * 1024;
const RECYCLE_REMOTE_CONFIG_AUTO_REFRESH_TTL_MS = 6 * 60 * 60 * 1000;
const DAILYWORK_SCHEDULE_URL = "https://raw.githubusercontent.com/AgLogiV/oss-assistant-extension/main/config/dailywork.json";
const DAILYWORK_FETCH_TIMEOUT_MS = 15000;
const DAILYWORK_MAX_BYTES = 256 * 1024;
const DAILYWORK_CACHE_KEYS = {
  lkg: "wifi_oss_dailywork_lkg_v1",
  meta: "wifi_oss_dailywork_meta_v1"
};

const RECYCLE_REMOTE_RUNTIME_CONTRACT = {
  extensionVersion: "1.0.1",
  supportedSchemaVersions: [1],
  supportedContractVersions: [1],
  supportedCapabilities: [
    "visualOverlay",
    "resolvedPlanPreview",
    "resolvedApplyPlan",
    "remoteAdditionsDebug",
    "remoteAdditionsAuto",
    "remoteMaterialPreview",
    "remoteMaterialAuto",
    "remoteMaterialModelsAuto",
    "remoteMaterialDebug"
  ],
  blockedCapabilities: [
    "arbitraryJs",
    "domSelectors",
    "regexValidation",
    "ossNavigation",
    "clipboard",
    "labelsBarcodes",
    "dashboardApi",
    "camFlow",
    "rewriteMap",
    "generatedMaterialFiltersRuntime"
  ]
};

const RECYCLE_REMOTE_CONFIG_KEYS = {
  lkg: "wifi_oss_recycle_remote_config_lkg_v1",
  meta: "wifi_oss_recycle_remote_config_meta_v1",
  status: "wifi_oss_recycle_remote_config_status_v1",
  enabled: "wifi_oss_recycle_remote_config_enabled_v1",
  sourceOverride: "wifi_oss_recycle_remote_config_source_override_v1"
};

const RECYCLE_REMOTE_EXPECTED_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "revision",
  "devices",
  "categoryHelp",
  "validationProfiles",
  "generatedMaterialFilters"
];

const RECYCLE_REMOTE_OPTIONAL_TOP_LEVEL_KEYS = [
  "runtimeContract",
  "remoteMaterialModels"
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

const RECYCLE_REMOTE_MATERIAL_MODEL_FIELDS = [
  "materialId",
  "deviceId",
  "categoryId",
  "name"
];

const RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT = 5;
const RECYCLE_REMOTE_CONTRACT_SAMPLE_LIMIT = 5;

function recycleRemoteNowIso() {
  return new Date().toISOString();
}

function recycleRemoteIsPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function recycleRemoteTrim(value) {
  return String(value || "").trim();
}

function recycleRemoteHasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function recycleRemoteGetExtensionVersion() {
  return recycleRemoteTrim(chrome?.runtime?.getManifest?.().version) || RECYCLE_REMOTE_RUNTIME_CONTRACT.extensionVersion;
}

function recycleRemoteBuildProductionSource() {
  return {
    activeSourceId: RECYCLE_REMOTE_CONFIG_EXTERNAL_SIMPLE_SOURCE_ID,
    activeSourceLabel: "external",
    activeSourceUrl: RECYCLE_REMOTE_EXTERNAL_SIMPLE_CONFIG_URL,
    sourceOverrideActive: false
  };
}

function recycleRemoteIsExternalSimpleSourceUrl(url) {
  return recycleRemoteTrim(url) === RECYCLE_REMOTE_EXTERNAL_SIMPLE_CONFIG_URL;
}

function recycleRemoteIsNormalExternalSource(source) {
  const active = source || {};
  return active.sourceOverrideActive !== true
    && recycleRemoteIsExternalSimpleSourceUrl(active.activeSourceUrl);
}

function recycleRemoteBuildSourceResponseFields(source) {
  const active = source || recycleRemoteBuildProductionSource();
  return {
    activeSourceId: active.activeSourceId || RECYCLE_REMOTE_CONFIG_PRODUCTION_SOURCE_ID,
    activeSourceLabel: active.activeSourceLabel || "production",
    activeSourceUrl: active.activeSourceUrl || RECYCLE_REMOTE_CONFIG_URL,
    sourceOverrideActive: active.sourceOverrideActive === true,
    normalRefreshEnabled: recycleRemoteIsNormalExternalSource(active)
  };
}

function recycleRemoteValidateSourceOverrideUrl(rawUrl) {
  const input = recycleRemoteTrim(rawUrl);
  if (!input) return { ok: false, error: "Missing source URL" };

  let parsed;
  try {
    parsed = new URL(input);
  } catch (error) {
    return { ok: false, error: "Invalid source URL" };
  }

  let allowed;
  try {
    allowed = new URL(RECYCLE_REMOTE_CONFIG_ALLOWED_SOURCE_PREFIX);
  } catch (error) {
    return { ok: false, error: "Invalid allowed source prefix" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Debug source must use HTTPS" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Debug source must not include credentials" };
  }
  parsed.hash = "";
  if (parsed.toString() === RECYCLE_REMOTE_EXTERNAL_SIMPLE_CONFIG_URL) {
    return { ok: true, url: parsed.toString() };
  }
  if (parsed.origin !== allowed.origin || !parsed.pathname.startsWith(allowed.pathname)) {
    return { ok: false, error: "Debug source must be under oss-assistant-config GitHub Pages" };
  }
  let decodedPathname = "";
  try {
    decodedPathname = decodeURIComponent(parsed.pathname);
  } catch (error) {
    return { ok: false, error: "Debug source path is invalid" };
  }
  if (decodedPathname.includes("..") || decodedPathname.includes("\\")) {
    return { ok: false, error: "Debug source path contains unsafe segments" };
  }
  if (!parsed.pathname.endsWith(".json")) {
    return { ok: false, error: "Debug source must point to a JSON file" };
  }

  return { ok: true, url: parsed.toString() };
}

function recycleRemoteNormalizeSourceOverride(value) {
  if (!value) return null;
  const rawUrl = recycleRemoteIsPlainObject(value) ? value.url : value;
  const validation = recycleRemoteValidateSourceOverrideUrl(rawUrl);
  if (!validation.ok) return null;
  return {
    url: validation.url,
    setAt: recycleRemoteTrim(value?.setAt)
  };
}

function recycleRemoteResolveActiveSource(stored) {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const override = recycleRemoteNormalizeSourceOverride(stored?.[keys.sourceOverride]);
  if (!override) return recycleRemoteBuildProductionSource();
  if (recycleRemoteIsExternalSimpleSourceUrl(override.url)) {
    return {
      activeSourceId: RECYCLE_REMOTE_CONFIG_EXTERNAL_SIMPLE_SOURCE_ID,
      activeSourceLabel: "external",
      activeSourceUrl: override.url,
      sourceOverrideActive: true
    };
  }
  return {
    activeSourceId: RECYCLE_REMOTE_CONFIG_DEBUG_SOURCE_ID,
    activeSourceLabel: "debug",
    activeSourceUrl: override.url,
    sourceOverrideActive: true
  };
}

function recycleRemoteScopeStoredToActiveSource(stored, source) {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const scoped = stored || {};
  const active = source || recycleRemoteBuildProductionSource();
  const lkg = scoped[keys.lkg] || null;
  const meta = scoped[keys.meta] || null;
  const metaSourceUrl = recycleRemoteTrim(meta?.sourceUrl);
  if ((lkg || meta) && metaSourceUrl !== active.activeSourceUrl) {
    return {
      ...scoped,
      [keys.lkg]: null,
      [keys.meta]: null,
      [keys.status]: null
    };
  }
  if (!lkg) return scoped;
  if (metaSourceUrl === active.activeSourceUrl) return scoped;
  return {
    ...scoped,
    [keys.lkg]: null,
    [keys.meta]: null,
    [keys.status]: null
  };
}

function recycleRemoteCompareVersions(left, right) {
  const leftParts = recycleRemoteTrim(left).split(".").map(part => Number(part || 0));
  const rightParts = recycleRemoteTrim(right).split(".").map(part => Number(part || 0));
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }
  return 0;
}

function recycleRemoteNormalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const normalized = [];
  value.forEach(raw => {
    const item = recycleRemoteTrim(raw);
    if (item && !normalized.includes(item) && normalized.length < RECYCLE_REMOTE_CONTRACT_SAMPLE_LIMIT * 4) {
      normalized.push(item);
    }
  });
  return normalized;
}

function recycleRemoteBuildStableContentHash(text) {
  const input = String(text || "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function recycleRemoteIsExternalSimpleCatalog(catalog) {
  if (!recycleRemoteIsPlainObject(catalog)) return false;
  const keys = Object.keys(catalog);
  return keys.length === 1
    && keys[0] === "devices"
    && Array.isArray(catalog.devices)
    && !recycleRemoteHasOwn(catalog, "schemaVersion")
    && !recycleRemoteHasOwn(catalog, "revision");
}

function recycleRemoteNormalizeExternalLegacyMaterialIds(value) {
  return (Array.isArray(value) ? value : [])
    .map(item => recycleRemoteTrim(item))
    .filter(Boolean);
}

function recycleRemoteIsExtensionRelativeImagePath(value) {
  const pathValue = recycleRemoteTrim(value);
  if (!pathValue) return false;
  if (!pathValue.startsWith("images/")) return false;
  if (/^(?:[A-Za-z]:|[\\/])/i.test(pathValue) || /(?:file:\/\/|https?:\/\/)/i.test(pathValue)) return false;
  if (pathValue.includes("\\") || pathValue.includes("..")) return false;
  return /\.(?:webp|png|jpe?g)$/i.test(pathValue);
}

function recycleRemoteNormalizeExternalImagePath(value) {
  const pathValue = recycleRemoteTrim(value);
  if (!pathValue) return "";
  if (recycleRemoteIsSafeHttpsImageUrl(pathValue)) return pathValue;
  if (recycleRemoteIsExtensionRelativeImagePath(pathValue)) return pathValue;
  return "";
}

function recycleRemoteNormalizeExternalSimpleDevice(device) {
  return {
    deviceId: recycleRemoteTrim(device?.deviceId),
    categoryId: recycleRemoteTrim(device?.categoryId),
    displayName: recycleRemoteTrim(device?.displayName),
    materialId: recycleRemoteTrim(device?.materialId),
    legacyMaterialIds: recycleRemoteNormalizeExternalLegacyMaterialIds(
      Array.isArray(device?.legacyMaterialIdsJson) ? device.legacyMaterialIdsJson : device?.legacyMaterialIds
    ),
    imagePath: recycleRemoteNormalizeExternalImagePath(device?.imagePath),
    helpImagePath: recycleRemoteNormalizeExternalImagePath(device?.helpImagePath),
    warningText: recycleRemoteTrim(device?.warningText),
    validationProfileId: recycleRemoteTrim(device?.validationProfileId),
    enabled: device?.enabled !== false
  };
}

function recycleRemoteBuildGeneratedMaterialFiltersMetadata(devices) {
  return (Array.isArray(devices) ? devices : []).reduce((filters, device) => {
    if (device?.enabled === false) return filters;
    const categoryId = recycleRemoteTrim(device?.categoryId);
    const materialId = recycleRemoteTrim(device?.materialId);
    if (!categoryId || !materialId) return filters;
    if (!filters[categoryId]) filters[categoryId] = [];
    filters[categoryId].push(materialId);
    return filters;
  }, {});
}

function recycleRemoteBuildExternalRemoteMaterialModels(devices) {
  return (Array.isArray(devices) ? devices : [])
    .filter(device => recycleRemoteTrim(device?.materialId))
    .map(device => {
      const materialId = recycleRemoteTrim(device.materialId);
      const deviceId = recycleRemoteTrim(device.deviceId);
      const nameBase = recycleRemoteTrim(device.displayName) || deviceId || materialId;
      return {
        materialId,
        deviceId,
        categoryId: recycleRemoteTrim(device.categoryId),
        name: `${nameBase} SAP ${materialId}`
      };
    });
}

function recycleRemoteAdaptExternalSimpleCatalog(catalog, context) {
  const devices = (Array.isArray(catalog?.devices) ? catalog.devices : [])
    .map(recycleRemoteNormalizeExternalSimpleDevice);
  const validationProfiles = Array.from(new Set(devices
    .map(device => recycleRemoteTrim(device.validationProfileId))
    .filter(Boolean)));
  const rawText = context?.rawText || JSON.stringify(catalog || {});
  const hash = recycleRemoteBuildStableContentHash(rawText);

  return {
    sourceFormat: "external_simple_v1",
    catalog: {
      schemaVersion: 1,
      revision: `external-simple:${hash}`,
      devices,
      categoryHelp: {},
      validationProfiles,
      generatedMaterialFilters: recycleRemoteBuildGeneratedMaterialFiltersMetadata(devices),
      runtimeContract: {
        contractVersion: 1,
        supportedCapabilities: [
          "remoteAdditionsAuto",
          "remoteMaterialAuto",
          "remoteMaterialModelsAuto",
          "remoteMaterialPreview",
          "resolvedApplyPlan"
        ],
        blockedCapabilities: RECYCLE_REMOTE_RUNTIME_CONTRACT.blockedCapabilities.slice()
      },
      remoteMaterialModels: recycleRemoteBuildExternalRemoteMaterialModels(devices)
    }
  };
}

function recycleRemoteCanAdaptExternalSimpleCatalog(source) {
  return recycleRemoteIsExternalSimpleSourceUrl(source?.activeSourceUrl);
}

function recycleRemoteAdaptCatalogForSource(catalog, context) {
  if (recycleRemoteIsExternalSimpleCatalog(catalog) && recycleRemoteCanAdaptExternalSimpleCatalog(context?.source)) {
    return recycleRemoteAdaptExternalSimpleCatalog(catalog, context);
  }
  return {
    sourceFormat: "oss_remote_v1",
    catalog
  };
}

function recycleRemoteNormalizeRuntimeContract(value) {
  if (value == null) return null;
  if (!recycleRemoteIsPlainObject(value)) {
    return { invalidType: Object.prototype.toString.call(value) };
  }

  const fieldPolicy = {};
  if (recycleRemoteIsPlainObject(value.fieldPolicy)) {
    Object.keys(value.fieldPolicy).slice(0, 50).forEach(fieldName => {
      const field = recycleRemoteTrim(fieldName);
      const policy = recycleRemoteTrim(value.fieldPolicy[fieldName]);
      if (field && policy) fieldPolicy[field] = policy;
    });
  }

  return {
    contractVersion: value.contractVersion,
    minExtensionVersion: recycleRemoteTrim(value.minExtensionVersion),
    supportedCapabilities: recycleRemoteNormalizeStringArray(value.supportedCapabilities),
    blockedCapabilities: recycleRemoteNormalizeStringArray(value.blockedCapabilities),
    fieldPolicy
  };
}

function recycleRemoteEvaluateCatalogContract(catalog, meta) {
  const schemaVersion = meta?.schemaVersion ?? catalog?.schemaVersion ?? null;
  const runtimeContract = catalog?.runtimeContract || null;
  const warnings = [];
  const errors = [];
  const extensionVersion = recycleRemoteGetExtensionVersion();

  if (!catalog) {
    return {
      ok: true,
      mode: "no_data",
      schemaVersion,
      contractVersion: null,
      extensionVersion,
      warnings,
      errors
    };
  }

  if (!RECYCLE_REMOTE_RUNTIME_CONTRACT.supportedSchemaVersions.includes(schemaVersion)) {
    errors.push(`unsupported schemaVersion ${schemaVersion}`);
  }

  if (!runtimeContract) {
    warnings.push("runtimeContract missing; using legacy v1 compatibility");
    return {
      ok: errors.length === 0,
      mode: "legacy_v1",
      schemaVersion,
      contractVersion: null,
      extensionVersion,
      supportedCapabilities: RECYCLE_REMOTE_RUNTIME_CONTRACT.supportedCapabilities.slice(),
      blockedCapabilities: RECYCLE_REMOTE_RUNTIME_CONTRACT.blockedCapabilities.slice(),
      warnings,
      errors
    };
  }

  if (runtimeContract.invalidType) {
    errors.push(`runtimeContract must be an object, got ${runtimeContract.invalidType}`);
  }

  const contractVersion = Number(runtimeContract.contractVersion || 0);
  if (!Number.isInteger(contractVersion) || contractVersion <= 0) {
    errors.push("runtimeContract.contractVersion is required");
  } else if (!RECYCLE_REMOTE_RUNTIME_CONTRACT.supportedContractVersions.includes(contractVersion)) {
    errors.push(`unsupported runtimeContract.contractVersion ${contractVersion}`);
  }

  const minExtensionVersion = recycleRemoteTrim(runtimeContract.minExtensionVersion);
  if (minExtensionVersion && recycleRemoteCompareVersions(extensionVersion, minExtensionVersion) < 0) {
    errors.push(`requires extension ${minExtensionVersion}`);
  }

  const supportedCapabilities = recycleRemoteNormalizeStringArray(runtimeContract.supportedCapabilities);
  const blockedCapabilities = recycleRemoteNormalizeStringArray(runtimeContract.blockedCapabilities);
  const unknownCapabilities = supportedCapabilities
    .filter(capability => !RECYCLE_REMOTE_RUNTIME_CONTRACT.supportedCapabilities.includes(capability))
    .slice(0, RECYCLE_REMOTE_CONTRACT_SAMPLE_LIMIT);
  if (unknownCapabilities.length) {
    warnings.push(`unsupported capabilities ignored: ${unknownCapabilities.join(",")}`);
  }

  const blockedRuntimeControl = supportedCapabilities
    .filter(capability => RECYCLE_REMOTE_RUNTIME_CONTRACT.blockedCapabilities.includes(capability))
    .slice(0, RECYCLE_REMOTE_CONTRACT_SAMPLE_LIMIT);
  if (blockedRuntimeControl.length) {
    errors.push(`blocked capabilities requested: ${blockedRuntimeControl.join(",")}`);
  }

  return {
    ok: errors.length === 0,
    mode: "explicit_contract",
    schemaVersion,
    contractVersion: Number.isInteger(contractVersion) && contractVersion > 0 ? contractVersion : null,
    minExtensionVersion,
    extensionVersion,
    supportedCapabilities: supportedCapabilities
      .filter(capability => RECYCLE_REMOTE_RUNTIME_CONTRACT.supportedCapabilities.includes(capability)),
    blockedCapabilities: blockedCapabilities.slice(0, RECYCLE_REMOTE_CONTRACT_SAMPLE_LIMIT),
    warnings,
    errors
  };
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

function dailyworkTrim(value) {
  return String(value || "").trim();
}

function dailyworkNowIso() {
  return new Date().toISOString();
}

function dailyworkNormalizeItem(item, rawIndex) {
  const user = dailyworkTrim(item?.User ?? item?.user);
  const names = dailyworkTrim(item?.Names ?? item?.names);
  const device = dailyworkTrim(item?.Device ?? item?.device);
  const reasons = [];
  if (!user) reasons.push("missing user");
  if (!device) reasons.push("missing device");
  if (reasons.length) return { ok: false, rawIndex, reasons };
  return {
    ok: true,
    item: {
      user,
      names,
      device,
      rawIndex
    }
  };
}

function dailyworkBuildValidatedPayload(raw, context = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Dailywork JSON must be an object" };
  }
  if (!Array.isArray(raw.items)) {
    return { ok: false, error: "Dailywork JSON must contain an items array" };
  }

  const items = [];
  let invalidItemCount = 0;
  raw.items.forEach((entry, index) => {
    const normalized = dailyworkNormalizeItem(entry, index);
    if (normalized.ok) items.push(normalized.item);
    else invalidItemCount += 1;
  });

  if (!items.length) {
    return { ok: false, error: "Dailywork JSON has no valid items" };
  }

  return {
    ok: true,
    payload: {
      version: 1,
      sourceUrl: DAILYWORK_SCHEDULE_URL,
      generatedAt: dailyworkTrim(raw.generatedAt || raw.GeneratedAt),
      dayOfWeek: dailyworkTrim(raw.dayOfWeek || raw.DayOfWeek),
      fetchedAt: dailyworkTrim(context.fetchedAt) || dailyworkNowIso(),
      itemCount: raw.items.length,
      validItemCount: items.length,
      invalidItemCount,
      items
    }
  };
}

function dailyworkBuildCompactResponse(payload, options = {}) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const uniqueUsers = new Set();
  const uniqueDevices = new Set();
  items.forEach(item => {
    const user = dailyworkTrim(item?.user);
    const device = dailyworkTrim(item?.device);
    if (user) uniqueUsers.add(user);
    if (device) uniqueDevices.add(device);
  });

  return {
    ok: options.ok !== false,
    source: options.source || "remote",
    generatedAt: dailyworkTrim(payload?.generatedAt),
    dayOfWeek: dailyworkTrim(payload?.dayOfWeek),
    itemCount: Number(payload?.itemCount || items.length || 0),
    validItemCount: Number(payload?.validItemCount || items.length || 0),
    invalidItemCount: Number(payload?.invalidItemCount || 0),
    uniqueUserCount: uniqueUsers.size,
    uniqueDeviceCount: uniqueDevices.size,
    fetchedAt: dailyworkTrim(payload?.fetchedAt || options.fetchedAt),
    warnings: Array.isArray(options.warnings) ? options.warnings.map(dailyworkTrim).filter(Boolean) : [],
    error: dailyworkTrim(options.error)
  };
}

function dailyworkAttachItemsForResponse(response, payload, options = {}) {
  if (!options.includeItems) return response;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return {
    ...response,
    items: items.map(item => ({
      user: dailyworkTrim(item?.user),
      names: dailyworkTrim(item?.names),
      device: dailyworkTrim(item?.device),
      rawIndex: Number.isFinite(Number(item?.rawIndex)) ? Number(item.rawIndex) : null
    }))
  };
}

function dailyworkStripItemsForResponse(response, options = {}) {
  if (options.includeItems || !response || typeof response !== "object") return response;
  const { items, ...summary } = response;
  return summary;
}

function dailyworkValidateCachedPayload(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.items)) return null;
  const rebuilt = dailyworkBuildValidatedPayload({ ...payload, items: payload.items }, { fetchedAt: payload.fetchedAt });
  if (!rebuilt.ok) return null;
  return {
    ...rebuilt.payload,
    generatedAt: dailyworkTrim(payload.generatedAt),
    dayOfWeek: dailyworkTrim(payload.dayOfWeek),
    fetchedAt: dailyworkTrim(payload.fetchedAt),
    itemCount: Number(payload.itemCount || rebuilt.payload.itemCount || 0),
    validItemCount: Number(payload.validItemCount || rebuilt.payload.validItemCount || 0),
    invalidItemCount: Number(payload.invalidItemCount || 0)
  };
}

async function dailyworkReadLastKnownGood() {
  const keys = DAILYWORK_CACHE_KEYS;
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta]);
  return {
    payload: dailyworkValidateCachedPayload(stored[keys.lkg]),
    meta: stored[keys.meta] || null
  };
}

async function dailyworkFetchScheduleFresh(options = {}) {
  const fetchedAt = dailyworkNowIso();
  const response = await recycleRemoteFetchWithTimeout(
    DAILYWORK_SCHEDULE_URL,
    { cache: "no-store", headers: { Accept: "application/json" } },
    DAILYWORK_FETCH_TIMEOUT_MS
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const { text, byteLength } = await recycleRemoteReadTextWithLimit(response, DAILYWORK_MAX_BYTES);
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error("Invalid dailywork JSON");
  }

  const validation = dailyworkBuildValidatedPayload(parsed, { fetchedAt });
  if (!validation.ok) throw new Error(validation.error || "Dailywork validation failed");

  const payload = validation.payload;
  const meta = {
    sourceUrl: DAILYWORK_SCHEDULE_URL,
    fetchedAt,
    byteLength,
    itemCount: payload.itemCount,
    validItemCount: payload.validItemCount,
    invalidItemCount: payload.invalidItemCount
  };
  await recycleRemoteChromeSet({
    [DAILYWORK_CACHE_KEYS.lkg]: payload,
    [DAILYWORK_CACHE_KEYS.meta]: meta
  });
  return dailyworkAttachItemsForResponse(
    dailyworkBuildCompactResponse(payload, { source: "remote", fetchedAt, warnings: [] }),
    payload,
    options
  );
}

let dailyworkFetchInFlight = null;
async function dailyworkFetchSchedule(options = {}) {
  if (!dailyworkFetchInFlight) {
    dailyworkFetchInFlight = (async () => {
      const internalOptions = { includeItems: true };
      try {
        return await dailyworkFetchScheduleFresh(internalOptions);
      } catch (error) {
        const fallback = await dailyworkReadLastKnownGood().catch(() => ({ payload: null, meta: null }));
        const errorMessage = error?.name === "AbortError" ? "Request timed out" : String(error?.message || error || "Dailywork fetch failed");
        if (fallback.payload) {
          return dailyworkAttachItemsForResponse(
            dailyworkBuildCompactResponse(fallback.payload, {
              source: "cache",
              fetchedAt: fallback.payload.fetchedAt || fallback.meta?.fetchedAt,
              warnings: [`remote fetch failed: ${errorMessage}`]
            }),
            fallback.payload,
            internalOptions
          );
        }
        return {
          ok: false,
          source: "remote",
          generatedAt: "",
          dayOfWeek: "",
          itemCount: 0,
          validItemCount: 0,
          invalidItemCount: 0,
          uniqueUserCount: 0,
          uniqueDeviceCount: 0,
          fetchedAt: "",
          warnings: [],
          error: errorMessage
        };
      } finally {
        dailyworkFetchInFlight = null;
      }
    })();
  }
  return dailyworkStripItemsForResponse(await dailyworkFetchInFlight, options);
}

function recycleRemoteAddIssue(issues, code, message) {
  issues.push({ code, message });
}

function recycleRemoteIsSafeId(value) {
  return /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(String(value || ""));
}

function recycleRemoteIsSafeProfileId(value) {
  return /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(String(value || ""));
}

function recycleRemoteIsSafeHttpsImageUrl(value) {
  const raw = recycleRemoteTrim(value);
  if (!raw) return false;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    return false;
  }
  return parsed.protocol === "https:"
    && !parsed.username
    && !parsed.password
    && Boolean(parsed.hostname);
}

function recycleRemoteValidateAssetPath(pathValue, fieldName, label, issues) {
  const value = recycleRemoteTrim(pathValue);
  if (!value) return "";
  if (recycleRemoteIsSafeHttpsImageUrl(value)) return value;
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

function recycleRemoteValidateRemoteMaterialModels(value, issues) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    recycleRemoteAddIssue(issues, "remoteMaterialModels.notArray", "remoteMaterialModels must be an array when present");
    return [];
  }

  return value
    .map((model, index) => {
      const label = `remoteMaterialModels[${index}]`;
      if (!recycleRemoteIsPlainObject(model)) {
        recycleRemoteAddIssue(issues, "remoteMaterialModel.notObject", `${label} must be an object`);
        return null;
      }

      Object.keys(model).forEach((field) => {
        if (!RECYCLE_REMOTE_MATERIAL_MODEL_FIELDS.includes(field)) {
          recycleRemoteAddIssue(issues, "remoteMaterialModel.unknownField", `${label} has unknown field ${field}`);
        }
      });

      const materialId = recycleRemoteTrim(model.materialId);
      const deviceId = recycleRemoteTrim(model.deviceId);
      const categoryId = recycleRemoteTrim(model.categoryId);
      const name = recycleRemoteTrim(model.name);
      const idLabel = materialId || deviceId || label;

      if (!materialId) recycleRemoteAddIssue(issues, "remoteMaterialModel.missingMaterialId", `${label} is missing materialId`);
      else if (!/^\d+$/.test(materialId)) recycleRemoteAddIssue(issues, "remoteMaterialModel.invalidMaterialId", `${idLabel} materialId must be digits-only`);
      if (!deviceId || !recycleRemoteIsSafeId(deviceId)) recycleRemoteAddIssue(issues, "remoteMaterialModel.invalidDeviceId", `${idLabel} has invalid deviceId`);
      if (!categoryId || !recycleRemoteIsSafeId(categoryId)) recycleRemoteAddIssue(issues, "remoteMaterialModel.invalidCategoryId", `${idLabel} has invalid categoryId`);
      if (!name) recycleRemoteAddIssue(issues, "remoteMaterialModel.missingName", `${idLabel} is missing name`);
      else if (name.length > 120) recycleRemoteAddIssue(issues, "remoteMaterialModel.nameTooLong", `${idLabel} name is too long`);

      return {
        materialId,
        deviceId,
        categoryId,
        name
      };
    })
    .filter(Boolean);
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
    if (!RECYCLE_REMOTE_EXPECTED_TOP_LEVEL_KEYS.includes(key) && !RECYCLE_REMOTE_OPTIONAL_TOP_LEVEL_KEYS.includes(key)) {
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
  const remoteMaterialModels = recycleRemoteValidateRemoteMaterialModels(catalog.remoteMaterialModels, issues);

  return {
    ok: issues.length === 0,
    errors: issues,
    sanitized: issues.length ? null : {
      schemaVersion: 1,
      revision,
      devices,
      categoryHelp,
      validationProfiles: profiles,
      generatedMaterialFilters,
      remoteMaterialModels,
      runtimeContract: recycleRemoteNormalizeRuntimeContract(catalog.runtimeContract)
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

function recycleRemoteBuildStatusResponse(stored, result, activeSource) {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const status = stored?.[keys.status] || null;
  const meta = stored?.[keys.meta] || null;
  const lkg = stored?.[keys.lkg] || null;
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
    hasLastKnownGood,
    contractCompatibility: recycleRemoteEvaluateCatalogContract(lkg, meta),
    ...recycleRemoteBuildSourceResponseFields(activeSource)
  };
}

async function recycleRemoteGetStatus() {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.enabled, keys.sourceOverride]);
  const source = recycleRemoteResolveActiveSource(stored);
  return recycleRemoteBuildStatusResponse(recycleRemoteScopeStoredToActiveSource(stored, source), "status", source);
}

async function recycleRemoteSetAutoRefreshEnabled(enabled) {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  await recycleRemoteChromeSet({ [keys.enabled]: enabled === true });
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.enabled, keys.sourceOverride]);
  const source = recycleRemoteResolveActiveSource(stored);
  return recycleRemoteBuildStatusResponse(
    recycleRemoteScopeStoredToActiveSource(stored, source),
    enabled === true ? "auto_refresh_enabled" : "auto_refresh_disabled",
    source
  );
}

async function recycleRemoteMaybeRefresh() {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.enabled, keys.sourceOverride]);
  const source = recycleRemoteResolveActiveSource(stored);
  const current = recycleRemoteBuildStatusResponse(recycleRemoteScopeStoredToActiveSource(stored, source), "status", source);
  const normalRefreshEnabled = recycleRemoteIsNormalExternalSource(source);
  if (!current.autoRefreshEnabled && !normalRefreshEnabled) {
    return { ...current, result: "disabled", autoRefreshAttempted: false, errors: [] };
  }
  if (!current.isStale) {
    return { ...current, result: "fresh", autoRefreshAttempted: false, errors: [] };
  }

  const refreshed = await recycleRemoteRefresh();
  const after = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.enabled, keys.sourceOverride]);
  const nextSource = recycleRemoteResolveActiveSource(after);
  const next = recycleRemoteBuildStatusResponse(
    recycleRemoteScopeStoredToActiveSource(after, nextSource),
    refreshed.result || "refreshed",
    nextSource
  );
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
  if (recycleRemoteIsSafeHttpsImageUrl(pathValue)) return "";
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

function recycleRemoteBuildRemoteMaterialModelSample(model, reasons, warnings) {
  return {
    materialId: recycleRemoteTrim(model?.materialId),
    deviceId: recycleRemoteTrim(model?.deviceId),
    displayName: recycleRemoteTrim(model?.name),
    categoryId: recycleRemoteTrim(model?.categoryId),
    reasons: Array.isArray(reasons) ? reasons.slice(0, RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT) : [],
    warnings: Array.isArray(warnings) ? warnings.slice(0, RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT) : []
  };
}

function recycleRemoteBuildEligibilityContextWithRemoteMaterialModels(eligibilityContext, remoteMaterialModelEntries) {
  const materialIds = []
    .concat(Array.isArray(eligibilityContext?.materialModelIds) ? eligibilityContext.materialModelIds : [])
    .concat(Array.isArray(remoteMaterialModelEntries)
      ? remoteMaterialModelEntries.map(entry => recycleRemoteTrim(entry?.materialId))
      : [])
    .filter(Boolean);
  return {
    ...(eligibilityContext || {}),
    materialModelIds: Array.from(new Set(materialIds))
  };
}

function recycleRemoteContractSupportsCapability(contractCompatibility, capability) {
  if (!contractCompatibility || contractCompatibility.ok === false) return false;
  if (contractCompatibility.mode !== "explicit_contract") return false;
  const supported = Array.isArray(contractCompatibility.supportedCapabilities)
    ? contractCompatibility.supportedCapabilities
    : [];
  return supported.includes(capability);
}

function recycleRemoteBuildRemoteMaterialModelPlan(remoteCatalog, localMap, eligibilityContext, contractCompatibility) {
  const entries = [];
  const blocked = [];
  const materialIds = new Set();
  const deviceIds = new Set();
  const localMaterialIds = recycleRemoteBuildPreviewSet(eligibilityContext?.materialModelIds);
  const normalCategoryIds = recycleRemoteBuildPreviewSet(eligibilityContext?.normalCategoryIds);
  const specialCategoryIds = recycleRemoteBuildPreviewSet(eligibilityContext?.specialCategoryIds);
  const remoteMap = new Map();

  if (!recycleRemoteContractSupportsCapability(contractCompatibility, "remoteMaterialModelsAuto")) {
    return {
      entries,
      blocked,
      materialModelIds: []
    };
  }

  (Array.isArray(remoteCatalog?.devices) ? remoteCatalog.devices : []).forEach(device => {
    const remote = recycleRemoteNormalizePreviewDevice(device);
    if (remote && !remoteMap.has(remote.deviceId)) remoteMap.set(remote.deviceId, remote);
  });

  (Array.isArray(remoteCatalog?.remoteMaterialModels) ? remoteCatalog.remoteMaterialModels : []).forEach(model => {
    const materialId = recycleRemoteTrim(model?.materialId);
    const deviceId = recycleRemoteTrim(model?.deviceId);
    const categoryId = recycleRemoteTrim(model?.categoryId);
    const name = recycleRemoteTrim(model?.name);
    const reasons = [];
    const warnings = [];

    if (!materialId || !/^\d+$/.test(materialId)) reasons.push("invalid materialId");
    else if (materialIds.has(materialId)) reasons.push(`duplicate remote material ${materialId}`);
    else if (localMaterialIds.has(materialId)) reasons.push(`material already local ${materialId}`);

    if (!deviceId || !recycleRemoteIsSafeId(deviceId)) reasons.push("invalid deviceId");
    else if (deviceIds.has(deviceId)) reasons.push(`duplicate remote material device ${deviceId}`);
    else if (localMap?.has?.(deviceId)) reasons.push(`bound device already local ${deviceId}`);

    if (!categoryId || !recycleRemoteIsSafeId(categoryId)) reasons.push("invalid categoryId");
    else if (specialCategoryIds.has(categoryId)) reasons.push(`special category ${categoryId}`);
    else if (!normalCategoryIds.has(categoryId)) reasons.push(`unknown category ${categoryId}`);

    if (!name) reasons.push("missing name");
    else if (name.length > 120) reasons.push("name too long");

    const remoteDevice = remoteMap.get(deviceId);
    if (!remoteDevice) {
      reasons.push(`unknown bound device ${deviceId || "(empty)"}`);
    } else {
      if (remoteDevice.categoryId !== categoryId) reasons.push("category mismatch");
      if (recycleRemoteTrim(remoteDevice.materialId) !== materialId) reasons.push("material mismatch");
      if (remoteDevice.enabled === false) reasons.push("disabled");
      if (Array.isArray(remoteDevice.legacyMaterialIds) && remoteDevice.legacyMaterialIds.length) reasons.push("legacyMaterialIds unsupported");

      if (reasons.length === 0) {
        const effectiveContext = recycleRemoteBuildEligibilityContextWithRemoteMaterialModels(eligibilityContext, [{ materialId }]);
        const eligibility = recycleRemoteClassifyUnknownDeviceEligibility(remoteDevice, localMap, effectiveContext);
        if (!eligibility.eligible) reasons.push(...eligibility.reasons);
        if (eligibility.warnings.length) warnings.push(...eligibility.warnings);
      }
    }

    if (materialId) materialIds.add(materialId);
    if (deviceId) deviceIds.add(deviceId);

    if (reasons.length) {
      blocked.push(recycleRemoteBuildRemoteMaterialModelSample(model, reasons, warnings));
      return;
    }

    entries.push({
      materialId,
      deviceId,
      categoryId,
      name
    });
  });

  return {
    entries,
    blocked,
    materialModelIds: entries.map(entry => entry.materialId).filter(Boolean)
  };
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

  const contractCompatibility = recycleRemoteEvaluateCatalogContract(remoteCatalog, meta);
  const localMap = new Map();
  (Array.isArray(localDevices) ? localDevices : []).forEach(device => {
    const normalized = recycleRemoteNormalizePreviewDevice(device);
    if (normalized && !localMap.has(normalized.deviceId)) {
      localMap.set(normalized.deviceId, normalized);
    }
  });
  const remoteMaterialModels = recycleRemoteBuildRemoteMaterialModelPlan(remoteCatalog, localMap, eligibilityContext, contractCompatibility);
  const effectiveEligibilityContext = recycleRemoteBuildEligibilityContextWithRemoteMaterialModels(
    eligibilityContext,
    remoteMaterialModels.entries
  );

  const remoteMap = new Map();
  (Array.isArray(remoteCatalog.devices) ? remoteCatalog.devices : []).forEach(device => {
    const remote = recycleRemoteNormalizePreviewDevice(device);
    if (!remote || remoteMap.has(remote.deviceId)) return;
    remoteMap.set(remote.deviceId, remote);

    const local = localMap.get(remote.deviceId);
    if (!local) {
      summary.unknownRemoteDevices += 1;
      recycleRemotePushPreviewSample(samples, "unknownRemoteDevices", recycleRemoteBuildPreviewSample(remote, []));
      const eligibility = recycleRemoteClassifyUnknownDeviceEligibility(remote, localMap, effectiveEligibilityContext);
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
    samples,
    remoteMaterialModels
  };
}

function recycleRemoteProjectEligibleDeviceAddition(remote) {
  return {
    deviceId: recycleRemoteTrim(remote?.deviceId),
    categoryId: recycleRemoteTrim(remote?.categoryId),
    displayName: recycleRemoteTrim(remote?.displayName),
    materialId: recycleRemoteTrim(remote?.materialId),
    imagePath: recycleRemoteTrim(remote?.imagePath),
    helpImagePath: recycleRemoteTrim(remote?.helpImagePath),
    warningText: recycleRemoteTrim(remote?.warningText),
    validationProfileId: recycleRemoteTrim(remote?.validationProfileId),
    enabled: remote?.enabled !== false
  };
}

function recycleRemoteBuildEligibleDeviceAdditions(localDevices, remoteCatalog, meta, status, eligibilityContext) {
  const summary = {
    unknownRemoteDevices: 0,
    eligible: 0,
    blocked: 0
  };
  const samples = {
    eligible: [],
    blocked: []
  };
  const additions = [];

  if (!remoteCatalog) {
    return {
      ok: true,
      result: "no_data",
      meta: meta || null,
      status: status || null,
      summary,
      samples,
      additions
    };
  }

  const localMap = new Map();
  (Array.isArray(localDevices) ? localDevices : []).forEach(device => {
    const normalized = recycleRemoteNormalizePreviewDevice(device);
    if (normalized && !localMap.has(normalized.deviceId)) {
      localMap.set(normalized.deviceId, normalized);
    }
  });
  const contractCompatibility = recycleRemoteEvaluateCatalogContract(remoteCatalog, meta);
  const remoteMaterialModels = recycleRemoteBuildRemoteMaterialModelPlan(remoteCatalog, localMap, eligibilityContext, contractCompatibility);
  const effectiveEligibilityContext = recycleRemoteBuildEligibilityContextWithRemoteMaterialModels(
    eligibilityContext,
    remoteMaterialModels.entries
  );

  const remoteSeen = new Set();
  (Array.isArray(remoteCatalog.devices) ? remoteCatalog.devices : []).forEach(device => {
    const remote = recycleRemoteNormalizePreviewDevice(device);
    if (!remote || remoteSeen.has(remote.deviceId)) return;
    remoteSeen.add(remote.deviceId);
    if (localMap.has(remote.deviceId)) return;

    summary.unknownRemoteDevices += 1;
    const eligibility = recycleRemoteClassifyUnknownDeviceEligibility(remote, localMap, effectiveEligibilityContext);
    if (eligibility.eligible) {
      summary.eligible += 1;
      additions.push(recycleRemoteProjectEligibleDeviceAddition(remote));
      recycleRemotePushPreviewSample(samples, "eligible", recycleRemoteBuildUnknownEligibilitySample(remote, [], eligibility.warnings));
    } else {
      summary.blocked += 1;
      recycleRemotePushPreviewSample(samples, "blocked", recycleRemoteBuildUnknownEligibilitySample(remote, eligibility.reasons, eligibility.warnings));
    }
  });

  return {
    ok: true,
    result: additions.length ? "ok" : "no_eligible",
    meta: meta || null,
    status: status || null,
    summary,
    samples,
    additions,
    remoteMaterialModels
  };
}

function recycleRemoteMergePreviewSamples(sampleGroups) {
  const merged = [];
  (Array.isArray(sampleGroups) ? sampleGroups : []).forEach(group => {
    (Array.isArray(group) ? group : []).forEach(sample => {
      if (merged.length >= RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT) return;
      merged.push(recycleRemoteBuildPreviewSample(sample, sample?.fields || []));
    });
  });
  return merged;
}

function recycleRemoteBuildResolvedCatalogPlan(localDevices, remoteCatalog, meta, status, eligibilityContext) {
  const preview = recycleRemoteBuildCatalogDiffPreview(localDevices, remoteCatalog, meta, status, eligibilityContext);
  const additions = recycleRemoteBuildEligibleDeviceAdditions(localDevices, remoteCatalog, meta, status, eligibilityContext);
  const sourceRevision = recycleRemoteTrim(meta?.revision || remoteCatalog?.revision);
  const schemaVersion = meta?.schemaVersion ?? remoteCatalog?.schemaVersion ?? null;
  const contractCompatibility = recycleRemoteEvaluateCatalogContract(remoteCatalog, meta);
  const remoteMaterialModels = additions?.remoteMaterialModels || { entries: [], blocked: [], materialModelIds: [] };
  const materialEligibleAdditions = (Array.isArray(additions.additions) ? additions.additions : [])
    .filter(addition => /^\d+$/.test(recycleRemoteTrim(addition?.materialId)));
  const riskyChanges = Number(preview?.summary?.riskyChanges || 0);
  const blockedUnknown = Number(preview?.summary?.unknownEligibility?.blocked || 0);
  const missingLocalDevices = Number(preview?.summary?.missingLocalDevices || 0);
  const blockedSamples = recycleRemoteMergePreviewSamples([
    preview?.samples?.riskyChanges,
    preview?.samples?.unknownBlockedDevices
  ]);
  const warningSamples = recycleRemoteMergePreviewSamples([
    preview?.samples?.missingLocalDevices,
    preview?.samples?.unknownEligibleDevices
  ]);

  return {
    ok: true,
    result: remoteCatalog ? "resolved_plan" : "no_data",
    appliedMode: "preview_only",
    sourceRevision,
    schemaVersion,
    contractCompatibility,
    meta: meta || null,
    status: status || null,
    counts: {
      visualUpdates: Number(preview?.summary?.visualChanges || 0),
      riskyChanges,
      unknownRemoteDevices: Number(preview?.summary?.unknownRemoteDevices || 0),
      missingLocalDevices,
      eligibleAdditions: Number(additions?.summary?.eligible || 0),
      materialEligibleAdditions: materialEligibleAdditions.length,
      remoteMaterialModels: Array.isArray(remoteMaterialModels.entries) ? remoteMaterialModels.entries.length : 0,
      blocked: riskyChanges + blockedUnknown,
      warnings: missingLocalDevices
    },
    visualUpdates: {
      count: Number(preview?.summary?.visualChanges || 0),
      samples: Array.isArray(preview?.samples?.visualChanges) ? preview.samples.visualChanges.slice(0, RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT) : []
    },
    eligibleAdditions: {
      count: Number(additions?.summary?.eligible || 0),
      samples: Array.isArray(additions?.samples?.eligible) ? additions.samples.eligible.slice(0, RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT) : []
    },
    materialEligibleAdditions: {
      count: materialEligibleAdditions.length,
      samples: Array.isArray(additions?.samples?.eligible) ? additions.samples.eligible.slice(0, RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT) : []
    },
    remoteMaterialModels: {
      count: Array.isArray(remoteMaterialModels.entries) ? remoteMaterialModels.entries.length : 0,
      samples: Array.isArray(remoteMaterialModels.entries)
        ? remoteMaterialModels.entries.slice(0, RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT)
        : [],
      blockedCount: Array.isArray(remoteMaterialModels.blocked) ? remoteMaterialModels.blocked.length : 0,
      blockedSamples: Array.isArray(remoteMaterialModels.blocked)
        ? remoteMaterialModels.blocked.slice(0, RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT)
        : []
    },
    blocked: {
      count: riskyChanges + blockedUnknown,
      samples: blockedSamples
    },
    warnings: {
      count: missingLocalDevices,
      samples: warningSamples
    },
    generatedMaterialFiltersTrusted: false,
    remoteMaterialModelsTrusted: recycleRemoteContractSupportsCapability(contractCompatibility, "remoteMaterialModelsAuto")
  };
}

function recycleRemoteProjectApplySafeEligibleAddition(entry) {
  return {
    deviceId: recycleRemoteTrim(entry?.deviceId),
    categoryId: recycleRemoteTrim(entry?.categoryId),
    displayName: recycleRemoteTrim(entry?.displayName),
    materialId: recycleRemoteTrim(entry?.materialId),
    imagePath: recycleRemoteTrim(entry?.imagePath),
    helpImagePath: recycleRemoteTrim(entry?.helpImagePath),
    warningText: recycleRemoteTrim(entry?.warningText),
    validationProfileId: recycleRemoteTrim(entry?.validationProfileId),
    enabled: entry?.enabled !== false
  };
}

function recycleRemoteBuildResolvedCatalogApplyPlan(localDevices, remoteCatalog, meta, status, eligibilityContext) {
  const previewPlan = recycleRemoteBuildResolvedCatalogPlan(localDevices, remoteCatalog, meta, status, eligibilityContext);
  const additions = recycleRemoteBuildEligibleDeviceAdditions(localDevices, remoteCatalog, meta, status, eligibilityContext);
  const entries = (Array.isArray(additions.additions) ? additions.additions : [])
    .map(recycleRemoteProjectApplySafeEligibleAddition)
    .filter(entry => entry.deviceId);
  const remoteMaterialModelEntries = (Array.isArray(additions?.remoteMaterialModels?.entries)
    ? additions.remoteMaterialModels.entries
    : [])
    .map(entry => ({
      materialId: recycleRemoteTrim(entry?.materialId),
      deviceId: recycleRemoteTrim(entry?.deviceId),
      categoryId: recycleRemoteTrim(entry?.categoryId),
      name: recycleRemoteTrim(entry?.name)
    }))
    .filter(entry => entry.materialId && entry.deviceId && entry.categoryId && entry.name);
  const materialEntries = entries
    .filter(entry => /^\d+$/.test(recycleRemoteTrim(entry?.materialId)));
  const summary = {
    unknownRemoteDevices: Number(additions?.summary?.unknownRemoteDevices || 0),
    eligible: entries.length,
    blocked: Number(additions?.summary?.blocked || 0)
  };

  return {
    ok: true,
    result: remoteCatalog ? (entries.length ? "apply_plan" : "no_eligible") : "no_data",
    appliedMode: "manual_debug_apply_plan",
    sourceRevision: previewPlan.sourceRevision,
    schemaVersion: previewPlan.schemaVersion,
    contractCompatibility: previewPlan.contractCompatibility,
    meta: meta || null,
    status: status || null,
    counts: previewPlan.counts,
    summary,
    eligibleAdditions: {
      count: entries.length,
      entries
    },
    materialEligibleAdditions: {
      count: materialEntries.length,
      entries: materialEntries
    },
    remoteMaterialModels: {
      count: remoteMaterialModelEntries.length,
      entries: remoteMaterialModelEntries,
      blockedCount: Array.isArray(additions?.remoteMaterialModels?.blocked) ? additions.remoteMaterialModels.blocked.length : 0,
      blockedSamples: Array.isArray(additions?.remoteMaterialModels?.blocked)
        ? additions.remoteMaterialModels.blocked.slice(0, RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT)
        : []
    },
    blocked: {
      count: summary.blocked,
      samples: Array.isArray(additions?.samples?.blocked) ? additions.samples.blocked.slice(0, RECYCLE_REMOTE_DIFF_SAMPLE_LIMIT) : []
    },
    generatedMaterialFiltersTrusted: false,
    remoteMaterialModelsTrusted: recycleRemoteContractSupportsCapability(previewPlan.contractCompatibility, "remoteMaterialModelsAuto")
  };
}

async function recycleRemoteGetCatalogDiffPreview(localDevices, eligibilityContext) {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.sourceOverride]);
  const source = recycleRemoteResolveActiveSource(stored);
  const scoped = recycleRemoteScopeStoredToActiveSource(stored, source);
  return {
    ...recycleRemoteBuildCatalogDiffPreview(
    Array.isArray(localDevices) ? localDevices : [],
    scoped[keys.lkg] || null,
    scoped[keys.meta] || null,
    scoped[keys.status] || null,
    eligibilityContext || null
    ),
    ...recycleRemoteBuildSourceResponseFields(source)
  };
}

async function recycleRemoteGetResolvedCatalogPlan(localDevices, eligibilityContext) {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.sourceOverride]);
  const source = recycleRemoteResolveActiveSource(stored);
  const scoped = recycleRemoteScopeStoredToActiveSource(stored, source);
  const sourceStatus = recycleRemoteBuildStatusResponse(scoped, "status", source);
  return {
    ...recycleRemoteBuildResolvedCatalogPlan(
    Array.isArray(localDevices) ? localDevices : [],
    scoped[keys.lkg] || null,
    scoped[keys.meta] || null,
    scoped[keys.status] || null,
    eligibilityContext || null
    ),
    autoRefreshEnabled: sourceStatus.autoRefreshEnabled,
    lastFreshAt: sourceStatus.lastFreshAt,
    ageMs: sourceStatus.ageMs,
    isStale: sourceStatus.isStale,
    hasLastKnownGood: sourceStatus.hasLastKnownGood,
    ...recycleRemoteBuildSourceResponseFields(source)
  };
}

async function recycleRemoteGetResolvedCatalogApplyPlan(localDevices, eligibilityContext) {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.sourceOverride]);
  const source = recycleRemoteResolveActiveSource(stored);
  const scoped = recycleRemoteScopeStoredToActiveSource(stored, source);
  const sourceStatus = recycleRemoteBuildStatusResponse(scoped, "status", source);
  return {
    ...recycleRemoteBuildResolvedCatalogApplyPlan(
    Array.isArray(localDevices) ? localDevices : [],
    scoped[keys.lkg] || null,
    scoped[keys.meta] || null,
    scoped[keys.status] || null,
    eligibilityContext || null
    ),
    autoRefreshEnabled: sourceStatus.autoRefreshEnabled,
    lastFreshAt: sourceStatus.lastFreshAt,
    ageMs: sourceStatus.ageMs,
    isStale: sourceStatus.isStale,
    hasLastKnownGood: sourceStatus.hasLastKnownGood,
    ...recycleRemoteBuildSourceResponseFields(source)
  };
}

async function recycleRemoteGetEligibleDeviceAdditions(localDevices, eligibilityContext) {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.sourceOverride]);
  const source = recycleRemoteResolveActiveSource(stored);
  const scoped = recycleRemoteScopeStoredToActiveSource(stored, source);
  return {
    ...recycleRemoteBuildEligibleDeviceAdditions(
    Array.isArray(localDevices) ? localDevices : [],
    scoped[keys.lkg] || null,
    scoped[keys.meta] || null,
    scoped[keys.status] || null,
    eligibilityContext || null
    ),
    ...recycleRemoteBuildSourceResponseFields(source)
  };
}

async function recycleRemoteGetVisualOverlay() {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.sourceOverride]);
  const source = recycleRemoteResolveActiveSource(stored);
  const scoped = recycleRemoteScopeStoredToActiveSource(stored, source);
  const lkg = scoped[keys.lkg] || null;
  const meta = scoped[keys.meta] || null;
  const status = scoped[keys.status] || null;

  if (!lkg) {
    return {
      ok: true,
      result: "no_data",
      meta,
      status,
      overlay: [],
      ...recycleRemoteBuildSourceResponseFields(source)
    };
  }

  const overlay = recycleRemoteProjectVisualOverlay(lkg);
  return {
    ok: true,
    result: overlay.length ? "ok" : "no_overlay",
    meta,
    status,
    overlay,
    ...recycleRemoteBuildSourceResponseFields(source)
  };
}

async function recycleRemoteClearCache() {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.enabled, keys.sourceOverride]);
  const autoRefreshEnabled = stored[keys.enabled] === true;
  const source = recycleRemoteResolveActiveSource(stored);
  await recycleRemoteChromeRemove([keys.lkg, keys.meta, keys.status]);
  return {
    ok: true,
    result: "cleared",
    status: recycleRemoteBuildStatus("cleared", Date.now(), { lastAttemptAt: recycleRemoteNowIso() }),
    meta: null,
    contractCompatibility: recycleRemoteEvaluateCatalogContract(null, null),
    enabled: autoRefreshEnabled,
    autoRefreshEnabled,
    ttlMs: RECYCLE_REMOTE_CONFIG_AUTO_REFRESH_TTL_MS,
    lastFreshAt: "",
    ageMs: null,
    isStale: true,
    hasLastKnownGood: false,
    errors: [],
    ...recycleRemoteBuildSourceResponseFields(source)
  };
}

async function recycleRemoteSetSourceOverride(rawUrl) {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.enabled, keys.sourceOverride]);
  const autoRefreshEnabled = stored[keys.enabled] === true;
  const currentSource = recycleRemoteResolveActiveSource(stored);
  const validation = recycleRemoteValidateSourceOverrideUrl(rawUrl);
  if (!validation.ok) {
    return {
      ok: false,
      result: "source_rejected",
      error: validation.error || "Invalid source URL",
      status: recycleRemoteBuildStatus("source_rejected", Date.now(), {
        lastAttemptAt: recycleRemoteNowIso(),
        lastError: validation.error || "Invalid source URL"
      }),
      meta: null,
      contractCompatibility: recycleRemoteEvaluateCatalogContract(null, null),
      enabled: autoRefreshEnabled,
      autoRefreshEnabled,
      ttlMs: RECYCLE_REMOTE_CONFIG_AUTO_REFRESH_TTL_MS,
      lastFreshAt: "",
      ageMs: null,
      isStale: true,
      hasLastKnownGood: false,
      errors: [{ code: "source.invalid", message: validation.error || "Invalid source URL" }],
      ...recycleRemoteBuildSourceResponseFields(currentSource)
    };
  }

  const override = { url: validation.url, setAt: recycleRemoteNowIso() };
  await recycleRemoteChromeSet({ [keys.sourceOverride]: override });
  await recycleRemoteChromeRemove([keys.lkg, keys.meta, keys.status]);
  const source = recycleRemoteResolveActiveSource({ [keys.sourceOverride]: override });
  return {
    ok: true,
    result: "source_override_set",
    status: recycleRemoteBuildStatus("source_override_set", Date.now(), { lastAttemptAt: override.setAt }),
    meta: null,
    contractCompatibility: recycleRemoteEvaluateCatalogContract(null, null),
    enabled: autoRefreshEnabled,
    autoRefreshEnabled,
    ttlMs: RECYCLE_REMOTE_CONFIG_AUTO_REFRESH_TTL_MS,
    lastFreshAt: "",
    ageMs: null,
    isStale: true,
    hasLastKnownGood: false,
    errors: [],
    ...recycleRemoteBuildSourceResponseFields(source)
  };
}

async function recycleRemoteClearSourceOverride() {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const stored = await recycleRemoteChromeGet([keys.enabled]);
  const autoRefreshEnabled = stored[keys.enabled] === true;
  await recycleRemoteChromeRemove([keys.sourceOverride, keys.lkg, keys.meta, keys.status]);
  const source = recycleRemoteBuildProductionSource();
  return {
    ok: true,
    result: "source_override_cleared",
    status: recycleRemoteBuildStatus("source_override_cleared", Date.now(), { lastAttemptAt: recycleRemoteNowIso() }),
    meta: null,
    contractCompatibility: recycleRemoteEvaluateCatalogContract(null, null),
    enabled: autoRefreshEnabled,
    autoRefreshEnabled,
    ttlMs: RECYCLE_REMOTE_CONFIG_AUTO_REFRESH_TTL_MS,
    lastFreshAt: "",
    ageMs: null,
    isStale: true,
    hasLastKnownGood: false,
    errors: [],
    ...recycleRemoteBuildSourceResponseFields(source)
  };
}

async function recycleRemoteRefresh() {
  const keys = RECYCLE_REMOTE_CONFIG_KEYS;
  const startedAt = Date.now();
  const lastAttemptAt = recycleRemoteNowIso();
  let lastHttpStatus = 0;
  let previousMeta = null;
  let previousLkg = null;

  try {
    const stored = await recycleRemoteChromeGet([keys.lkg, keys.meta, keys.status, keys.sourceOverride]);
    const source = recycleRemoteResolveActiveSource(stored);
    const scoped = recycleRemoteScopeStoredToActiveSource(stored, source);
    previousLkg = scoped[keys.lkg] || null;
    previousMeta = scoped[keys.meta] || null;
    const headers = { Accept: "application/json" };
    if (previousMeta?.etag) headers["If-None-Match"] = previousMeta.etag;

    const response = await recycleRemoteFetchWithTimeout(
      source.activeSourceUrl,
      { cache: "no-cache", headers },
      RECYCLE_REMOTE_CONFIG_TIMEOUT_MS
    );
    lastHttpStatus = response.status || 0;

    if (response.status === 304) {
      const status = recycleRemoteBuildStatus("not_modified", startedAt, {
        lastAttemptAt,
        lastSuccessAt: previousMeta?.fetchedAt || scoped[keys.status]?.lastSuccessAt || "",
        lastHttpStatus
      });
      await recycleRemoteChromeSet({ [keys.status]: status });
      return {
        ok: true,
        result: "not_modified",
        meta: previousMeta,
        status,
        contractCompatibility: recycleRemoteEvaluateCatalogContract(previousLkg, previousMeta),
        errors: [],
        ...recycleRemoteBuildSourceResponseFields(source)
      };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const etag = recycleRemoteTrim(response.headers?.get?.("etag"));
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
      return { ok: false, result: "validation_failed", meta: previousMeta, status, errors: status.validationErrors, ...recycleRemoteBuildSourceResponseFields(source) };
    }

    const adapted = recycleRemoteAdaptCatalogForSource(parsed, {
      source,
      rawText: text,
      etag
    });
    const validation = recycleRemoteValidateCatalog(adapted.catalog);
    if (!validation.ok) {
      const status = recycleRemoteBuildStatus("validation_failed", startedAt, {
        lastAttemptAt,
        lastHttpStatus,
        lastError: "Remote config validation failed",
        validationErrors: validation.errors
      });
      await recycleRemoteChromeSet({ [keys.status]: status });
      return { ok: false, result: "validation_failed", meta: previousMeta, status, errors: validation.errors, ...recycleRemoteBuildSourceResponseFields(source) };
    }

    const fetchedAt = recycleRemoteNowIso();
    const meta = {
      schemaVersion: validation.sanitized.schemaVersion,
      revision: validation.sanitized.revision,
      sourceFormat: adapted.sourceFormat || "oss_remote_v1",
      sourceUrl: source.activeSourceUrl,
      sourceId: source.activeSourceId,
      sourceLabel: source.activeSourceLabel,
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
    return {
      ok: true,
      result: "updated",
      meta,
      status,
      contractCompatibility: recycleRemoteEvaluateCatalogContract(validation.sanitized, meta),
      errors: [],
      ...recycleRemoteBuildSourceResponseFields(source)
    };
  } catch (error) {
    const status = recycleRemoteBuildStatus("fetch_failed", startedAt, {
      lastAttemptAt,
      lastHttpStatus,
      lastError: error?.name === "AbortError" ? "Request timed out" : String(error?.message || error),
      validationErrors: []
    });
    await recycleRemoteChromeSet({ [keys.status]: status });
    const stored = await recycleRemoteChromeGet([keys.sourceOverride]);
    const source = recycleRemoteResolveActiveSource(stored);
    return { ok: false, result: "fetch_failed", meta: previousMeta, status, errors: [], ...recycleRemoteBuildSourceResponseFields(source) };
  }
}

const actionApi = chrome.action || chrome.browserAction;

const EXTENSION_RELOAD_TAB_STORAGE_KEY = "wifi_oss_extension_reload_tab_id_v1";

async function storeExtensionReloadTabId(tabId) {
  const id = Number(tabId);
  if (!Number.isFinite(id) || id <= 0) return false;
  try {
    await chrome.storage.local.set({ [EXTENSION_RELOAD_TAB_STORAGE_KEY]: id });
    return true;
  } catch (e) {}
  return false;
}

async function consumeExtensionReloadTabId() {
  try {
    const stored = await chrome.storage.local.get(EXTENSION_RELOAD_TAB_STORAGE_KEY);
    const tabId = Number(stored?.[EXTENSION_RELOAD_TAB_STORAGE_KEY]);
    await chrome.storage.local.remove(EXTENSION_RELOAD_TAB_STORAGE_KEY);
    if (!Number.isFinite(tabId) || tabId <= 0) return null;
    return tabId;
  } catch (e) {
    return null;
  }
}

async function maybeReloadTabAfterExtensionReload() {
  const tabId = await consumeExtensionReloadTabId();
  if (!tabId) return;
  try {
    await chrome.tabs.reload(tabId);
  } catch (e) {
    console.warn("[background] post-extension-reload tab reload failed:", tabId, e);
  }
}

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

      if (msg.type === "dailywork.fetchSchedule") {
        return respondOnce(await dailyworkFetchSchedule({ includeItems: msg.includeItems === true }));
      }

      if (msg.type === "recycleConfig.refreshRemote") {
        return respondOnce(await recycleRemoteRefresh());
      }

      if (msg.type === "recycleConfig.getRemoteStatus") {
        return respondOnce(await recycleRemoteGetStatus());
      }

      if (msg.type === "recycleConfig.setAutoRefreshEnabled") {
        return respondOnce(await recycleRemoteSetAutoRefreshEnabled(msg.enabled === true));
      }

      if (msg.type === "recycleConfig.setRemoteSourceOverride") {
        return respondOnce(await recycleRemoteSetSourceOverride(msg.url));
      }

      if (msg.type === "recycleConfig.clearRemoteSourceOverride") {
        return respondOnce(await recycleRemoteClearSourceOverride());
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

      if (msg.type === "recycleConfig.getResolvedCatalogPlan") {
        return respondOnce(await recycleRemoteGetResolvedCatalogPlan(msg.localDevices, msg.eligibilityContext));
      }

      if (msg.type === "recycleConfig.getResolvedCatalogApplyPlan") {
        return respondOnce(await recycleRemoteGetResolvedCatalogApplyPlan(msg.localDevices, msg.eligibilityContext));
      }

      if (msg.type === "recycleConfig.getEligibleDeviceAdditions") {
        return respondOnce(await recycleRemoteGetEligibleDeviceAdditions(msg.localDevices, msg.eligibilityContext));
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

      if (msg.type === "extension.reload") {
        const browser = String(msg.browser || "").trim() || "chromium";
        const tabId = sender?.tab?.id;
        if (tabId) await storeExtensionReloadTabId(tabId);
        respondOnce({ ok: true, browser, action: "reload", tabId: tabId || null });
        setTimeout(() => {
          try { chrome.runtime.reload(); } catch (e) {
            console.error("[background] chrome.runtime.reload failed:", e);
          }
        }, 75);
        return;
      }

      return respondOnce({ ok: false, error: "Unknown message type" });
    } catch (e) {
      console.error("[background] message handler error:", e);
      return respondOnce({ ok: false, error: String(e?.message || e) });
    }
  })();

  return true;
});

maybeReloadTabAfterExtensionReload();
