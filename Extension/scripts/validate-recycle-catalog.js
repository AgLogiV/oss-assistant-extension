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

const SPECIAL_MATERIAL_OPTIONAL_CATEGORIES = new Set([
  "austrian",
  "cam_modules",
  "modems"
]);

const KNOWN_CATEGORY_FALLBACK_PROFILES = new Set([
  "category_android_iptv_current",
  "category_xplore_zapper_mac12",
  "category_dth_kaon_nagra_11_digits",
  "category_austrian_min16_alnum",
  "category_routers_current",
  "category_gpon_current",
  "category_cam_modules_non_empty",
  "category_modems_current"
]);

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

const EXPECTED_GPON_ORDER = ["1200014928", "118560", "118563", "118564", "122933", "122944"];

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
  const keys = new Set();
  const keyPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
  let keyMatch;
  while ((keyMatch = keyPattern.exec(match[1])) !== null) {
    keys.add(keyMatch[1]);
  }
  if (!keys.size) failFast("No validation profile keys found");
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

function addIssue(list, code, message) {
  list.push({ code, message });
}

function main() {
  const errors = [];
  const warnings = [];
  const source = readContentJs();

  const catalogLiteral = extractAssignedLiteral(source, "RECYCLE_DEVICE_CATALOG_RAW", "[", "]");
  const helpLiteral = extractAssignedLiteral(source, "RECYCLE_SERIAL_HELP_BY_CATEGORY", "{", "}");
  const catalog = parsePlainLiteral(catalogLiteral, "RECYCLE_DEVICE_CATALOG_RAW");
  const categoryHelp = parsePlainLiteral(helpLiteral, "RECYCLE_SERIAL_HELP_BY_CATEGORY");
  const implementedProfileIds = extractValidationProfileKeys(source);

  if (!Array.isArray(catalog)) failFast("RECYCLE_DEVICE_CATALOG_RAW did not parse to an array");
  if (Object.prototype.toString.call(categoryHelp) !== "[object Object]") {
    failFast("RECYCLE_SERIAL_HELP_BY_CATEGORY did not parse to an object");
  }

  const deviceIds = new Map();
  const materialIds = new Map();

  catalog.forEach((device, index) => {
    const label = `device[${index}]`;
    if (Object.prototype.toString.call(device) !== "[object Object]") {
      addIssue(errors, "device.notObject", `${label} is not an object`);
      return;
    }

    const deviceId = String(device.deviceId || "").trim();
    const categoryId = String(device.categoryId || "").trim();
    const displayName = String(device.displayName || "").trim();
    const materialId = normalizeMaterialId(device.materialId);
    const active = isEnabled(device);

    if (!deviceId) addIssue(errors, "device.missingDeviceId", `${label} is missing deviceId`);
    if (!categoryId) addIssue(errors, "device.missingCategoryId", `${deviceId || label} is missing categoryId`);
    if (!displayName) addIssue(errors, "device.missingDisplayName", `${deviceId || label} is missing displayName`);

    if (deviceId) {
      if (deviceIds.has(deviceId)) {
        addIssue(errors, "device.duplicateDeviceId", `${deviceId} duplicates ${deviceIds.get(deviceId)}`);
      } else {
        deviceIds.set(deviceId, label);
      }
    }

    if (categoryId && !ALLOWED_CATEGORY_IDS.has(categoryId)) {
      addIssue(errors, "device.invalidCategoryId", `${deviceId || label} has invalid categoryId ${categoryId}`);
    }

    if (Object.prototype.hasOwnProperty.call(device, "enabled") && typeof device.enabled !== "boolean") {
      addIssue(errors, "device.invalidEnabled", `${deviceId || label} has non-boolean enabled`);
    }

    if (active && categoryId && !SPECIAL_MATERIAL_OPTIONAL_CATEGORIES.has(categoryId) && !materialId) {
      addIssue(errors, "device.missingMaterialId", `${deviceId || label} has empty/non-normalizable materialId`);
    }

    if (materialId) {
      if (!materialIds.has(materialId)) materialIds.set(materialId, []);
      materialIds.get(materialId).push(deviceId || label);
    }

    if (device.imagePath && !assetExists(device.imagePath)) {
      addIssue(errors, "device.missingImagePath", `${deviceId || label} imagePath not found: ${device.imagePath}`);
    }

    if (device.helpImagePath && !assetExists(device.helpImagePath)) {
      addIssue(errors, "device.missingHelpImagePath", `${deviceId || label} helpImagePath not found: ${device.helpImagePath}`);
    }

    const profileId = String(device.validationProfileId || "").trim();
    if (profileId && !implementedProfileIds.has(profileId) && !KNOWN_CATEGORY_FALLBACK_PROFILES.has(profileId)) {
      addIssue(errors, "device.unknownValidationProfile", `${deviceId || label} references unknown validationProfileId ${profileId}`);
    }
  });

  Array.from(materialIds.entries())
    .filter(([, ids]) => ids.length > 1)
    .forEach(([materialId, ids]) => {
      addIssue(warnings, "material.duplicate", `materialId ${materialId} is used by: ${ids.join(", ")}`);
    });

  Object.keys(categoryHelp).forEach(categoryId => {
    if (!ALLOWED_CATEGORY_IDS.has(categoryId)) {
      addIssue(errors, "help.invalidCategoryId", `category help uses invalid categoryId ${categoryId}`);
    }
    const items = categoryHelp[categoryId];
    if (!Array.isArray(items)) {
      addIssue(errors, "help.notArray", `category help ${categoryId} is not an array`);
      return;
    }
    items.forEach((item, index) => {
      const imagePath = String(item && item.imagePath || "").trim();
      if (!imagePath) {
        addIssue(errors, "help.missingImagePath", `category help ${categoryId}[${index}] is missing imagePath`);
      } else if (!assetExists(imagePath)) {
        addIssue(errors, "help.missingAsset", `category help ${categoryId}[${index}] imagePath not found: ${imagePath}`);
      }
    });
  });

  const filters = buildMaterialFilters(catalog);
  Object.keys(EXPECTED_MATERIAL_FILTERS).forEach(categoryId => {
    const actual = filters[categoryId] || [];
    const expected = EXPECTED_MATERIAL_FILTERS[categoryId];
    if (!arraysEqual(actual, expected)) {
      addIssue(errors, "filters.parity", `${categoryId} material filter order changed. Expected ${expected.join(", ")}, got ${actual.join(", ") || "(empty)"}`);
    }
  });

  if (!arraysEqual(filters.gpon || [], EXPECTED_GPON_ORDER)) {
    addIssue(errors, "filters.gponOrder", `GPON material order changed. Expected ${EXPECTED_GPON_ORDER.join(", ")}, got ${(filters.gpon || []).join(", ") || "(empty)"}`);
  }

  printSummary({
    catalog,
    categoryHelp,
    implementedProfileIds,
    filters,
    errors,
    warnings
  });

  process.exit(errors.length ? 1 : 0);
}

function printIssueList(title, issues) {
  if (!issues.length) return;
  console.log("");
  console.log(`${title}:`);
  issues.forEach(issue => {
    console.log(`- [${issue.code}] ${issue.message}`);
  });
}

function printSummary(result) {
  const categoriesWithDevices = new Set(result.catalog.map(device => String(device.categoryId || "").trim()).filter(Boolean));
  console.log("Recycle catalog sanity check");
  console.log("");
  console.log(`Devices: ${result.catalog.length}`);
  console.log(`Categories with devices: ${categoriesWithDevices.size}`);
  console.log(`Category help groups: ${Object.keys(result.categoryHelp).length}`);
  console.log(`Implemented validation profiles: ${result.implementedProfileIds.size}`);
  console.log(`Generated material filter categories: ${Object.keys(result.filters).length}`);

  printIssueList("Errors", result.errors);
  printIssueList("Warnings", result.warnings);

  console.log("");
  if (result.errors.length) {
    console.log(`Result: FAIL (${result.errors.length} errors, ${result.warnings.length} warnings)`);
  } else if (result.warnings.length) {
    console.log(`Result: PASS with ${result.warnings.length} warnings`);
  } else {
    console.log("Result: PASS");
  }
}

main();
