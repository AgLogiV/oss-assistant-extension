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
  "runtimeContract"
];

const SUPPORTED_RUNTIME_CONTRACT_VERSIONS = new Set([1]);
const SUPPORTED_RUNTIME_CAPABILITIES = new Set([
  "visualOverlay",
  "remoteAdditionsDebug",
  "remoteMaterialPreview",
  "remoteMaterialDebug",
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
  "generatedMaterialFilters"
]);
const RUNTIME_FIELD_POLICY_SAFE_FORBIDDEN = new Set([
  "legacyMaterialIds",
  "categoryHelp",
  "validationProfiles",
  "generatedMaterialFilters"
]);

const EXPECTED_AUSTRIAN_FILTER = ["1200017460", "1200017462"];
const EXPECTED_GPON_ORDER = ["1200014928", "118560", "118563", "118564", "122933", "122944"];

function normalizeMaterialId(id) {
  return String(id || "").trim().replace(/\D+/g, "");
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function isEnabled(device) {
  return device.enabled !== false;
}

function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
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

function readFixture() {
  try {
    return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    console.error(`ERROR: Cannot read/parse ${path.relative(REPO_ROOT, FIXTURE_PATH)}: ${error.message}`);
    process.exit(1);
  }
}

function normalizeDevice(device) {
  const categoryId = String(device.categoryId || "").trim();
  return {
    deviceId: String(device.deviceId || "").trim(),
    categoryId,
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
    if (!device.categoryId || !device.materialId) return filters;
    if (!filters[device.categoryId]) filters[device.categoryId] = [];
    filters[device.categoryId].push(device.materialId);
    return filters;
  }, {});
}

function buildAdapterShape(fixture) {
  const normalizedDevices = fixture.devices.map(normalizeDevice);
  const devicesById = {};
  const devicesByCategory = {};

  normalizedDevices.forEach(device => {
    devicesById[device.deviceId] = device;
    if (!devicesByCategory[device.categoryId]) devicesByCategory[device.categoryId] = [];
    devicesByCategory[device.categoryId].push(device);
  });

  return {
    schemaVersion: fixture.schemaVersion,
    revision: fixture.revision,
    devicesById,
    devicesByCategory,
    categoryHelp: fixture.categoryHelp,
    validationProfiles: new Set(fixture.validationProfiles),
    materialFilters: buildMaterialFilters(normalizedDevices)
  };
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
    addIssue(errors, "fixture.topLevelKeys", `expected ${expectedKeys.join(", ")}, got ${keys.join(", ")}`);
  }

  if (fixture.schemaVersion !== 1) {
    addIssue(errors, "fixture.schemaVersion", `expected schemaVersion 1, got ${JSON.stringify(fixture.schemaVersion)}`);
  }

  if (!Array.isArray(fixture.devices)) {
    addIssue(errors, "fixture.devices", "devices is not an array");
  }

  if (!isPlainObject(fixture.categoryHelp)) {
    addIssue(errors, "fixture.categoryHelp", "categoryHelp is not an object");
  }

  if (!Array.isArray(fixture.validationProfiles)) {
    addIssue(errors, "fixture.validationProfiles", "validationProfiles is not an array");
  }

  if (!isPlainObject(fixture.generatedMaterialFilters)) {
    addIssue(errors, "fixture.generatedMaterialFilters", "generatedMaterialFilters is not an object");
  }
}

function validateAdapterShape(adapter, fixture, errors) {
  const deviceIds = Object.keys(adapter.devicesById);
  if (deviceIds.length !== fixture.devices.length) {
    addIssue(errors, "adapter.deviceCount", `devicesById count ${deviceIds.length} does not match fixture devices count ${fixture.devices.length}`);
  }

  fixture.devices.forEach((device, index) => {
    const deviceId = String(device.deviceId || "").trim();
    if (!deviceId) {
      addIssue(errors, "adapter.missingDeviceId", `fixture devices[${index}] has empty deviceId`);
      return;
    }
    if (!adapter.devicesById[deviceId]) {
      addIssue(errors, "adapter.missingDevice", `${deviceId} missing from devicesById`);
    }
  });

  Object.entries(adapter.materialFilters).forEach(([categoryId, rebuilt]) => {
    const fixtureFilter = fixture.generatedMaterialFilters[categoryId] || [];
    if (!arraysEqual(rebuilt, fixtureFilter)) {
      addIssue(errors, "adapter.materialFilterMismatch", `${categoryId} rebuilt material filter differs. Expected ${fixtureFilter.join(", ")}, got ${rebuilt.join(", ")}`);
    }
  });

  if (!arraysEqual(adapter.materialFilters.austrian || [], EXPECTED_AUSTRIAN_FILTER)) {
    addIssue(errors, "adapter.austrianFilter", `Austrian material filter changed. Expected ${EXPECTED_AUSTRIAN_FILTER.join(", ")}, got ${(adapter.materialFilters.austrian || []).join(", ") || "(empty)"}`);
  }

  if (!arraysEqual(adapter.materialFilters.gpon || [], EXPECTED_GPON_ORDER)) {
    addIssue(errors, "adapter.gponOrder", `GPON material order changed. Expected ${EXPECTED_GPON_ORDER.join(", ")}, got ${(adapter.materialFilters.gpon || []).join(", ") || "(empty)"}`);
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
  const errors = [];
  const warnings = [];
  const fixture = readFixture();
  validateTopLevel(fixture, errors);
  validateRuntimeContract(fixture && fixture.runtimeContract, errors, warnings);

  if (errors.length) {
    printSummary(null, fixture, errors, warnings);
    process.exit(1);
  }

  const adapter = buildAdapterShape(fixture);
  validateAdapterShape(adapter, fixture, errors);
  printSummary(adapter, fixture, errors, warnings);
  process.exit(errors.length ? 1 : 0);
}

function printSummary(adapter, fixture, errors, warnings) {
  console.log("Recycle config fixture loader adapter");
  console.log("");
  console.log("Mode: dev-only prototype");
  console.log(`Fixture: ${path.relative(REPO_ROOT, FIXTURE_PATH)}`);
  console.log(`Schema version: ${fixture && fixture.schemaVersion}`);
  console.log(`Revision: ${fixture && fixture.revision}`);
  console.log(`Fixture devices: ${Array.isArray(fixture && fixture.devices) ? fixture.devices.length : 0}`);
  console.log(`Adapter devicesById: ${adapter ? Object.keys(adapter.devicesById).length : 0}`);
  console.log(`Adapter devicesByCategory: ${adapter ? Object.keys(adapter.devicesByCategory).length : 0}`);
  console.log(`Adapter categoryHelp groups: ${adapter && isPlainObject(adapter.categoryHelp) ? Object.keys(adapter.categoryHelp).length : 0}`);
  console.log(`Adapter validationProfiles: ${adapter ? adapter.validationProfiles.size : 0}`);
  console.log(`Adapter materialFilters: ${adapter ? Object.keys(adapter.materialFilters).length : 0}`);
  console.log(`Runtime contract: ${isPlainObject(fixture && fixture.runtimeContract) ? "present" : "absent"}`);

  printIssueList("Warnings", warnings);
  printIssueList("Errors", errors);

  console.log("");
  if (errors.length) {
    console.log(`Result: FAIL (${errors.length} errors)`);
  } else {
    console.log("Result: PASS");
  }
}

main();
