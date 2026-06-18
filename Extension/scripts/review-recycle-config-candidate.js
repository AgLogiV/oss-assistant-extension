#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const EXTENSION_ROOT = path.join(REPO_ROOT, "Extension");
const MANIFEST_PATH = path.join(EXTENSION_ROOT, "manifest.json");
const EXPORT_SCRIPT = path.join(__dirname, "export-recycle-config-fixture.js");
const VALIDATOR_SCRIPT = path.join(__dirname, "validate-recycle-config-fixture.js");

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

const ALLOWED_DEVICE_FIELDS = [
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

const SPECIAL_CATEGORIES = new Set(["cam_modules", "modems"]);
const MANUAL_REVIEW_LIMIT = 20;

function parseArgs(argv) {
  const args = argv.slice(2);
  const inputIndex = args.indexOf("--input");

  if (inputIndex !== 0 || args.length !== 2) {
    console.error("ERROR: Usage: node Extension/scripts/review-recycle-config-candidate.js --input path/to/candidate.json");
    process.exit(1);
  }

  const inputPath = String(args[1] || "").trim();
  if (!inputPath) {
    console.error("ERROR: --input requires a JSON file path");
    process.exit(1);
  }

  return { inputPath: path.resolve(process.cwd(), inputPath) };
}

function relativePath(filePath) {
  const relative = path.relative(REPO_ROOT, filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    console.error(`ERROR: Cannot read/parse ${label}: ${error.message}`);
    process.exit(1);
  }
}

function runNodeScript(scriptPath, args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
    maxBuffer: 1024 * 1024 * 8
  });
}

function loadRuntimeExport() {
  const result = runNodeScript(EXPORT_SCRIPT, []);
  if (result.error) {
    console.error(`ERROR: Cannot run runtime export: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error("ERROR: Runtime export failed.");
    if (result.stdout) console.error(result.stdout.trim());
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(result.status || 1);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error(`ERROR: Runtime export did not return JSON: ${error.message}`);
    process.exit(1);
  }
}

function validateCandidate(inputPath) {
  const result = runNodeScript(VALIDATOR_SCRIPT, ["--input", inputPath]);
  return {
    pass: result.status === 0,
    exitCode: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error ? result.error.message : ""
  };
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeMaterialId(value) {
  return String(value || "").trim().replace(/\D+/g, "");
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLegacyMaterialIds(value) {
  return Array.isArray(value) ? value.map(normalizeMaterialId).filter(Boolean) : [];
}

function normalizeDevice(device) {
  return {
    deviceId: normalizeString(device && device.deviceId),
    categoryId: normalizeString(device && device.categoryId),
    displayName: normalizeString(device && device.displayName),
    materialId: normalizeMaterialId(device && device.materialId),
    legacyMaterialIds: normalizeLegacyMaterialIds(device && device.legacyMaterialIds),
    imagePath: normalizeString(device && device.imagePath),
    helpImagePath: normalizeString(device && device.helpImagePath),
    warningText: normalizeString(device && device.warningText),
    validationProfileId: normalizeString(device && device.validationProfileId),
    enabled: device ? device.enabled !== false : true
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function expectedTopLevelKeysFor(candidate) {
  const keys = EXPECTED_TOP_LEVEL_KEYS.slice();
  OPTIONAL_TOP_LEVEL_KEYS.forEach(key => {
    if (candidate && Object.prototype.hasOwnProperty.call(candidate, key)) keys.push(key);
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

function assetExists(assetPath) {
  const raw = normalizeString(assetPath);
  if (!raw) return true;
  if (/^https?:\/\//i.test(raw)) return true;
  if (/^(?:[A-Za-z]:[\\/]|[\\/]|file:\/\/|https?:\/\/)/i.test(raw)) return false;
  if (raw.includes("..")) return false;
  const normalized = raw.replace(/[\\/]+/g, path.sep);
  return fs.existsSync(path.join(EXTENSION_ROOT, normalized));
}

function buildDeviceMap(devices) {
  const map = new Map();
  (Array.isArray(devices) ? devices : []).forEach((device, index) => {
    const id = normalizeString(device && device.deviceId);
    if (!id || map.has(id)) return;
    map.set(id, { device, normalized: normalizeDevice(device), index });
  });
  return map;
}

function buildMaterialFilters(devices) {
  return (Array.isArray(devices) ? devices : []).reduce((filters, device) => {
    if (!device || device.enabled === false) return filters;
    const categoryId = normalizeString(device.categoryId);
    const materialId = normalizeMaterialId(device.materialId);
    if (!categoryId || !materialId) return filters;
    if (!filters[categoryId]) filters[categoryId] = [];
    filters[categoryId].push(materialId);
    return filters;
  }, {});
}

function compareArrayObjects(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function collectTopLevelIssues(candidate) {
  const issues = [];
  if (!isPlainObject(candidate)) {
    return ["candidate root is not an object"];
  }

  const keys = Object.keys(candidate);
  const allowedSet = new Set([...EXPECTED_TOP_LEVEL_KEYS, ...OPTIONAL_TOP_LEVEL_KEYS]);
  const actualSet = new Set(keys);
  const missing = EXPECTED_TOP_LEVEL_KEYS.filter(key => !actualSet.has(key));
  const unexpected = keys.filter(key => !allowedSet.has(key));
  const expectedKeys = expectedTopLevelKeysFor(candidate);

  if (missing.length) issues.push(`missing top-level fields: ${missing.join(", ")}`);
  if (unexpected.length) issues.push(`unexpected top-level fields: ${unexpected.join(", ")}`);
  if (!arraysEqual(keys, expectedKeys)) {
    issues.push(`top-level key order differs from expected: ${expectedKeys.join(", ")}`);
  }

  return issues;
}

function collectRuntimeContractStringArrayIssues(contract, fieldName, errors, warnings) {
  const value = contract[fieldName];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(`runtimeContract.${fieldName} must be an array`);
    return [];
  }

  const normalized = [];
  value.forEach((raw, index) => {
    if (typeof raw !== "string") {
      errors.push(`runtimeContract.${fieldName}[${index}] must be a string`);
      return;
    }
    const item = raw.trim();
    if (!item) {
      errors.push(`runtimeContract.${fieldName}[${index}] is empty`);
      return;
    }
    if (normalized.includes(item)) {
      warnings.push(`runtimeContract.${fieldName} duplicates ${item}`);
      return;
    }
    normalized.push(item);
  });
  return normalized;
}

function collectRuntimeContractIssues(candidate) {
  const errors = [];
  const warnings = [];
  const runtimeContract = candidate && candidate.runtimeContract;

  if (runtimeContract === undefined) return { errors, warnings };
  if (!isPlainObject(runtimeContract)) {
    errors.push("runtimeContract must be an object when present");
    return { errors, warnings };
  }

  const contractVersion = runtimeContract.contractVersion;
  if (contractVersion !== undefined) {
    if (!Number.isInteger(contractVersion) || contractVersion <= 0) {
      errors.push("runtimeContract.contractVersion must be a positive integer when present");
    } else if (!SUPPORTED_RUNTIME_CONTRACT_VERSIONS.has(contractVersion)) {
      errors.push(`runtimeContract.contractVersion ${contractVersion} is not supported`);
    }
  } else {
    warnings.push("runtimeContract.contractVersion is missing; current runtime may report the contract as incompatible");
  }

  const minExtensionVersion = normalizeString(runtimeContract.minExtensionVersion);
  if (runtimeContract.minExtensionVersion !== undefined) {
    if (!isSemverLike(minExtensionVersion)) {
      errors.push(`runtimeContract.minExtensionVersion must be semver-like: ${runtimeContract.minExtensionVersion}`);
    } else {
      const extensionVersion = readExtensionVersion();
      if (extensionVersion && isSemverLike(extensionVersion) && compareSemverLike(extensionVersion, minExtensionVersion) < 0) {
        warnings.push(`runtimeContract requires extension ${minExtensionVersion}, current manifest is ${extensionVersion}`);
      }
    }
  }

  const supportedCapabilities = collectRuntimeContractStringArrayIssues(runtimeContract, "supportedCapabilities", errors, warnings);
  supportedCapabilities.forEach(capability => {
    if (PERMANENTLY_FORBIDDEN_RUNTIME_CAPABILITIES.has(capability)) {
      errors.push(`runtimeContract.supportedCapabilities must not include forbidden runtime control: ${capability}`);
    } else if (!SUPPORTED_RUNTIME_CAPABILITIES.has(capability)) {
      warnings.push(`runtimeContract.supportedCapabilities has unknown future capability: ${capability}`);
    }
  });

  const blockedCapabilities = collectRuntimeContractStringArrayIssues(runtimeContract, "blockedCapabilities", errors, warnings);
  blockedCapabilities.forEach(capability => {
    if (!SUPPORTED_RUNTIME_CAPABILITIES.has(capability) && !PERMANENTLY_FORBIDDEN_RUNTIME_CAPABILITIES.has(capability)) {
      warnings.push(`runtimeContract.blockedCapabilities has unknown capability: ${capability}`);
    }
  });

  if (runtimeContract.fieldPolicy !== undefined) {
    if (!isPlainObject(runtimeContract.fieldPolicy)) {
      errors.push("runtimeContract.fieldPolicy must be an object when present");
    } else {
      Object.entries(runtimeContract.fieldPolicy).forEach(([fieldName, policy]) => {
        if (!RUNTIME_FIELD_POLICY_KEYS.has(fieldName)) {
          warnings.push(`runtimeContract.fieldPolicy has unknown field: ${fieldName}`);
        }
        if (!RUNTIME_FIELD_POLICY_VALUES.has(policy)) {
          errors.push(`runtimeContract.fieldPolicy.${fieldName} must be one of ${Array.from(RUNTIME_FIELD_POLICY_VALUES).join(", ")}`);
        }
        if (policy === "safe" && RUNTIME_FIELD_POLICY_SAFE_FORBIDDEN.has(fieldName)) {
          errors.push(`runtimeContract.fieldPolicy.${fieldName} must not be marked safe`);
        }
      });
    }
  }

  return { errors, warnings };
}

function collectUnknownDeviceFields(candidate) {
  const allowed = new Set(ALLOWED_DEVICE_FIELDS);
  const issues = [];
  const devices = Array.isArray(candidate.devices) ? candidate.devices : [];

  devices.forEach((device, index) => {
    if (!isPlainObject(device)) return;
    const id = normalizeString(device.deviceId) || `devices[${index}]`;
    const unknown = Object.keys(device).filter(key => !allowed.has(key));
    if (unknown.length) issues.push(`${id}: ${unknown.join(", ")}`);
  });

  return issues;
}

function collectAssetAndProfileIssues(candidate, runtime) {
  const issues = [];
  const runtimeProfiles = new Set(Array.isArray(runtime.validationProfiles) ? runtime.validationProfiles : []);
  const candidateProfiles = new Set(Array.isArray(candidate.validationProfiles) ? candidate.validationProfiles : []);
  const devices = Array.isArray(candidate.devices) ? candidate.devices : [];

  devices.forEach((device, index) => {
    const id = normalizeString(device && device.deviceId) || `devices[${index}]`;
    const imagePath = normalizeString(device && device.imagePath);
    const helpImagePath = normalizeString(device && device.helpImagePath);
    const validationProfileId = normalizeString(device && device.validationProfileId);

    if (imagePath && !assetExists(imagePath)) issues.push(`${id}: imagePath not found or unsafe: ${imagePath}`);
    if (helpImagePath && !assetExists(helpImagePath)) issues.push(`${id}: helpImagePath not found or unsafe: ${helpImagePath}`);
    if (validationProfileId && !candidateProfiles.has(validationProfileId)) {
      issues.push(`${id}: validationProfileId not present in candidate validationProfiles: ${validationProfileId}`);
    }
    if (validationProfileId && !runtimeProfiles.has(validationProfileId)) {
      issues.push(`${id}: validationProfileId is not a current predefined local profile: ${validationProfileId}`);
    }
  });

  return issues;
}

function collectDeviceChanges(candidate, runtime) {
  const currentMap = buildDeviceMap(runtime.devices);
  const candidateMap = buildDeviceMap(candidate.devices);
  const added = [];
  const missing = [];
  const edited = [];
  const categoryMoves = [];

  candidateMap.forEach((entry, id) => {
    const current = currentMap.get(id);
    if (!current) {
      added.push({ id, device: entry.normalized, index: entry.index });
      return;
    }

    const changes = [];
    ALLOWED_DEVICE_FIELDS.forEach(field => {
      const before = current.normalized[field];
      const after = entry.normalized[field];
      if (!compareArrayObjects(before, after)) {
        changes.push({ field, before, after });
      }
    });

    if (changes.length) {
      edited.push({ id, changes });
      const categoryChange = changes.find(change => change.field === "categoryId");
      if (categoryChange) {
        categoryMoves.push({
          id,
          before: categoryChange.before,
          after: categoryChange.after,
          special: SPECIAL_CATEGORIES.has(categoryChange.before) || SPECIAL_CATEGORIES.has(categoryChange.after)
        });
      }
    }
  });

  currentMap.forEach((entry, id) => {
    if (!candidateMap.has(id)) missing.push({ id, device: entry.normalized, index: entry.index });
  });

  return { added, missing, edited, categoryMoves };
}

function collectReorderedDevices(candidate, runtime) {
  const currentIds = (Array.isArray(runtime.devices) ? runtime.devices : []).map(device => normalizeString(device.deviceId)).filter(Boolean);
  const candidateIds = (Array.isArray(candidate.devices) ? candidate.devices : []).map(device => normalizeString(device.deviceId)).filter(Boolean);
  const candidateSet = new Set(candidateIds);
  const currentSet = new Set(currentIds);
  const currentCommon = currentIds.filter(id => candidateSet.has(id));
  const candidateCommon = candidateIds.filter(id => currentSet.has(id));

  if (arraysEqual(currentCommon, candidateCommon)) return [];

  const currentIndex = new Map(currentCommon.map((id, index) => [id, index]));
  return candidateCommon
    .map((id, candidateIndex) => ({ id, before: currentIndex.get(id), after: candidateIndex }))
    .filter(item => item.before !== item.after);
}

function collectMaterialFilterIssues(candidate, runtime) {
  const issues = [];
  const rebuilt = buildMaterialFilters(candidate.devices);
  const candidateFilters = isPlainObject(candidate.generatedMaterialFilters) ? candidate.generatedMaterialFilters : {};

  Object.entries(rebuilt).forEach(([categoryId, expected]) => {
    const actual = candidateFilters[categoryId] || [];
    if (!arraysEqual(actual, expected)) {
      issues.push(`${categoryId}: generatedMaterialFilters differs from candidate devices. Expected ${expected.join(", ")}, got ${actual.join(", ") || "(empty)"}`);
    }
  });

  Object.keys(candidateFilters).forEach(categoryId => {
    if (!Object.prototype.hasOwnProperty.call(rebuilt, categoryId) && Array.isArray(candidateFilters[categoryId]) && candidateFilters[categoryId].length) {
      issues.push(`${categoryId}: generatedMaterialFilters has values but candidate devices rebuild is empty`);
    }
  });

  if (!compareArrayObjects(candidateFilters, runtime.generatedMaterialFilters)) {
    issues.push("generatedMaterialFilters differs from current runtime export");
  }

  return { issues, rebuilt };
}

function changedSection(name, candidateValue, runtimeValue) {
  return stableStringify(candidateValue) !== stableStringify(runtimeValue)
    ? `${name} differs from current runtime export`
    : "";
}

function collectRemoteMaterialModelReview(candidate) {
  const value = candidate && candidate.remoteMaterialModels;
  if (value === undefined) return [];
  if (!Array.isArray(value)) return ["remoteMaterialModels must be an array when present"];
  return value.slice(0, MANUAL_REVIEW_LIMIT).map((model, index) => {
    if (!isPlainObject(model)) return `remoteMaterialModels[${index}] is not an object`;
    return `${String(model.materialId || "").trim() || "(missing materialId)"} -> ${String(model.deviceId || "").trim() || "(missing deviceId)"} / ${String(model.categoryId || "").trim() || "(missing categoryId)"} / ${String(model.name || "").trim() || "(missing name)"}`;
  });
}

function formatChangeValue(value) {
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  return JSON.stringify(value);
}

function printList(title, items, formatter) {
  console.log("");
  console.log(`${title}:`);
  if (!items.length) {
    console.log("- none");
    return;
  }
  items.slice(0, MANUAL_REVIEW_LIMIT).forEach(item => console.log(`- ${formatter(item)}`));
  if (items.length > MANUAL_REVIEW_LIMIT) {
    console.log(`- ... ${items.length - MANUAL_REVIEW_LIMIT} more`);
  }
}

function main() {
  const { inputPath } = parseArgs(process.argv);
  const candidate = readJson(inputPath, relativePath(inputPath));
  const runtime = loadRuntimeExport();
  const validation = validateCandidate(inputPath);

  const topLevelIssues = collectTopLevelIssues(candidate);
  const runtimeContractIssues = collectRuntimeContractIssues(candidate);
  const unknownDeviceFields = collectUnknownDeviceFields(candidate);
  const assetAndProfileIssues = collectAssetAndProfileIssues(candidate, runtime);
  const deviceChanges = collectDeviceChanges(candidate, runtime);
  const reorderedDevices = collectReorderedDevices(candidate, runtime);
  const materialFilterReview = collectMaterialFilterIssues(candidate, runtime);
  const remoteMaterialModelReview = collectRemoteMaterialModelReview(candidate);
  const categoryHelpChange = changedSection("categoryHelp", candidate.categoryHelp, runtime.categoryHelp);
  const validationProfilesChange = changedSection("validationProfiles", candidate.validationProfiles, runtime.validationProfiles);

  const manualReviewOnly = [
    categoryHelpChange,
    validationProfilesChange,
    ...remoteMaterialModelReview.map(issue => `remoteMaterialModels review: ${issue}`),
    ...runtimeContractIssues.warnings.map(issue => `runtimeContract review: ${issue}`)
  ].filter(Boolean);

  const blockingIssues = [
    ...topLevelIssues,
    ...runtimeContractIssues.errors.map(issue => `runtimeContract invalid: ${issue}`),
    ...unknownDeviceFields.map(issue => `unknown device fields: ${issue}`),
    ...assetAndProfileIssues,
    ...materialFilterReview.issues.filter(issue => issue.includes("differs from candidate devices") || issue.includes("rebuild is empty")),
    ...deviceChanges.missing.map(item => `missing existing device / possible deletion: ${item.id}`),
    ...deviceChanges.categoryMoves.map(item => item.special
      ? `special category move requires explicit review: ${item.id} ${item.before} -> ${item.after}`
      : `category move requires review: ${item.id} ${item.before} -> ${item.after}`),
    ...manualReviewOnly
  ];

  if (!validation.pass) {
    blockingIssues.unshift("candidate validator failed");
  }

  const mergeable = blockingIssues.length === 0;

  console.log("Recycle config candidate review");
  console.log("");
  console.log(`Mode: dev-only no-write`);
  console.log(`Input: ${relativePath(inputPath)}`);
  console.log(`Runtime source: Extension/content.js`);
  console.log(`Runtime JSON loading: no`);
  console.log(`Validator: ${validation.pass ? "PASS" : `FAIL (${validation.exitCode})`}`);

  printList("Added devices", deviceChanges.added, item => `${item.id} (${item.device.categoryId}, ${item.device.displayName}, material ${item.device.materialId || "(empty)"})`);
  printList("Edited devices", deviceChanges.edited, item => {
    const fields = item.changes.map(change => `${change.field}: ${formatChangeValue(change.before)} -> ${formatChangeValue(change.after)}`).join("; ");
    return `${item.id}: ${fields}`;
  });
  printList("Missing existing devices / possible deletions", deviceChanges.missing, item => `${item.id} (${item.device.categoryId}, ${item.device.displayName})`);
  printList("Reordered existing devices", reorderedDevices, item => `${item.id}: index ${item.before} -> ${item.after}`);
  printList("Category moves", deviceChanges.categoryMoves, item => `${item.special ? "SPECIAL " : ""}${item.id}: ${item.before} -> ${item.after}`);
  printList("Unknown extra device fields", unknownDeviceFields, item => item);
  printList("Top-level field issues", topLevelIssues, item => item);
  printList("Runtime contract issues", [
    ...runtimeContractIssues.errors.map(issue => `ERROR: ${issue}`),
    ...runtimeContractIssues.warnings.map(issue => `REVIEW: ${issue}`)
  ], item => item);
  printList("Asset/profile issues", assetAndProfileIssues, item => item);
  printList("Generated material filter review", materialFilterReview.issues, item => item);
  printList("Remote material model review", remoteMaterialModelReview, item => item);
  printList("Manual-review-only sections", manualReviewOnly, item => item);

  console.log("");
  console.log("Validator output:");
  if (validation.stdout) console.log(validation.stdout);
  if (validation.stderr) console.log(validation.stderr);
  if (!validation.stdout && !validation.stderr) console.log("- none");

  console.log("");
  console.log(`Mergeable by manual Codex-assisted patch: ${mergeable ? "YES" : "NO"}`);
  if (!mergeable) {
    printList("Blocking/manual-review issues", blockingIssues, item => item);
  }
  console.log("");
  console.log(mergeable ? "Result: PASS" : "Result: REVIEW_REQUIRED");

  process.exit(mergeable ? 0 : 1);
}

main();
