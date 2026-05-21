#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const HOST = "127.0.0.1";
const DEFAULT_PORT = 5177;
const PORT = Number(process.env.PORT || DEFAULT_PORT);
const PUBLIC_DIR = path.join(__dirname, "public");
const EXTENSION_ROOT = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..");
const FIXTURE_PATH = path.join(EXTENSION_ROOT, "config", "recycle-device-catalog.fixture.json");
const VALIDATOR_PATH = path.join(EXTENSION_ROOT, "scripts", "validate-recycle-config-fixture.js");
const FIXTURE_RELATIVE_PATH = "Extension/config/recycle-device-catalog.fixture.json";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(text);
}

function sendJson(request, response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(request.method === "HEAD" ? undefined : JSON.stringify(payload, null, 2));
}

function normalizeDevice(device) {
  const source = device && typeof device === "object" ? device : {};
  return {
    deviceId: String(source.deviceId || "").trim(),
    categoryId: String(source.categoryId || "").trim(),
    displayName: String(source.displayName || "").trim(),
    materialId: String(source.materialId || "").trim(),
    validationProfileId: String(source.validationProfileId || "").trim(),
    enabled: source.enabled !== false
  };
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeCandidateDevice(device) {
  const source = device && typeof device === "object" ? device : {};
  return {
    deviceId: String(source.deviceId || "").trim(),
    categoryId: String(source.categoryId || "").trim(),
    displayName: String(source.displayName || "").trim(),
    materialId: String(source.materialId || "").trim(),
    legacyMaterialIds: Array.isArray(source.legacyMaterialIds) ? source.legacyMaterialIds.map(id => String(id || "").trim()) : [],
    imagePath: String(source.imagePath || "").trim(),
    helpImagePath: String(source.helpImagePath || "").trim(),
    warningText: String(source.warningText || "").trim(),
    validationProfileId: String(source.validationProfileId || "").trim(),
    enabled: source.enabled !== false
  };
}

function buildCandidateFixture(fixture) {
  return {
    schemaVersion: fixture.schemaVersion,
    revision: String(fixture.revision || "").trim(),
    devices: Array.isArray(fixture.devices) ? fixture.devices.map(normalizeCandidateDevice) : [],
    categoryHelp: isPlainObject(fixture.categoryHelp) ? fixture.categoryHelp : {},
    validationProfiles: Array.isArray(fixture.validationProfiles) ? fixture.validationProfiles.map(profile => String(profile || "").trim()) : [],
    generatedMaterialFilters: isPlainObject(fixture.generatedMaterialFilters) ? fixture.generatedMaterialFilters : {}
  };
}

function buildFixtureResponse(fixture) {
  const candidate = buildCandidateFixture(fixture);
  const devices = Array.isArray(fixture.devices) ? fixture.devices.map(normalizeDevice) : [];
  const categoriesById = new Map();

  devices.forEach(device => {
    const categoryId = device.categoryId || "(missing)";
    const existing = categoriesById.get(categoryId) || {
      categoryId,
      deviceCount: 0,
      enabledDeviceCount: 0,
      disabledDeviceCount: 0
    };

    existing.deviceCount += 1;
    if (device.enabled) existing.enabledDeviceCount += 1;
    else existing.disabledDeviceCount += 1;
    categoriesById.set(categoryId, existing);
  });

  return {
    ok: true,
    source: "Extension/config/recycle-device-catalog.fixture.json",
    schemaVersion: fixture.schemaVersion,
    revision: fixture.revision || "",
    deviceCount: devices.length,
    enabledDeviceCount: devices.filter(device => device.enabled).length,
    disabledDeviceCount: devices.filter(device => !device.enabled).length,
    categoryCount: categoriesById.size,
    categories: Array.from(categoriesById.values()).sort((left, right) => left.categoryId.localeCompare(right.categoryId)),
    devices,
    candidate
  };
}

function serveFixture(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(request, response, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  fs.readFile(FIXTURE_PATH, "utf8", (error, content) => {
    if (error) {
      sendJson(request, response, 500, { ok: false, error: "Cannot read recycle config fixture" });
      return;
    }

    try {
      const fixture = JSON.parse(content.replace(/^\uFEFF/, ""));
      sendJson(request, response, 200, buildFixtureResponse(fixture));
    } catch (parseError) {
      sendJson(request, response, 500, { ok: false, error: "Cannot parse recycle config fixture" });
    }
  });
}

function serveFixtureValidation(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(request, response, 405, { ok: false, pass: false, error: "Method not allowed" });
    return;
  }

  const args = [
    VALIDATOR_PATH,
    "--input",
    path.join(EXTENSION_ROOT, "config", "recycle-device-catalog.fixture.json")
  ];
  const child = spawn(process.execPath, args, {
    cwd: REPO_ROOT,
    shell: false,
    windowsHide: true
  });

  let stdout = "";
  let stderr = "";
  let settled = false;

  child.stdout.on("data", chunk => {
    stdout += chunk.toString("utf8");
  });

  child.stderr.on("data", chunk => {
    stderr += chunk.toString("utf8");
  });

  child.on("error", error => {
    if (settled) return;
    settled = true;
    sendJson(request, response, 500, {
      ok: false,
      pass: false,
      exitCode: null,
      error: error.message,
      stdout,
      stderr
    });
  });

  child.on("close", exitCode => {
    if (settled) return;
    settled = true;
    sendJson(request, response, 200, {
      ok: true,
      pass: exitCode === 0,
      exitCode,
      command: "validate-recycle-config-fixture.js --input",
      input: FIXTURE_RELATIVE_PATH,
      stdout,
      stderr
    });
  });
}

function resolvePublicPath(requestUrl) {
  const url = new URL(requestUrl, `http://${HOST}:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    return "";
  }

  return filePath;
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);

  if (url.pathname === "/api/fixture") {
    serveFixture(request, response);
    return;
  }

  if (url.pathname === "/api/validate-fixture") {
    serveFixtureValidation(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed");
    return;
  }

  const filePath = resolvePublicPath(request.url);
  if (!filePath) {
    sendText(response, 404, "Not found");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(response, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  });
}

const server = http.createServer(serveStatic);

server.listen(PORT, HOST, () => {
  console.log(`Recycle configurator skeleton: http://${HOST}:${PORT}/`);
  console.log("Mode: dev-only read-only fixture view and validation panel; no write endpoints.");
});
