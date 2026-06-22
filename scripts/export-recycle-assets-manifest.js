#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const EXTENSION_ROOT = path.join(REPO_ROOT, "Extension");
const ASSET_EXTENSIONS = new Set([".webp", ".png", ".jpg", ".jpeg"]);
const ASSET_POLICIES = [
  {
    key: "deviceImages",
    kind: "deviceImage",
    extensionPrefix: "images/devices/16x9/",
    directory: path.join(EXTENSION_ROOT, "images", "devices", "16x9")
  },
  {
    key: "helpImages",
    kind: "helpImage",
    extensionPrefix: "images/recycle-help/",
    directory: path.join(EXTENSION_ROOT, "images", "recycle-help")
  }
];

function failFast(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length) {
    failFast("Usage: node Extension/scripts/export-recycle-assets-manifest.js");
  }
}

function toExtensionRelativePath(prefix, fileName) {
  return `${prefix}${fileName}`.replace(/\\/g, "/");
}

function readAssets(policy) {
  let entries;
  try {
    entries = fs.readdirSync(policy.directory, { withFileTypes: true });
  } catch (error) {
    failFast(`Cannot read ${path.relative(REPO_ROOT, policy.directory)}: ${error.message}`);
  }

  return entries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(fileName => ASSET_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
    .map(fileName => ({
      path: toExtensionRelativePath(policy.extensionPrefix, fileName),
      fileName,
      kind: policy.kind
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function buildManifest() {
  return ASSET_POLICIES.reduce((manifest, policy) => {
    manifest[policy.key] = readAssets(policy);
    return manifest;
  }, {
    schemaVersion: 1,
    revision: "dev-current",
    generatedAt: new Date().toISOString()
  });
}

parseArgs(process.argv);
process.stdout.write(`${JSON.stringify(buildManifest(), null, 2)}\n`);
