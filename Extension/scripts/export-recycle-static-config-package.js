#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const EXTENSION_ROOT = path.join(REPO_ROOT, "Extension");
const EXPORT_CONFIG_SCRIPT = path.join(__dirname, "export-recycle-config-fixture.js");
const EXPORT_ASSETS_SCRIPT = path.join(__dirname, "export-recycle-assets-manifest.js");
const VALIDATOR_SCRIPT = path.join(__dirname, "validate-recycle-config-fixture.js");
const EXPECTED_OUTPUTS = [
  path.join("config", "recycle-device-catalog.json"),
  path.join("config", "assets-manifest.json")
];
const ALLOWED_ASSET_PREFIXES = [
  "images/devices/16x9/",
  "images/recycle-help/"
];
const PROTECTED_EXACT_OUTPUT_PATHS = [
  REPO_ROOT
];
const PROTECTED_OUTPUT_PATHS = [
  EXTENSION_ROOT,
  path.join(EXTENSION_ROOT, "config"),
  path.join(EXTENSION_ROOT, "images"),
  path.join(EXTENSION_ROOT, "scripts"),
  path.join(EXTENSION_ROOT, "tools", "recycle-configurator"),
  path.join(EXTENSION_ROOT, "tools", "recycle-configurator", "public")
];

function failFast(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    outDir: "",
    dryRun: false,
    force: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) failFast("--out requires an output directory");
      options.outDir = value;
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--force") {
      options.force = true;
    } else {
      failFast(`Unknown argument: ${arg}`);
    }
  }

  if (!options.outDir) {
    failFast("Usage: node Extension/scripts/export-recycle-static-config-package.js --out path/to/output-dir [--dry-run] [--force]");
  }

  options.outDir = path.resolve(process.cwd(), options.outDir);
  return options;
}

function relativePath(filePath) {
  const relative = path.relative(REPO_ROOT, filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}

function isSameOrInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertSafeOutputDirectory(outDir) {
  PROTECTED_EXACT_OUTPUT_PATHS.forEach(protectedPath => {
    if (path.relative(protectedPath, outDir) === "") {
      failFast(`Refusing protected output directory: ${relativePath(protectedPath)}`);
    }
  });

  PROTECTED_OUTPUT_PATHS.forEach(protectedPath => {
    if (isSameOrInside(protectedPath, outDir)) {
      failFast(`Refusing output directory inside protected path: ${relativePath(protectedPath)}`);
    }
  });

  if (fs.existsSync(outDir) && !fs.statSync(outDir).isDirectory()) {
    failFast(`Output path exists and is not a directory: ${outDir}`);
  }
}

function assertWritableOutputDirectory(outDir, options) {
  if (!fs.existsSync(outDir)) return;

  const entries = fs.readdirSync(outDir);
  if (entries.length && !options.force) {
    failFast(`Output directory is not empty. Re-run with --force to replace package files: ${outDir}`);
  }
}

function runNodeScript(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
    maxBuffer: 1024 * 1024 * 16
  });

  if (result.error) {
    failFast(`Cannot run ${relativePath(scriptPath)}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (result.stdout) console.error(result.stdout.trim());
    if (result.stderr) console.error(result.stderr.trim());
    failFast(`${relativePath(scriptPath)} failed with exit code ${result.status}`);
  }

  return String(result.stdout || "");
}

function parseJson(jsonText, label) {
  try {
    return JSON.parse(String(jsonText || "").replace(/^\uFEFF/, ""));
  } catch (error) {
    failFast(`Cannot parse ${label}: ${error.message}`);
  }
}

function assertSafeAssetManifest(manifest) {
  ["deviceImages", "helpImages"].forEach(key => {
    if (!Array.isArray(manifest[key])) {
      failFast(`assets-manifest ${key} must be an array`);
    }
  });

  [...manifest.deviceImages, ...manifest.helpImages].forEach((asset, index) => {
    const assetPath = String(asset && asset.path || "");
    const label = `assets-manifest asset ${index}`;
    if (!ALLOWED_ASSET_PREFIXES.some(prefix => assetPath.startsWith(prefix))) {
      failFast(`${label} has unexpected path prefix: ${assetPath}`);
    }
    if (assetPath.includes("\\") || assetPath.includes("..")) {
      failFast(`${label} has unsafe path: ${assetPath}`);
    }
    if (assetPath.startsWith("/") || /^[A-Za-z]:/.test(assetPath)) {
      failFast(`${label} is not extension-relative: ${assetPath}`);
    }
    if (/^(file|https?):\/\//i.test(assetPath)) {
      failFast(`${label} must not be a URL: ${assetPath}`);
    }
  });
}

function validateCatalogFile(catalogPath) {
  runNodeScript(VALIDATOR_SCRIPT, ["--input", catalogPath]);
}

function validateCatalogText(catalogText) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oss-recycle-static-package-"));
  const tempFile = path.join(tempDir, "recycle-device-catalog.json");
  try {
    fs.writeFileSync(tempFile, catalogText, "utf8");
    validateCatalogFile(tempFile);
  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch (error) {
      // Best-effort temp cleanup.
    }
    try {
      fs.rmdirSync(tempDir);
    } catch (error) {
      // Best-effort temp cleanup.
    }
  }
}

function writePackageFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempFile, content, "utf8");
  fs.renameSync(tempFile, filePath);
}

function printSummary(options, written) {
  console.log("Recycle static config package export");
  console.log("");
  console.log("Mode: dev-only");
  console.log(`Output: ${options.outDir}`);
  console.log(`Dry run: ${options.dryRun ? "yes" : "no"}`);
  console.log(`Force: ${options.force ? "yes" : "no"}`);
  console.log("");
  console.log(options.dryRun ? "Planned files:" : "Written files:");
  written.forEach(filePath => {
    console.log(`- ${path.relative(options.outDir, filePath).replace(/\\/g, "/")}`);
  });
  console.log("");
  console.log("Validation: PASS");
}

function main() {
  const options = parseArgs(process.argv);
  assertSafeOutputDirectory(options.outDir);
  assertWritableOutputDirectory(options.outDir, options);

  const catalogText = runNodeScript(EXPORT_CONFIG_SCRIPT, []);
  parseJson(catalogText, "recycle-device-catalog.json");
  const assetsText = runNodeScript(EXPORT_ASSETS_SCRIPT, []);
  const assetsManifest = parseJson(assetsText, "assets-manifest.json");
  assertSafeAssetManifest(assetsManifest);

  const outputFiles = EXPECTED_OUTPUTS.map(relative => path.join(options.outDir, relative));

  if (options.dryRun) {
    validateCatalogText(catalogText);
    printSummary(options, outputFiles);
    return;
  }

  writePackageFile(outputFiles[0], catalogText);
  writePackageFile(outputFiles[1], assetsText);
  validateCatalogFile(outputFiles[0]);
  printSummary(options, outputFiles);
}

main();
