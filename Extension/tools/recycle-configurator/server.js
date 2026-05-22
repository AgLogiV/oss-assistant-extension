#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
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
const MAX_CANDIDATE_BODY_BYTES = 1024 * 1024;
const VALIDATOR_TIMEOUT_MS = 20 * 1000;
const MAX_VALIDATOR_OUTPUT_BYTES = 128 * 1024;
const TEMP_DIR_PREFIX = "oss-recycle-configurator-";
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

function toExtensionRelativePath(prefix, fileName) {
  return `${prefix}${fileName}`.replace(/\\/g, "/");
}

function listAssetsForPolicy(policy, callback) {
  fs.readdir(policy.directory, { withFileTypes: true }, (error, entries) => {
    if (error) {
      callback(error);
      return;
    }

    const assets = entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .filter(fileName => ASSET_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
      .map(fileName => ({
        path: toExtensionRelativePath(policy.extensionPrefix, fileName),
        fileName,
        kind: policy.kind
      }))
      .sort((left, right) => left.path.localeCompare(right.path));

    callback(null, assets);
  });
}

function buildAssetInventory(callback) {
  const result = {
    ok: true,
    policies: ASSET_POLICIES.map(policy => ({
      key: policy.key,
      kind: policy.kind,
      extensionPrefix: policy.extensionPrefix
    }))
  };
  let remaining = ASSET_POLICIES.length;
  let settled = false;

  ASSET_POLICIES.forEach(policy => {
    listAssetsForPolicy(policy, (error, assets) => {
      if (settled) return;
      if (error) {
        settled = true;
        callback(error);
        return;
      }

      result[policy.key] = assets;
      remaining -= 1;
      if (remaining === 0) {
        callback(null, result);
      }
    });
  });
}

function cleanupTempCandidate(tempDir, tempFile, callback) {
  const finish = typeof callback === "function" ? callback : () => {};
  if (!tempDir) {
    finish();
    return;
  }

  fs.unlink(tempFile, () => {
    fs.rmdir(tempDir, () => {
      finish();
    });
  });
}

function readJsonBody(request, callback) {
  let raw = "";
  let byteLength = 0;
  let completed = false;

  function done(error, value) {
    if (completed) return;
    completed = true;
    callback(error, value);
  }

  request.on("data", chunk => {
    if (completed) return;
    byteLength += chunk.length;
    if (byteLength > MAX_CANDIDATE_BODY_BYTES) {
      done(new Error("Candidate JSON body is too large"));
      return;
    }
    raw += chunk.toString("utf8");
  });

  request.on("end", () => {
    if (completed) return;
    try {
      done(null, JSON.parse(raw || "{}"));
    } catch (error) {
      done(new Error("Candidate JSON body is not valid JSON"));
    }
  });

  request.on("error", error => {
    done(error);
  });
}

function createOutputCapture() {
  return {
    text: "",
    bytes: 0,
    truncated: false
  };
}

function appendLimitedOutput(capture, chunk) {
  if (capture.truncated) return;

  const text = chunk.toString("utf8");
  const bytes = Buffer.byteLength(text, "utf8");
  const remaining = MAX_VALIDATOR_OUTPUT_BYTES - capture.bytes;

  if (bytes <= remaining) {
    capture.text += text;
    capture.bytes += bytes;
    return;
  }

  if (remaining > 0) {
    capture.text += Buffer.from(text, "utf8").subarray(0, remaining).toString("utf8");
    capture.bytes = MAX_VALIDATOR_OUTPUT_BYTES;
  }
  capture.truncated = true;
}

function capturedOutput(capture, label) {
  if (!capture.truncated) return capture.text;
  return `${capture.text}\n[${label} truncated at ${MAX_VALIDATOR_OUTPUT_BYTES} bytes]\n`;
}

function validatorResult(baseResult, stdoutCapture, stderrCapture) {
  return {
    ...baseResult,
    stdout: capturedOutput(stdoutCapture, "stdout"),
    stderr: capturedOutput(stderrCapture, "stderr"),
    stdoutTruncated: stdoutCapture.truncated,
    stderrTruncated: stderrCapture.truncated,
    timeoutMs: VALIDATOR_TIMEOUT_MS,
    outputLimitBytes: MAX_VALIDATOR_OUTPUT_BYTES
  };
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

function serveAssets(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(request, response, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  buildAssetInventory((error, inventory) => {
    if (error) {
      sendJson(request, response, 500, { ok: false, error: "Cannot read recycle configurator asset inventory" });
      return;
    }

    sendJson(request, response, 200, inventory);
  });
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

  runValidator(FIXTURE_PATH, FIXTURE_RELATIVE_PATH, result => {
    sendJson(request, response, result.ok ? 200 : 500, result);
  });
}

function runValidator(inputPath, inputLabel, callback) {
  const child = spawn(process.execPath, [VALIDATOR_PATH, "--input", inputPath], {
    cwd: REPO_ROOT,
    shell: false,
    windowsHide: true
  });

  const stdout = createOutputCapture();
  const stderr = createOutputCapture();
  let settled = false;
  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    child.kill();
    callback(validatorResult({
      ok: false,
      pass: false,
      exitCode: null,
      error: `Validator timed out after ${VALIDATOR_TIMEOUT_MS} ms`,
      timedOut: true,
      command: "validate-recycle-config-fixture.js --input",
      input: inputLabel
    }, stdout, stderr));
  }, VALIDATOR_TIMEOUT_MS);

  function finish(result) {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    callback(validatorResult(result, stdout, stderr));
  }

  child.stdout.on("data", chunk => {
    appendLimitedOutput(stdout, chunk);
  });

  child.stderr.on("data", chunk => {
    appendLimitedOutput(stderr, chunk);
  });

  child.on("error", error => {
    finish({
      ok: false,
      pass: false,
      exitCode: null,
      error: error.message,
      command: "validate-recycle-config-fixture.js --input",
      input: inputLabel
    });
  });

  child.on("close", exitCode => {
    finish({
      ok: true,
      pass: exitCode === 0,
      exitCode,
      command: "validate-recycle-config-fixture.js --input",
      input: inputLabel
    });
  });
}

function serveCandidateValidation(request, response) {
  if (request.method !== "POST") {
    sendJson(request, response, 405, { ok: false, pass: false, error: "Method not allowed" });
    return;
  }

  readJsonBody(request, (readError, candidate) => {
    if (readError) {
      sendJson(request, response, 400, {
        ok: false,
        pass: false,
        exitCode: null,
        error: readError.message,
        stdout: "",
        stderr: ""
      });
      return;
    }

    fs.mkdtemp(path.join(os.tmpdir(), TEMP_DIR_PREFIX), (tempDirError, tempDir) => {
      if (tempDirError) {
        sendJson(request, response, 500, {
          ok: false,
          pass: false,
          exitCode: null,
          error: "Cannot create temp directory",
          stdout: "",
          stderr: ""
        });
        return;
      }

      const tempFile = path.join(tempDir, "candidate.json");
      fs.writeFile(tempFile, `${JSON.stringify(candidate, null, 2)}\n`, "utf8", writeError => {
        if (writeError) {
          cleanupTempCandidate(tempDir, tempFile, () => {
            sendJson(request, response, 500, {
              ok: false,
              pass: false,
              exitCode: null,
              error: "Cannot write temp candidate file",
              stdout: "",
              stderr: ""
            });
          });
          return;
        }

        runValidator(tempFile, "temp-candidate.json", result => {
          cleanupTempCandidate(tempDir, tempFile, () => {
            sendJson(request, response, result.ok ? 200 : 500, result);
          });
        });
      });
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

  if (url.pathname === "/api/assets") {
    serveAssets(request, response);
    return;
  }

  if (url.pathname === "/api/validate-fixture") {
    serveFixtureValidation(request, response);
    return;
  }

  if (url.pathname === "/api/validate-candidate") {
    serveCandidateValidation(request, response);
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
