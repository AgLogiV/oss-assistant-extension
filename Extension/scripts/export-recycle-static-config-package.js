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
const ALLOWED_IMAGE_EXTENSIONS = new Set([".webp", ".png", ".jpg", ".jpeg"]);
const ASSET_COPY_POLICIES = [
  {
    manifestKey: "deviceImages",
    label: "device images",
    prefix: "images/devices/16x9/",
    sourceDir: path.join(EXTENSION_ROOT, "images", "devices", "16x9"),
    outputDir: path.join("images", "devices", "16x9")
  },
  {
    manifestKey: "helpImages",
    label: "help images",
    prefix: "images/recycle-help/",
    sourceDir: path.join(EXTENSION_ROOT, "images", "recycle-help"),
    outputDir: path.join("images", "recycle-help")
  }
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
    force: false,
    includeImages: false
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
    } else if (arg === "--include-images") {
      options.includeImages = true;
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
    assertSafeManifestAssetPath(assetPath, label);
  });
}

function assertSafeManifestAssetPath(assetPath, label) {
  if (/^(file|https?):\/\//i.test(assetPath)) {
    failFast(`${label} must not be a URL: ${assetPath}`);
  }
  if (assetPath.includes("\\") || assetPath.includes("..")) {
    failFast(`${label} has unsafe path: ${assetPath}`);
  }
  if (assetPath.startsWith("/") || /^[A-Za-z]:/.test(assetPath)) {
    failFast(`${label} is not extension-relative: ${assetPath}`);
  }

  const matchingPrefix = ALLOWED_ASSET_PREFIXES.find(prefix => assetPath.startsWith(prefix));
  if (!matchingPrefix) {
    failFast(`${label} has unexpected path prefix: ${assetPath}`);
  }

  const fileName = assetPath.slice(matchingPrefix.length);
  if (!fileName || fileName.includes("/")) {
    failFast(`${label} must be a file directly under ${matchingPrefix}: ${assetPath}`);
  }
  if (!ALLOWED_IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase())) {
    failFast(`${label} has unsupported image extension: ${assetPath}`);
  }

  return { matchingPrefix, fileName };
}

function assertRegularSourceImage(sourcePath, label) {
  let stat;
  try {
    stat = fs.lstatSync(sourcePath);
  } catch (error) {
    failFast(`${label} source image is missing: ${relativePath(sourcePath)}`);
  }
  if (stat.isSymbolicLink()) {
    failFast(`${label} source image must not be a symlink: ${relativePath(sourcePath)}`);
  }
  if (!stat.isFile()) {
    failFast(`${label} source image is not a file: ${relativePath(sourcePath)}`);
  }
}

function buildImageCopyPlan(manifest, outDir) {
  const copies = [];
  const seenDestinations = new Set();

  ASSET_COPY_POLICIES.forEach(policy => {
    const assets = manifest[policy.manifestKey];
    const sourceRoot = path.resolve(policy.sourceDir);
    const outputRoot = path.resolve(outDir, policy.outputDir);

    assets.forEach((asset, index) => {
      const assetPath = String(asset && asset.path || "");
      const label = `${policy.manifestKey}[${index}]`;
      const { matchingPrefix, fileName } = assertSafeManifestAssetPath(assetPath, label);
      if (matchingPrefix !== policy.prefix) {
        failFast(`${label} is listed in ${policy.manifestKey} but uses ${matchingPrefix}`);
      }

      const sourcePath = path.resolve(sourceRoot, fileName);
      if (!isSameOrInside(sourceRoot, sourcePath)) {
        failFast(`${label} source escaped fixed asset folder: ${assetPath}`);
      }
      assertRegularSourceImage(sourcePath, label);

      const destinationPath = path.resolve(outputRoot, fileName);
      if (!isSameOrInside(outputRoot, destinationPath)) {
        failFast(`${label} destination escaped output asset folder: ${assetPath}`);
      }

      const destinationKey = destinationPath.toLowerCase();
      if (seenDestinations.has(destinationKey)) {
        failFast(`${label} duplicates an output image path: ${assetPath}`);
      }
      seenDestinations.add(destinationKey);

      copies.push({
        manifestKey: policy.manifestKey,
        label: policy.label,
        assetPath,
        sourcePath,
        destinationPath
      });
    });
  });

  return copies;
}

function copyImages(copyPlan) {
  copyPlan.forEach(copy => {
    fs.mkdirSync(path.dirname(copy.destinationPath), { recursive: true });
    fs.copyFileSync(copy.sourcePath, copy.destinationPath);
  });
}

function verifyCopiedImages(copyPlan) {
  copyPlan.forEach(copy => {
    if (!fs.existsSync(copy.destinationPath) || !fs.statSync(copy.destinationPath).isFile()) {
      failFast(`Copied image is missing after export: ${copy.assetPath}`);
    }
  });
}

function imageCopyCounts(copyPlan) {
  return ASSET_COPY_POLICIES.map(policy => ({
    label: policy.label,
    count: copyPlan.filter(copy => copy.manifestKey === policy.manifestKey).length
  }));
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

function printSummary(options, written, copyPlan) {
  console.log("Recycle static config package export");
  console.log("");
  console.log("Mode: dev-only");
  console.log(`Output: ${options.outDir}`);
  console.log(`Dry run: ${options.dryRun ? "yes" : "no"}`);
  console.log(`Force: ${options.force ? "yes" : "no"}`);
  console.log(`Include images: ${options.includeImages ? "yes" : "no"}`);
  console.log("");
  console.log(options.dryRun ? "Planned files:" : "Written files:");
  written.forEach(filePath => {
    console.log(`- ${path.relative(options.outDir, filePath).replace(/\\/g, "/")}`);
  });
  if (options.includeImages) {
    console.log("");
    console.log(options.dryRun ? "Planned image copies:" : "Copied images:");
    imageCopyCounts(copyPlan).forEach(({ label, count }) => {
      console.log(`- ${label}: ${count}`);
    });
  }
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
  const imageCopyPlan = options.includeImages ? buildImageCopyPlan(assetsManifest, options.outDir) : [];

  if (options.dryRun) {
    validateCatalogText(catalogText);
    printSummary(options, outputFiles, imageCopyPlan);
    return;
  }

  writePackageFile(outputFiles[0], catalogText);
  writePackageFile(outputFiles[1], assetsText);
  if (options.includeImages) {
    copyImages(imageCopyPlan);
    verifyCopiedImages(imageCopyPlan);
  }
  validateCatalogFile(outputFiles[0]);
  printSummary(options, outputFiles, imageCopyPlan);
}

main();
