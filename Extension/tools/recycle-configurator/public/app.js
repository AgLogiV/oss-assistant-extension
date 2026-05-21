"use strict";

const endpoint = "/api/fixture";
const validationEndpoint = "/api/validate-fixture";
let currentCandidate = null;

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value;
}

function renderCategories(categories) {
  const root = byId("category-list");
  if (!root) return;

  root.textContent = "";

  if (!Array.isArray(categories) || !categories.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No categories found in fixture.";
    root.appendChild(empty);
    return;
  }

  categories.forEach(category => {
    const item = document.createElement("span");
    item.className = "category-pill";
    item.textContent = `${category.categoryId} (${category.deviceCount})`;
    root.appendChild(item);
  });
}

function renderDevices(devices) {
  const body = byId("device-table-body");
  if (!body) return;

  body.textContent = "";

  if (!Array.isArray(devices) || !devices.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "No devices found in fixture.";
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  devices.forEach(device => {
    const row = document.createElement("tr");
    [
      device.deviceId,
      device.categoryId,
      device.displayName,
      device.materialId,
      device.validationProfileId,
      device.enabled ? "true" : "false"
    ].forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value || "";
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
}

function renderFixture(data) {
  currentCandidate = data.candidate || null;
  setText("fixture-status", data.ok ? "Loaded" : "Failed");
  setText("export-status", currentCandidate ? "Ready" : "Unavailable");
  setText("fixture-source", data.source || "Extension/config/recycle-device-catalog.fixture.json");
  setText("schema-version", String(data.schemaVersion ?? "-"));
  setText("revision", data.revision || "-");
  setText("device-count", String(data.deviceCount ?? "-"));
  setText("enabled-count", `${data.enabledDeviceCount ?? "-"} / ${data.disabledDeviceCount ?? "-"}`);
  setText("category-count", String(data.categoryCount ?? "-"));
  renderCategories(data.categories);
  renderDevices(data.devices);
  setExportReady(Boolean(currentCandidate));
}

function renderError(error) {
  currentCandidate = null;
  setText("fixture-status", "Failed");
  setText("export-status", "Unavailable");
  setExportReady(false);
  const body = byId("device-table-body");
  if (body) {
    body.textContent = "";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = `Cannot load fixture: ${error.message}`;
    row.appendChild(cell);
    body.appendChild(row);
  }
}

function setExportReady(isReady) {
  ["export-candidate-btn", "validate-candidate-btn"].forEach(id => {
    const button = byId(id);
    if (button) button.disabled = !isReady;
  });
}

function candidateFileName(candidate) {
  const revision = String(candidate && candidate.revision || "dev-current")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "dev-current";
  return `recycle-device-catalog.candidate.${revision}.json`;
}

function exportCandidate() {
  if (!currentCandidate) {
    setText("export-status", "Fixture not loaded");
    return;
  }

  const json = `${JSON.stringify(currentCandidate, null, 2)}\n`;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const filename = candidateFileName(currentCandidate);

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  setText("export-status", `Downloaded ${filename}`);
}

function setValidationRunning(isRunning) {
  const button = byId("validate-fixture-btn");
  if (button) {
    button.disabled = isRunning;
    button.textContent = isRunning ? "Validating..." : "Validate Fixture";
  }
}

function setCandidateValidationRunning(isRunning) {
  const button = byId("validate-candidate-btn");
  if (button) {
    button.disabled = isRunning || !currentCandidate;
    button.textContent = isRunning ? "Validating Candidate..." : "Validate Candidate";
  }
}

function renderValidationResult(data) {
  setText("validation-status", data.pass ? "PASS" : "FAIL");
  setText("validation-exit-code", data.exitCode === null || data.exitCode === undefined ? "-" : String(data.exitCode));
  setText("validation-input", data.input || "Extension/config/recycle-device-catalog.fixture.json");
  setText("validation-stdout", data.stdout || "(empty)");
  setText("validation-stderr", data.stderr || "(empty)");
}

function renderCandidateValidationResult(data) {
  setText("candidate-validation-status", data.pass ? "PASS" : "FAIL");
  setText("validation-exit-code", data.exitCode === null || data.exitCode === undefined ? "-" : String(data.exitCode));
  setText("validation-input", data.input || "temp-candidate.json");
  setText("validation-stdout", data.stdout || "(empty)");
  setText("validation-stderr", data.stderr || "(empty)");
}

function renderValidationError(error) {
  setText("validation-status", "ERROR");
  setText("validation-exit-code", "-");
  setText("validation-stdout", "(empty)");
  setText("validation-stderr", error.message);
}

function renderCandidateValidationError(error) {
  setText("candidate-validation-status", "ERROR");
  setText("validation-exit-code", "-");
  setText("validation-input", "temp-candidate.json");
  setText("validation-stdout", "(empty)");
  setText("validation-stderr", error.message);
}

async function validateCandidate() {
  if (!currentCandidate) {
    setText("candidate-validation-status", "No candidate loaded");
    return;
  }

  setCandidateValidationRunning(true);
  setText("candidate-validation-status", "Running");
  setText("validation-exit-code", "-");
  setText("validation-input", "temp-candidate.json");
  setText("validation-stdout", "Running candidate validator...");
  setText("validation-stderr", "(empty)");

  try {
    const response = await fetch("/api/validate-candidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(currentCandidate)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    renderCandidateValidationResult(data);
  } catch (error) {
    renderCandidateValidationError(error);
  } finally {
    setCandidateValidationRunning(false);
  }
}

async function validateFixture() {
  setValidationRunning(true);
  setText("validation-status", "Running");
  setText("validation-exit-code", "-");
  setText("validation-stdout", "Running validator...");
  setText("validation-stderr", "(empty)");

  try {
    const response = await fetch(validationEndpoint, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    renderValidationResult(data);
  } catch (error) {
    renderValidationError(error);
  } finally {
    setValidationRunning(false);
  }
}

async function loadFixture() {
  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    renderFixture(data);
  } catch (error) {
    renderError(error);
  }
}

loadFixture();

const validateButton = byId("validate-fixture-btn");
if (validateButton) {
  validateButton.addEventListener("click", validateFixture);
}

const exportButton = byId("export-candidate-btn");
if (exportButton) {
  exportButton.addEventListener("click", exportCandidate);
}

const validateCandidateButton = byId("validate-candidate-btn");
if (validateCandidateButton) {
  validateCandidateButton.addEventListener("click", validateCandidate);
}
