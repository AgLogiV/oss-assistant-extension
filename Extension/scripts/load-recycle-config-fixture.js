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
  if (!arraysEqual(keys, EXPECTED_TOP_LEVEL_KEYS)) {
    addIssue(errors, "fixture.topLevelKeys", `expected ${EXPECTED_TOP_LEVEL_KEYS.join(", ")}, got ${keys.join(", ")}`);
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
  const fixture = readFixture();
  validateTopLevel(fixture, errors);

  if (errors.length) {
    printSummary(null, fixture, errors);
    process.exit(1);
  }

  const adapter = buildAdapterShape(fixture);
  validateAdapterShape(adapter, fixture, errors);
  printSummary(adapter, fixture, errors);
  process.exit(errors.length ? 1 : 0);
}

function printSummary(adapter, fixture, errors) {
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

  printIssueList("Errors", errors);

  console.log("");
  if (errors.length) {
    console.log(`Result: FAIL (${errors.length} errors)`);
  } else {
    console.log("Result: PASS");
  }
}

main();
