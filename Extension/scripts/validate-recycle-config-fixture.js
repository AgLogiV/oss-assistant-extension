#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const EXTENSION_ROOT = path.join(REPO_ROOT, "Extension");
const MANIFEST_PATH = path.join(EXTENSION_ROOT, "manifest.json");
const FIXTURE_PATH = path.join(EXTENSION_ROOT, "config", "recycle-device-catalog.fixture.json");

const EXPECTED_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "revision",
  "devices",
  "categoryHelp",
  "validationProfiles",
  "generatedMaterialFilters"
];

const OPTIONAL_TOP_LEVEL_KEYS = [
  "runtimeContract",
  "remoteMaterialModels"
];

const SUPPORTED_RUNTIME_CONTRACT_VERSIONS = new Set([1]);
const SUPPORTED_RUNTIME_CAPABILITIES = new Set([
  "visualOverlay",
  "remoteAdditionsDebug",
  "remoteAdditionsAuto",
  "remoteMaterialPreview",
  "remoteMaterialAuto",
  "remoteMaterialModelsAuto",
  "remoteMaterialDebug",
  "resolvedPlanPreview",
  "resolvedApplyPlan"
]);
const PERMANENTLY_FORBIDDEN_RUNTIME_CAPABILITIES = new Set([
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
]);
const RUNTIME_FIELD_POLICY_VALUES = new Set(["safe", "debug-only", "risky", "blocked"]);
const RUNTIME_FIELD_POLICY_KEYS = new Set([
  "schemaVersion",
  "revision",
  "deviceId",
  "categoryId",
  "displayName",
  "imagePath",
  "helpImagePath",
  "warningText",
  "materialId",
  "legacyMaterialIds",
  "validationProfileId",
  "enabled",
  "categoryHelp",
  "validationProfiles",
  "generatedMaterialFilters",
  "remoteMaterialModels"
]);
const RUNTIME_FIELD_POLICY_SAFE_FORBIDDEN = new Set([
  "legacyMaterialIds",
  "categoryHelp",
  "validationProfiles",
  "generatedMaterialFilters"
]);

const ALLOWED_CATEGORY_IDS = new Set([
  "android_iptv",
  "xplore_zapper",
  "dth_kaon_nagra",
  "austrian",
  "netbox",
  "routers",
  "gpon",
  "cam_modules",
  "modems"
]);

const EXPECTED_DEVICE_COUNT = 34;

const EXPECTED_MATERIAL_FILTERS = {
  android_iptv: ["114225", "121679", "121678"],
  xplore_zapper: ["118542", "118543", "118544"],
  dth_kaon_nagra: ["114915", "121961"],
  austrian: ["1200017460", "1200017462"],
  netbox: [
    "124173",
    "123451",
    "121561",
    "119442",
    "118857",
    "118831",
    "116081",
    "115763",
    "111732",
    "1000057334",
    "1000059633",
    "1000055165"
  ],
  routers: ["1200014914", "118551", "118552", "121150", "121376", "123357"],
  gpon: ["1200014928", "118560", "118563", "118564", "122933", "122944"]
};

const EXPECTED_AUSTRIAN_FILTER = ["1200017460", "1200017462"];
const EXPECTED_GPON_ORDER = ["1200014928", "118560", "118563", "118564", "122933", "122944"];

function normalizeMaterialId(id) {
  return String(id || "").trim().replace(/\D+/g, "");
}

function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function isEnabled(device) {
  return device.enabled !== false;
}

function addIssue(list, code, message) {
  list.push({ code, message });
}

function expectedTopLevelKeysFor(fixture) {
  const keys = EXPECTED_TOP_LEVEL_KEYS.slice();
  OPTIONAL_TOP_LEVEL_KEYS.forEach(key => {
    if (fixture && Object.prototype.hasOwnProperty.call(fixture, key)) keys.push(key);
  });
  return keys;
}

function semverCore(value) {
  return String(value || "").trim().split(/[+-]/)[0];
}

function isSemverLike(value) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(value || "").trim());
}

function compareSemverLike(left, right) {
  const leftParts = semverCore(left).split(".").map(part => Number(part || 0));
  const rightParts = semverCore(right).split(".").map(part => Number(part || 0));
  for (let index = 0; index < 3; index += 1) {
    const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }
  return 0;
}

function readExtensionVersion() {
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    return String(manifest.version || "").trim();
  } catch (error) {
    return "";
  }
}

function validateRuntimeContractStringArray(contract, fieldName, errors, warnings) {
  const value = contract[fieldName];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    addIssue(errors, `runtimeContract.${fieldName}.notArray`, `runtimeContract.${fieldName} must be an array`);
    return [];
  }

  const normalized = [];
  value.forEach((raw, index) => {
    if (typeof raw !== "string") {
      addIssue(errors, `runtimeContract.${fieldName}.notString`, `runtimeContract.${fieldName}[${index}] must be a string`);
      return;
    }
    const item = raw.trim();
    if (!item) {
      addIssue(errors, `runtimeContract.${fieldName}.empty`, `runtimeContract.${fieldName}[${index}] is empty`);
      return;
    }
    if (normalized.includes(item)) {
      addIssue(warnings, `runtimeContract.${fieldName}.duplicate`, `runtimeContract.${fieldName} duplicates ${item}`);
      return;
    }
    normalized.push(item);
  });
  return normalized;
}

function validateRuntimeContract(runtimeContract, errors, warnings) {
  if (runtimeContract === undefined) return;
  if (!isPlainObject(runtimeContract)) {
    addIssue(errors, "runtimeContract.notObject", "runtimeContract must be an object when present");
    return;
  }

  const contractVersion = runtimeContract.contractVersion;
  if (contractVersion !== undefined) {
    if (!Number.isInteger(contractVersion) || contractVersion <= 0) {
      addIssue(errors, "runtimeContract.contractVersion.invalid", "runtimeContract.contractVersion must be a positive integer when present");
    } else if (!SUPPORTED_RUNTIME_CONTRACT_VERSIONS.has(contractVersion)) {
      addIssue(errors, "runtimeContract.contractVersion.unsupported", `runtimeContract.contractVersion ${contractVersion} is not supported`);
    }
  } else {
    addIssue(warnings, "runtimeContract.contractVersion.missing", "runtimeContract.contractVersion is missing; current runtime may report the contract as incompatible");
  }

  const minExtensionVersion = String(runtimeContract.minExtensionVersion || "").trim();
  if (runtimeContract.minExtensionVersion !== undefined) {
    if (!isSemverLike(minExtensionVersion)) {
      addIssue(errors, "runtimeContract.minExtensionVersion.invalid", `runtimeContract.minExtensionVersion must be semver-like: ${runtimeContract.minExtensionVersion}`);
    } else {
      const extensionVersion = readExtensionVersion();
      if (extensionVersion && isSemverLike(extensionVersion) && compareSemverLike(extensionVersion, minExtensionVersion) < 0) {
        addIssue(warnings, "runtimeContract.minExtensionVersion.future", `runtimeContract requires extension ${minExtensionVersion}, current manifest is ${extensionVersion}`);
      }
    }
  }

  const supportedCapabilities = validateRuntimeContractStringArray(runtimeContract, "supportedCapabilities", errors, warnings);
  supportedCapabilities.forEach(capability => {
    if (PERMANENTLY_FORBIDDEN_RUNTIME_CAPABILITIES.has(capability)) {
      addIssue(errors, "runtimeContract.supportedCapabilities.forbidden", `runtimeContract.supportedCapabilities must not include forbidden runtime control: ${capability}`);
    } else if (!SUPPORTED_RUNTIME_CAPABILITIES.has(capability)) {
      addIssue(warnings, "runtimeContract.supportedCapabilities.unknown", `runtimeContract.supportedCapabilities has unknown future capability: ${capability}`);
    }
  });

  const blockedCapabilities = validateRuntimeContractStringArray(runtimeContract, "blockedCapabilities", errors, warnings);
  blockedCapabilities.forEach(capability => {
    if (!SUPPORTED_RUNTIME_CAPABILITIES.has(capability) && !PERMANENTLY_FORBIDDEN_RUNTIME_CAPABILITIES.has(capability)) {
      addIssue(warnings, "runtimeContract.blockedCapabilities.unknown", `runtimeContract.blockedCapabilities has unknown capability: ${capability}`);
    }
  });

  if (runtimeContract.fieldPolicy !== undefined) {
    if (!isPlainObject(runtimeContract.fieldPolicy)) {
      addIssue(errors, "runtimeContract.fieldPolicy.notObject", "runtimeContract.fieldPolicy must be an object when present");
    } else {
      Object.entries(runtimeContract.fieldPolicy).forEach(([fieldName, policy]) => {
        if (!RUNTIME_FIELD_POLICY_KEYS.has(fieldName)) {
          addIssue(warnings, "runtimeContract.fieldPolicy.unknownField", `runtimeContract.fieldPolicy has unknown field: ${fieldName}`);
        }
        if (!RUNTIME_FIELD_POLICY_VALUES.has(policy)) {
          addIssue(errors, "runtimeContract.fieldPolicy.invalidPolicy", `runtimeContract.fieldPolicy.${fieldName} must be one of ${Array.from(RUNTIME_FIELD_POLICY_VALUES).join(", ")}`);
        }
        if (policy === "safe" && RUNTIME_FIELD_POLICY_SAFE_FORBIDDEN.has(fieldName)) {
          addIssue(errors, "runtimeContract.fieldPolicy.safeForbidden", `runtimeContract.fieldPolicy.${fieldName} must not be marked safe`);
        }
      });
    }
  }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const inputIndex = args.indexOf("--input");

  if (inputIndex < 0) {
    if (args.length) {
      console.error(`ERROR: Unknown argument: ${args[0]}`);
      process.exit(1);
    }
    return { inputPath: "" };
  }

  if (inputIndex !== 0 || args.length !== 2) {
    console.error("ERROR: Usage: node Extension/scripts/validate-recycle-config-fixture.js [--input path/to/candidate.json]");
    process.exit(1);
  }

  const inputPath = String(args[inputIndex + 1] || "").trim();
  if (!inputPath) {
    console.error("ERROR: --input requires a JSON file path");
    process.exit(1);
  }

  return { inputPath: path.resolve(process.cwd(), inputPath) };
}

function readConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    console.error(`ERROR: Cannot read/parse ${path.relative(REPO_ROOT, configPath)}: ${error.message}`);
    process.exit(1);
  }
}

function assetExists(assetPath) {
  const raw = String(assetPath || "").trim();
  if (!raw) return true;
  if (/^https?:\/\//i.test(raw)) return true;
  const normalized = raw.replace(/[\\/]+/g, path.sep);
  return fs.existsSync(path.join(EXTENSION_ROOT, normalized));
}

function normalizeDevice(device) {
  return {
    deviceId: String(device.deviceId || "").trim(),
    categoryId: String(device.categoryId || "").trim(),
    displayName: String(device.displayName || "").trim(),
    materialId: normalizeMaterialId(device.materialId),
    legacyMaterialIds: Array.isArray(device.legacyMaterialIds)
      ? device.legacyMaterialIds.map(id => normalizeMaterialId(id)).filter(Boolean)
      : [],
    imagePath: String(device.imagePath || "").trim(),
    helpImagePath: String(device.helpImagePath || "").trim(),
    warningText: String(device.warningText || "").trim(),
    validationProfileId: String(device.validationProfileId || "").trim(),
    enabled: device.enabled !== false
  };
}

function buildMaterialFilters(devices) {
  return devices.reduce((filters, device) => {
    if (!isEnabled(device)) return filters;
    const categoryId = String(device.categoryId || "").trim();
    const materialId = normalizeMaterialId(device.materialId);
    if (!categoryId || !materialId) return filters;
    if (!filters[categoryId]) filters[categoryId] = [];
    filters[categoryId].push(materialId);
    return filters;
  }, {});
}

function validateTopLevel(fixture, errors) {
  if (!isPlainObject(fixture)) {
    addIssue(errors, "fixture.notObject", "fixture root is not an object");
    return;
  }

  const keys = Object.keys(fixture);
  const expectedKeys = expectedTopLevelKeysFor(fixture);
  const allowedKeys = new Set([...EXPECTED_TOP_LEVEL_KEYS, ...OPTIONAL_TOP_LEVEL_KEYS]);
  const missingKeys = EXPECTED_TOP_LEVEL_KEYS.filter(key => !Object.prototype.hasOwnProperty.call(fixture, key));
  const unexpectedKeys = keys.filter(key => !allowedKeys.has(key));

  if (missingKeys.length) {
    addIssue(errors, "fixture.topLevelKeys.missing", `missing top-level keys ${missingKeys.join(", ")}`);
  }
  if (unexpectedKeys.length) {
    addIssue(errors, "fixture.topLevelKeys.unexpected", `unexpected top-level keys ${unexpectedKeys.join(", ")}`);
  }
  if (!arraysEqual(keys, expectedKeys)) {
    addIssue(errors, "fixture.topLevelKeys", `expected top-level keys ${expectedKeys.join(", ")}, got ${keys.join(", ")}`);
  }

  if (fixture.schemaVersion !== 1) {
    addIssue(errors, "fixture.schemaVersion", `expected schemaVersion 1, got ${JSON.stringify(fixture.schemaVersion)}`);
  }

  if (!String(fixture.revision || "").trim()) {
    addIssue(errors, "fixture.revision", "revision is empty");
  }
}

function validateDevices(devices, profileSet, errors, options) {
  if (!Array.isArray(devices)) {
    addIssue(errors, "devices.notArray", "devices is not an array");
    return [];
  }

  if (options.strictFixtureExpectations && devices.length !== EXPECTED_DEVICE_COUNT) {
    addIssue(errors, "devices.count", `expected ${EXPECTED_DEVICE_COUNT} devices, got ${devices.length}`);
  }

  const seenDeviceIds = new Set();
  const normalizedDevices = [];

  devices.forEach((device, index) => {
    const label = `devices[${index}]`;
    if (!isPlainObject(device)) {
      addIssue(errors, "device.notObject", `${label} is not an object`);
      return;
    }

    const normalized = normalizeDevice(device);
    normalizedDevices.push(normalized);
    const idLabel = normalized.deviceId || label;

    if (!normalized.deviceId) addIssue(errors, "device.missingDeviceId", `${label} is missing deviceId`);
    if (normalized.deviceId && seenDeviceIds.has(normalized.deviceId)) {
      addIssue(errors, "device.duplicateDeviceId", `${normalized.deviceId} is duplicated`);
    }
    if (normalized.deviceId) seenDeviceIds.add(normalized.deviceId);

    if (!ALLOWED_CATEGORY_IDS.has(normalized.categoryId)) {
      addIssue(errors, "device.invalidCategoryId", `${idLabel} has invalid categoryId ${normalized.categoryId}`);
    }

    if (!normalized.displayName) {
      addIssue(errors, "device.missingDisplayName", `${idLabel} is missing displayName`);
    }

    if (typeof device.enabled !== "boolean") {
      addIssue(errors, "device.invalidEnabled", `${idLabel} has non-boolean enabled`);
    }

    if (device.materialId && normalized.materialId !== String(device.materialId).trim()) {
      addIssue(errors, "device.materialNotNormalized", `${idLabel} materialId should normalize to ${normalized.materialId}`);
    }

    if (normalized.imagePath && !assetExists(normalized.imagePath)) {
      addIssue(errors, "device.missingImagePath", `${idLabel} imagePath not found: ${normalized.imagePath}`);
    }

    if (normalized.helpImagePath && !assetExists(normalized.helpImagePath)) {
      addIssue(errors, "device.missingHelpImagePath", `${idLabel} helpImagePath not found: ${normalized.helpImagePath}`);
    }

    if (normalized.validationProfileId && !profileSet.has(normalized.validationProfileId)) {
      addIssue(errors, "device.unknownValidationProfile", `${idLabel} references unknown validationProfileId ${normalized.validationProfileId}`);
    }
  });

  return normalizedDevices;
}

function validateRemoteMaterialModels(remoteMaterialModels, normalizedDevices, errors) {
  if (remoteMaterialModels === undefined) return [];
  if (!Array.isArray(remoteMaterialModels)) {
    addIssue(errors, "remoteMaterialModels.notArray", "remoteMaterialModels must be an array when present");
    return [];
  }

  const deviceMap = new Map();
  normalizedDevices.forEach(device => {
    if (device.deviceId && !deviceMap.has(device.deviceId)) deviceMap.set(device.deviceId, device);
  });
  const seenMaterialIds = new Set();
  const seenDeviceIds = new Set();
  const normalizedModels = [];

  remoteMaterialModels.forEach((model, index) => {
    const label = `remoteMaterialModels[${index}]`;
    if (!isPlainObject(model)) {
      addIssue(errors, "remoteMaterialModel.notObject", `${label} is not an object`);
      return;
    }

    const materialId = normalizeMaterialId(model.materialId);
    const rawMaterialId = String(model.materialId || "").trim();
    const deviceId = String(model.deviceId || "").trim();
    const categoryId = String(model.categoryId || "").trim();
    const name = String(model.name || "").trim();
    const idLabel = materialId || deviceId || label;

    Object.keys(model).forEach(field => {
      if (!["materialId", "deviceId", "categoryId", "name"].includes(field)) {
        addIssue(errors, "remoteMaterialModel.unknownField", `${label} has unknown field ${field}`);
      }
    });

    if (!rawMaterialId || rawMaterialId !== materialId || !/^\d+$/.test(rawMaterialId)) {
      addIssue(errors, "remoteMaterialModel.invalidMaterialId", `${idLabel} materialId must be digits-only`);
    } else if (seenMaterialIds.has(materialId)) {
      addIssue(errors, "remoteMaterialModel.duplicateMaterialId", `${materialId} is duplicated`);
    }
    if (materialId) seenMaterialIds.add(materialId);

    if (!deviceId) {
      addIssue(errors, "remoteMaterialModel.missingDeviceId", `${idLabel} is missing deviceId`);
    } else if (seenDeviceIds.has(deviceId)) {
      addIssue(errors, "remoteMaterialModel.duplicateDeviceId", `${deviceId} has multiple remote material models`);
    }
    if (deviceId) seenDeviceIds.add(deviceId);

    if (!ALLOWED_CATEGORY_IDS.has(categoryId)) {
      addIssue(errors, "remoteMaterialModel.invalidCategoryId", `${idLabel} has invalid categoryId ${categoryId}`);
    }
    if (categoryId === "cam_modules" || categoryId === "modems") {
      addIssue(errors, "remoteMaterialModel.specialCategory", `${idLabel} must not use special category ${categoryId}`);
    }
    if (!name) {
      addIssue(errors, "remoteMaterialModel.missingName", `${idLabel} is missing name`);
    } else if (name.length > 120) {
      addIssue(errors, "remoteMaterialModel.nameTooLong", `${idLabel} name is too long`);
    }

    const device = deviceMap.get(deviceId);
    if (!device) {
      addIssue(errors, "remoteMaterialModel.unknownDevice", `${idLabel} references unknown deviceId ${deviceId}`);
    } else {
      if (device.categoryId !== categoryId) {
        addIssue(errors, "remoteMaterialModel.categoryMismatch", `${idLabel} categoryId does not match bound device`);
      }
      if (device.materialId !== materialId) {
        addIssue(errors, "remoteMaterialModel.materialMismatch", `${idLabel} materialId does not match bound device`);
      }
      if (device.enabled === false) {
        addIssue(errors, "remoteMaterialModel.disabledDevice", `${idLabel} is bound to a disabled device`);
      }
      if (Array.isArray(device.legacyMaterialIds) && device.legacyMaterialIds.length) {
        addIssue(errors, "remoteMaterialModel.legacyMaterialIds", `${idLabel} must not rely on legacyMaterialIds`);
      }
    }

    normalizedModels.push({ materialId, deviceId, categoryId, name });
  });

  return normalizedModels;
}

function validateCategoryHelp(categoryHelp, errors) {
  if (!isPlainObject(categoryHelp)) {
    addIssue(errors, "categoryHelp.notObject", "categoryHelp is not an object");
    return;
  }

  Object.entries(categoryHelp).forEach(([categoryId, items]) => {
    if (!ALLOWED_CATEGORY_IDS.has(categoryId)) {
      addIssue(errors, "categoryHelp.invalidCategoryId", `categoryHelp has invalid categoryId ${categoryId}`);
    }
    if (!Array.isArray(items)) {
      addIssue(errors, "categoryHelp.notArray", `categoryHelp.${categoryId} is not an array`);
      return;
    }
    items.forEach((item, index) => {
      if (!isPlainObject(item)) {
        addIssue(errors, "categoryHelp.itemNotObject", `categoryHelp.${categoryId}[${index}] is not an object`);
        return;
      }
      const imagePath = String(item.imagePath || "").trim();
      if (!imagePath) {
        addIssue(errors, "categoryHelp.missingImagePath", `categoryHelp.${categoryId}[${index}] missing imagePath`);
      } else if (!assetExists(imagePath)) {
        addIssue(errors, "categoryHelp.missingAsset", `categoryHelp.${categoryId}[${index}] imagePath not found: ${imagePath}`);
      }
    });
  });
}

function validateValidationProfiles(validationProfiles, errors) {
  if (!Array.isArray(validationProfiles)) {
    addIssue(errors, "validationProfiles.notArray", "validationProfiles is not an array");
    return new Set();
  }

  const profileSet = new Set();
  validationProfiles.forEach((profileId, index) => {
    const normalized = String(profileId || "").trim();
    if (!normalized) {
      addIssue(errors, "validationProfiles.empty", `validationProfiles[${index}] is empty`);
      return;
    }
    if (profileSet.has(normalized)) {
      addIssue(errors, "validationProfiles.duplicate", `${normalized} is duplicated`);
    }
    profileSet.add(normalized);
  });
  return profileSet;
}

function validateMaterialFilters(generatedMaterialFilters, normalizedDevices, errors, options) {
  if (!isPlainObject(generatedMaterialFilters)) {
    addIssue(errors, "generatedMaterialFilters.notObject", "generatedMaterialFilters is not an object");
    return;
  }

  const rebuiltFilters = buildMaterialFilters(normalizedDevices);

  Object.entries(rebuiltFilters).forEach(([categoryId, expected]) => {
    const actual = generatedMaterialFilters[categoryId] || [];
    if (!arraysEqual(actual, expected)) {
      addIssue(errors, "generatedMaterialFilters.rebuildMismatch", `${categoryId} differs from normalized devices. Expected ${expected.join(", ")}, got ${actual.join(", ") || "(empty)"}`);
    }
  });

  if (options.strictFixtureExpectations) {
    Object.entries(EXPECTED_MATERIAL_FILTERS).forEach(([categoryId, expected]) => {
      const actual = generatedMaterialFilters[categoryId] || [];
      if (!arraysEqual(actual, expected)) {
        addIssue(errors, "generatedMaterialFilters.expectedOrder", `${categoryId} material filter changed. Expected ${expected.join(", ")}, got ${actual.join(", ") || "(empty)"}`);
      }
    });
  }

  if (!arraysEqual(generatedMaterialFilters.austrian || [], EXPECTED_AUSTRIAN_FILTER)) {
    addIssue(errors, "generatedMaterialFilters.austrian", `Austrian material filter changed. Expected ${EXPECTED_AUSTRIAN_FILTER.join(", ")}, got ${(generatedMaterialFilters.austrian || []).join(", ") || "(empty)"}`);
  }

  if (!arraysEqual(generatedMaterialFilters.gpon || [], EXPECTED_GPON_ORDER)) {
    addIssue(errors, "generatedMaterialFilters.gpon", `GPON material order changed. Expected ${EXPECTED_GPON_ORDER.join(", ")}, got ${(generatedMaterialFilters.gpon || []).join(", ") || "(empty)"}`);
  }
}

function printIssueList(title, issues) {
  if (!issues.length) return;
  console.log("");
  console.log(`${title}:`);
  issues.forEach(issue => {
    console.log(`- [${issue.code}] ${issue.message}`);
  });
}

function main() {
  const { inputPath } = parseArgs(process.argv);
  const configPath = inputPath || FIXTURE_PATH;
  const strictFixtureExpectations = !inputPath;
  const errors = [];
  const warnings = [];
  const fixture = readConfig(configPath);
  const sourceLabel = inputPath ? "Input" : "Fixture";
  const title = inputPath ? "Recycle config input validation" : "Recycle config fixture validation";
  const options = { strictFixtureExpectations };

  validateTopLevel(fixture, errors);
  validateRuntimeContract(fixture && fixture.runtimeContract, errors, warnings);
  const profileSet = validateValidationProfiles(fixture.validationProfiles, errors);
  const normalizedDevices = validateDevices(fixture.devices, profileSet, errors, options);
  const remoteMaterialModels = validateRemoteMaterialModels(fixture.remoteMaterialModels, normalizedDevices, errors);
  validateCategoryHelp(fixture.categoryHelp, errors);
  validateMaterialFilters(fixture.generatedMaterialFilters, normalizedDevices, errors, options);

  const categoriesWithDevices = new Set(normalizedDevices.map(device => device.categoryId).filter(Boolean));

  console.log(title);
  console.log("");
  console.log(`${sourceLabel}: ${path.relative(REPO_ROOT, configPath)}`);
  console.log(`Schema version: ${fixture && fixture.schemaVersion}`);
  console.log(`Revision: ${fixture && fixture.revision}`);
  console.log(`Devices: ${Array.isArray(fixture.devices) ? fixture.devices.length : 0}`);
  console.log(`Normalized devices: ${normalizedDevices.length}`);
  console.log(`Categories with devices: ${categoriesWithDevices.size}`);
  console.log(`Category help groups: ${isPlainObject(fixture.categoryHelp) ? Object.keys(fixture.categoryHelp).length : 0}`);
  console.log(`Validation profiles: ${Array.isArray(fixture.validationProfiles) ? fixture.validationProfiles.length : 0}`);
  console.log(`Generated material filter categories: ${isPlainObject(fixture.generatedMaterialFilters) ? Object.keys(fixture.generatedMaterialFilters).length : 0}`);
  console.log(`Runtime contract: ${isPlainObject(fixture && fixture.runtimeContract) ? "present" : "absent"}`);
  console.log(`Remote material models: ${remoteMaterialModels.length}`);

  printIssueList("Warnings", warnings);
  printIssueList("Errors", errors);

  console.log("");
  if (errors.length) {
    console.log(`Result: FAIL (${errors.length} errors)`);
    process.exit(1);
  }
  console.log("Result: PASS");
}

main();
