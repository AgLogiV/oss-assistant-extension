#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const EXTENSION_ROOT = path.join(REPO_ROOT, "Extension");
const FIXTURE_PATH = path.join(EXTENSION_ROOT, "config", "recycle-device-catalog.fixture.json");

const EXPECTED_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "revision",
  "devices",
  "categoryHelp",
  "validationProfiles",
  "generatedMaterialFilters"
];

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
    "123580",
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
  if (!arraysEqual(keys, EXPECTED_TOP_LEVEL_KEYS)) {
    addIssue(errors, "fixture.topLevelKeys", `expected top-level keys ${EXPECTED_TOP_LEVEL_KEYS.join(", ")}, got ${keys.join(", ")}`);
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
  const fixture = readConfig(configPath);
  const sourceLabel = inputPath ? "Input" : "Fixture";
  const title = inputPath ? "Recycle config input validation" : "Recycle config fixture validation";
  const options = { strictFixtureExpectations };

  validateTopLevel(fixture, errors);
  const profileSet = validateValidationProfiles(fixture.validationProfiles, errors);
  const normalizedDevices = validateDevices(fixture.devices, profileSet, errors, options);
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

  printIssueList("Errors", errors);

  console.log("");
  if (errors.length) {
    console.log(`Result: FAIL (${errors.length} errors)`);
    process.exit(1);
  }
  console.log("Result: PASS");
}

main();
