#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const EXTENSION_ROOT = path.join(REPO_ROOT, "Extension");
const CONTENT_JS_PATH = path.join(EXTENSION_ROOT, "content.js");

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

const EXPECTED_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "revision",
  "devices",
  "categoryHelp",
  "validationProfiles",
  "generatedMaterialFilters"
];

const EXPECTED_GPON_ORDER = ["1200014928", "118560", "118563", "118564", "122933", "122944"];
const EXPECTED_AUSTRIAN_FILTER = ["1200017460", "1200017462"];

function normalizeMaterialId(id) {
  return String(id || "").trim().replace(/\D+/g, "");
}

function failFast(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readContentJs() {
  try {
    return fs.readFileSync(CONTENT_JS_PATH, "utf8");
  } catch (error) {
    failFast(`Cannot read ${CONTENT_JS_PATH}: ${error.message}`);
  }
}

function findAssignmentStart(source, constName) {
  const pattern = new RegExp(`const\\s+${constName}\\s*=`, "m");
  const match = pattern.exec(source);
  if (!match) failFast(`Cannot find const ${constName} in Extension/content.js`);
  return match.index + match[0].length;
}

function findBalancedEnd(source, startIndex, openChar, closeChar) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = startIndex; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = "";
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === openChar) {
      depth += 1;
      continue;
    }
    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return i + 1;
      if (depth < 0) break;
    }
  }

  failFast(`Cannot find balanced ${openChar}${closeChar} block starting at index ${startIndex}`);
}

function extractAssignedLiteral(source, constName, openChar, closeChar) {
  const assignmentStart = findAssignmentStart(source, constName);
  const start = source.indexOf(openChar, assignmentStart);
  if (start < 0) failFast(`Cannot find ${openChar} for const ${constName}`);
  const between = source.slice(assignmentStart, start).trim();
  if (between) failFast(`Unexpected tokens before ${constName} literal: ${between}`);
  const end = findBalancedEnd(source, start, openChar, closeChar);
  return source.slice(start, end);
}

function parsePlainLiteral(literal, label) {
  let parsed;
  try {
    parsed = vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1000 });
  } catch (error) {
    failFast(`Cannot parse ${label}: ${error.message}`);
  }
  assertPlainData(parsed, label);
  return parsed;
}

function assertPlainData(value, label) {
  if (value === null) return;
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") return;
  if (Array.isArray(value)) {
    value.forEach((item, idx) => assertPlainData(item, `${label}[${idx}]`));
    return;
  }
  if (Object.prototype.toString.call(value) === "[object Object]") {
    Object.keys(value).forEach(key => assertPlainData(value[key], `${label}.${key}`));
    return;
  }
  failFast(`${label} contains unsupported non-data value of type ${type}`);
}

function extractValidationProfileKeys(source) {
  const pattern = /const\s+RECYCLE_SERIAL_VALIDATION_PROFILES\s*=\s*\{([\s\S]*?)^\s*\};/m;
  const match = pattern.exec(source);
  if (!match) failFast("Cannot find RECYCLE_SERIAL_VALIDATION_PROFILES block");
  const keys = [];
  const seen = new Set();
  const keyPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
  let keyMatch;
  while ((keyMatch = keyPattern.exec(match[1])) !== null) {
    if (!seen.has(keyMatch[1])) {
      seen.add(keyMatch[1]);
      keys.push(keyMatch[1]);
    }
  }
  if (!keys.length) failFast("No validation profile keys found");
  return keys;
}

function assetExists(assetPath) {
  const raw = String(assetPath || "").trim();
  if (!raw) return true;
  if (/^https?:\/\//i.test(raw)) return true;
  const normalized = raw.replace(/[\\/]+/g, path.sep);
  return fs.existsSync(path.join(EXTENSION_ROOT, normalized));
}

function isEnabled(device) {
  return device.enabled !== false;
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

function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function normalizeDeviceForConfig(device, categoryValidationProfiles) {
  const categoryId = String(device.categoryId || "").trim();
  return {
    deviceId: String(device.deviceId || "").trim(),
    categoryId,
    displayName: String(device.displayName || "").trim(),
    materialId: normalizeMaterialId(device.materialId),
    legacyMaterialIds: Array.isArray(device.legacyMaterialIds)
      ? device.legacyMaterialIds.map(id => String(id || "").trim()).filter(Boolean)
      : [],
    imagePath: String(device.imagePath || "").trim(),
    helpImagePath: String(device.helpImagePath || "").trim(),
    warningText: String(device.warningText || "").trim(),
    validationProfileId: String(device.validationProfileId || categoryValidationProfiles[categoryId] || "").trim(),
    enabled: device.enabled !== false
  };
}

function validateFixture(fixture, catalogCount) {
  const errors = [];
  const { devices, categoryHelp, validationProfiles, generatedMaterialFilters } = fixture;
  const deviceIds = new Set();
  const profileSet = new Set(validationProfiles);
  const topLevelKeys = Object.keys(fixture);

  if (!arraysEqual(topLevelKeys, EXPECTED_TOP_LEVEL_KEYS)) {
    errors.push(`fixture top-level keys changed. Expected ${EXPECTED_TOP_LEVEL_KEYS.join(", ")}, got ${topLevelKeys.join(", ")}`);
  }

  if (!Array.isArray(devices)) errors.push("fixture.devices is not an array");
  else if (devices.length !== catalogCount) {
    errors.push(`fixture device count ${devices.length} does not match catalog count ${catalogCount}`);
  }

  if (Object.prototype.toString.call(categoryHelp) !== "[object Object]") {
    errors.push("fixture.categoryHelp is not an object");
  }

  if (!Array.isArray(validationProfiles)) errors.push("fixture.validationProfiles is not an array");

  if (Object.prototype.toString.call(generatedMaterialFilters) !== "[object Object]") {
    errors.push("fixture.generatedMaterialFilters is not an object");
  }

  if (errors.length) {
    console.error("ERROR: recycle config fixture validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }

  devices.forEach((device, index) => {
    const label = device.deviceId || `device[${index}]`;
    if (!device.deviceId) errors.push(`${label} is missing deviceId`);
    if (device.deviceId && deviceIds.has(device.deviceId)) errors.push(`${label} duplicates deviceId`);
    if (device.deviceId) deviceIds.add(device.deviceId);
    if (!ALLOWED_CATEGORY_IDS.has(device.categoryId)) errors.push(`${label} has invalid categoryId ${device.categoryId}`);
    if (!device.displayName) errors.push(`${label} is missing displayName`);
    if (device.imagePath && !assetExists(device.imagePath)) errors.push(`${label} imagePath not found: ${device.imagePath}`);
    if (device.helpImagePath && !assetExists(device.helpImagePath)) errors.push(`${label} helpImagePath not found: ${device.helpImagePath}`);
    if (device.validationProfileId && !profileSet.has(device.validationProfileId)) {
      errors.push(`${label} references unknown validationProfileId ${device.validationProfileId}`);
    }
  });

  Object.entries(categoryHelp).forEach(([categoryId, items]) => {
    if (!ALLOWED_CATEGORY_IDS.has(categoryId)) errors.push(`categoryHelp has invalid categoryId ${categoryId}`);
    if (!Array.isArray(items)) {
      errors.push(`categoryHelp.${categoryId} is not an array`);
      return;
    }
    items.forEach((item, index) => {
      const imagePath = String(item && item.imagePath || "").trim();
      if (!imagePath) errors.push(`categoryHelp.${categoryId}[${index}] missing imagePath`);
      else if (!assetExists(imagePath)) errors.push(`categoryHelp.${categoryId}[${index}] imagePath not found: ${imagePath}`);
    });
  });

  Object.entries(EXPECTED_MATERIAL_FILTERS).forEach(([categoryId, expected]) => {
    const actual = generatedMaterialFilters[categoryId] || [];
    if (!arraysEqual(actual, expected)) {
      errors.push(`${categoryId} material filter order changed. Expected ${expected.join(", ")}, got ${actual.join(", ") || "(empty)"}`);
    }
  });

  if (!arraysEqual(generatedMaterialFilters.austrian || [], EXPECTED_AUSTRIAN_FILTER)) {
    errors.push(`austrian material filter changed. Expected ${EXPECTED_AUSTRIAN_FILTER.join(", ")}, got ${(generatedMaterialFilters.austrian || []).join(", ") || "(empty)"}`);
  }

  if (!arraysEqual(generatedMaterialFilters.gpon || [], EXPECTED_GPON_ORDER)) {
    errors.push(`GPON material order changed. Expected ${EXPECTED_GPON_ORDER.join(", ")}, got ${(generatedMaterialFilters.gpon || []).join(", ") || "(empty)"}`);
  }

  if (errors.length) {
    console.error("ERROR: recycle config fixture validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
}

function main() {
  const source = readContentJs();
  const catalog = parsePlainLiteral(
    extractAssignedLiteral(source, "RECYCLE_DEVICE_CATALOG_RAW", "[", "]"),
    "RECYCLE_DEVICE_CATALOG_RAW"
  );
  const categoryHelp = parsePlainLiteral(
    extractAssignedLiteral(source, "RECYCLE_SERIAL_HELP_BY_CATEGORY", "{", "}"),
    "RECYCLE_SERIAL_HELP_BY_CATEGORY"
  );
  const categoryValidationProfiles = parsePlainLiteral(
    extractAssignedLiteral(source, "RECYCLE_DEVICE_CATEGORY_VALIDATION_PROFILES", "{", "}"),
    "RECYCLE_DEVICE_CATEGORY_VALIDATION_PROFILES"
  );
  const implementedProfiles = extractValidationProfileKeys(source);

  if (!Array.isArray(catalog)) failFast("RECYCLE_DEVICE_CATALOG_RAW did not parse to an array");

  const validationProfiles = Array.from(new Set([
    ...implementedProfiles,
    ...Object.values(categoryValidationProfiles).map(id => String(id || "").trim()).filter(Boolean)
  ])).sort();

  const devices = catalog.map(device => normalizeDeviceForConfig(device, categoryValidationProfiles));
  const generatedMaterialFilters = buildMaterialFilters(devices);

  const fixture = {
    schemaVersion: 1,
    revision: "dev-current",
    devices,
    categoryHelp,
    validationProfiles,
    generatedMaterialFilters
  };

  validateFixture(fixture, catalog.length);
  process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
}

main();
