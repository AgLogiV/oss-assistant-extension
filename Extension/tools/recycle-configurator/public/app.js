"use strict";

const endpoint = "/api/fixture";
const assetsEndpoint = "/api/assets";
const validationEndpoint = "/api/validate-fixture";
let currentCandidate = null;
let originalCandidateJson = "";
let isDirty = false;
let activeSearch = "";
let activeCategory = "";
let assetInventory = {
  deviceImages: [],
  helpImages: []
};

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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value) {
  return String(value || "").trim();
}

function legacyMaterialIdsToText(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function parseLegacyMaterialIds(value) {
  return String(value || "")
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function validationProfileOptions() {
  return Array.isArray(currentCandidate && currentCandidate.validationProfiles)
    ? currentCandidate.validationProfiles.map(profile => normalizeString(profile)).filter(Boolean)
    : [];
}

function assetOptionsForField(field) {
  if (field === "imagePath") return assetInventory.deviceImages;
  if (field === "helpImagePath") return assetInventory.helpImages;
  return [];
}

function categorySummaries(devices) {
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
    if (device.enabled !== false) existing.enabledDeviceCount += 1;
    else existing.disabledDeviceCount += 1;
    categoriesById.set(categoryId, existing);
  });

  return Array.from(categoriesById.values()).sort((left, right) => left.categoryId.localeCompare(right.categoryId));
}

function setFormControlsReady(isReady) {
  ["device-search", "category-filter"].forEach(id => {
    const control = byId(id);
    if (control) control.disabled = !isReady;
  });
}

function updateRevertButton() {
  const button = byId("revert-candidate-btn");
  if (button) button.disabled = !currentCandidate || !isDirty;
}

function populateCategoryFilter(categories) {
  const select = byId("category-filter");
  if (!select) return;

  const previousValue = select.value;
  select.textContent = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All categories";
  select.appendChild(allOption);

  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category.categoryId;
    option.textContent = category.categoryId;
    select.appendChild(option);
  });

  select.value = categories.some(category => category.categoryId === previousValue) ? previousValue : "";
  activeCategory = select.value;
}

function regenerateMaterialFilters(candidate) {
  const filters = {};
  const seenByCategory = new Map();
  const devices = Array.isArray(candidate && candidate.devices) ? candidate.devices : [];

  devices.forEach(device => {
    if (!device || device.enabled === false) return;

    const categoryId = normalizeString(device.categoryId);
    const materialId = normalizeString(device.materialId);
    if (!categoryId || !materialId) return;

    if (!filters[categoryId]) {
      filters[categoryId] = [];
      seenByCategory.set(categoryId, new Set());
    }

    const seen = seenByCategory.get(categoryId);
    if (!seen.has(materialId)) {
      filters[categoryId].push(materialId);
      seen.add(materialId);
    }
  });

  return filters;
}

function deviceMatchesFilters(device) {
  const matchesCategory = !activeCategory || normalizeString(device.categoryId) === activeCategory;
  if (!matchesCategory) return false;

  const query = activeSearch.toLowerCase();
  if (!query) return true;

  return [
    device.deviceId,
    device.categoryId,
    device.displayName,
    device.materialId
  ].some(value => normalizeString(value).toLowerCase().includes(query));
}

function filteredDeviceEntries() {
  const devices = Array.isArray(currentCandidate && currentCandidate.devices) ? currentCandidate.devices : [];
  return devices
    .map((device, index) => ({ device, index }))
    .filter(entry => deviceMatchesFilters(entry.device));
}

function updateFilterStatus(visibleCount) {
  const totalCount = Array.isArray(currentCandidate && currentCandidate.devices) ? currentCandidate.devices.length : 0;
  setText("filter-status", currentCandidate ? `${visibleCount} of ${totalCount} devices shown` : "Waiting for fixture");
}

function renderFilteredDevices() {
  const entries = filteredDeviceEntries();
  renderDevices(entries);
  updateFilterStatus(entries.length);
}

function candidateForAction() {
  if (!currentCandidate) return null;

  const candidate = cloneJson(currentCandidate);
  candidate.devices = Array.isArray(candidate.devices) ? candidate.devices.map(device => ({
    ...device,
    displayName: normalizeString(device.displayName),
    materialId: normalizeString(device.materialId),
    legacyMaterialIds: Array.isArray(device.legacyMaterialIds) ? device.legacyMaterialIds.map(normalizeString).filter(Boolean) : [],
    imagePath: normalizeString(device.imagePath),
    helpImagePath: normalizeString(device.helpImagePath),
    warningText: normalizeString(device.warningText),
    validationProfileId: normalizeString(device.validationProfileId),
    enabled: device.enabled !== false
  })) : [];
  candidate.generatedMaterialFilters = regenerateMaterialFilters(candidate);
  currentCandidate.generatedMaterialFilters = cloneJson(candidate.generatedMaterialFilters);
  return candidate;
}

function updateSummaryFromCandidate() {
  const devices = Array.isArray(currentCandidate && currentCandidate.devices) ? currentCandidate.devices : [];
  const categories = categorySummaries(devices);
  const enabledCount = devices.filter(device => device.enabled !== false).length;

  setText("device-count", String(devices.length));
  setText("enabled-count", `${enabledCount} / ${devices.length - enabledCount}`);
  setText("category-count", String(categories.length));
  renderCategories(categories);
  populateCategoryFilter(categories);
}

function updateDirtyState() {
  if (!currentCandidate) {
    isDirty = false;
    setText("edit-status", "Unavailable");
    return;
  }

  isDirty = JSON.stringify(currentCandidate) !== originalCandidateJson;
  setText("edit-status", isDirty ? "Edited in browser memory" : "Clean");
  updateRevertButton();
}

function updateDeviceField(index, field, value) {
  if (!currentCandidate || !Array.isArray(currentCandidate.devices) || !currentCandidate.devices[index]) return;

  const device = currentCandidate.devices[index];
  if (field === "legacyMaterialIds") {
    device.legacyMaterialIds = parseLegacyMaterialIds(value);
  } else if (field === "enabled") {
    device.enabled = Boolean(value);
    updateSummaryFromCandidate();
  } else {
    device[field] = normalizeString(value);
  }

  if (field === "materialId" || field === "enabled") {
    currentCandidate.generatedMaterialFilters = regenerateMaterialFilters(currentCandidate);
  }

  updateDirtyState();
  setText("export-status", isDirty ? "Edited candidate ready" : "Ready");
  updateFilterStatus(filteredDeviceEntries().length);
}

function syncAssetSelect(select, value) {
  const normalized = normalizeString(value);
  select.value = Array.from(select.options).some(option => option.value === normalized) ? normalized : "";
}

function inputCell(row, device, index, field, options = {}) {
  const cell = document.createElement("td");
  const control = options.multiline ? document.createElement("textarea") : document.createElement("input");

  control.value = options.format ? options.format(device[field]) : normalizeString(device[field]);
  control.dataset.deviceIndex = String(index);
  control.dataset.field = field;
  control.addEventListener("input", event => {
    updateDeviceField(Number(event.target.dataset.deviceIndex), event.target.dataset.field, event.target.value);
  });

  cell.appendChild(control);
  row.appendChild(cell);
}

function assetPathCell(row, device, index, field) {
  const cell = document.createElement("td");
  const wrapper = document.createElement("div");
  const input = document.createElement("input");
  const select = document.createElement("select");
  const options = assetOptionsForField(field);

  wrapper.className = "asset-path-control";
  input.value = normalizeString(device[field]);
  input.dataset.deviceIndex = String(index);
  input.dataset.field = field;
  input.addEventListener("input", event => {
    updateDeviceField(Number(event.target.dataset.deviceIndex), event.target.dataset.field, event.target.value);
    syncAssetSelect(select, event.target.value);
  });

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Manual / empty";
  select.appendChild(emptyOption);

  options.forEach(asset => {
    const option = document.createElement("option");
    option.value = asset.path;
    option.textContent = asset.fileName;
    select.appendChild(option);
  });

  syncAssetSelect(select, device[field]);
  select.dataset.deviceIndex = String(index);
  select.dataset.field = field;
  select.addEventListener("change", event => {
    if (!event.target.value) return;
    input.value = event.target.value;
    updateDeviceField(Number(event.target.dataset.deviceIndex), event.target.dataset.field, event.target.value);
  });

  wrapper.appendChild(input);
  wrapper.appendChild(select);
  cell.appendChild(wrapper);
  row.appendChild(cell);
}

function validationProfileCell(row, device, index) {
  const cell = document.createElement("td");
  const select = document.createElement("select");

  validationProfileOptions().forEach(profileId => {
    const option = document.createElement("option");
    option.value = profileId;
    option.textContent = profileId;
    select.appendChild(option);
  });

  select.value = normalizeString(device.validationProfileId);
  select.dataset.deviceIndex = String(index);
  select.dataset.field = "validationProfileId";
  select.addEventListener("change", event => {
    updateDeviceField(Number(event.target.dataset.deviceIndex), event.target.dataset.field, event.target.value);
  });

  cell.appendChild(select);
  row.appendChild(cell);
}

function enabledCell(row, device, index) {
  const cell = document.createElement("td");
  const label = document.createElement("label");
  const input = document.createElement("input");

  label.className = "checkbox-label";
  input.type = "checkbox";
  input.checked = device.enabled !== false;
  input.dataset.deviceIndex = String(index);
  input.dataset.field = "enabled";
  input.addEventListener("change", event => {
    updateDeviceField(Number(event.target.dataset.deviceIndex), event.target.dataset.field, event.target.checked);
  });

  label.appendChild(input);
  label.append(" enabled");
  cell.appendChild(label);
  row.appendChild(cell);
}

function readonlyCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = value || "";
  row.appendChild(cell);
}

function renderDevices(entries) {
  const body = byId("device-table-body");
  if (!body) return;

  body.textContent = "";

  if (!Array.isArray(entries) || !entries.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 10;
    cell.textContent = currentCandidate ? "No devices match the current filters." : "No devices found in fixture.";
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  entries.forEach(entry => {
    const { device, index } = entry;
    const row = document.createElement("tr");
    readonlyCell(row, device.deviceId);
    readonlyCell(row, device.categoryId);
    inputCell(row, device, index, "displayName");
    inputCell(row, device, index, "materialId");
    inputCell(row, device, index, "legacyMaterialIds", { multiline: true, format: legacyMaterialIdsToText });
    assetPathCell(row, device, index, "imagePath");
    assetPathCell(row, device, index, "helpImagePath");
    inputCell(row, device, index, "warningText", { multiline: true });
    validationProfileCell(row, device, index);
    enabledCell(row, device, index);
    body.appendChild(row);
  });
}

function renderFixture(data) {
  currentCandidate = data.candidate ? cloneJson(data.candidate) : null;
  originalCandidateJson = currentCandidate ? JSON.stringify(currentCandidate) : "";
  setText("fixture-status", data.ok ? "Loaded" : "Failed");
  setText("export-status", currentCandidate ? "Ready" : "Unavailable");
  setText("fixture-source", data.source || "Extension/config/recycle-device-catalog.fixture.json");
  setText("schema-version", String(data.schemaVersion ?? "-"));
  setText("revision", data.revision || "-");
  setText("device-count", String(data.deviceCount ?? "-"));
  setText("enabled-count", `${data.enabledDeviceCount ?? "-"} / ${data.disabledDeviceCount ?? "-"}`);
  setText("category-count", String(data.categoryCount ?? "-"));
  if (currentCandidate) {
    updateSummaryFromCandidate();
    renderFilteredDevices();
  } else {
    renderCategories(data.categories);
    renderDevices((data.devices || []).map((device, index) => ({ device, index })));
    updateFilterStatus(0);
  }
  updateDirtyState();
  setExportReady(Boolean(currentCandidate));
  setFormControlsReady(Boolean(currentCandidate));
}

function renderError(error) {
  currentCandidate = null;
  originalCandidateJson = "";
  activeSearch = "";
  activeCategory = "";
  setText("fixture-status", "Failed");
  setText("export-status", "Unavailable");
  updateFilterStatus(0);
  updateDirtyState();
  setExportReady(false);
  setFormControlsReady(false);
  const body = byId("device-table-body");
  if (body) {
    body.textContent = "";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 10;
    cell.textContent = `Cannot load fixture: ${error.message}`;
    row.appendChild(cell);
    body.appendChild(row);
  }
}

function applyFiltersFromControls() {
  const search = byId("device-search");
  const category = byId("category-filter");
  activeSearch = normalizeString(search && search.value);
  activeCategory = normalizeString(category && category.value);
  renderFilteredDevices();
}

function revertCandidate() {
  if (!originalCandidateJson) return;

  currentCandidate = JSON.parse(originalCandidateJson);
  setText("export-status", "Ready");
  setText("candidate-validation-status", "Not run");
  updateSummaryFromCandidate();
  renderFilteredDevices();
  updateDirtyState();
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
  const candidate = candidateForAction();
  if (!candidate) {
    setText("export-status", "Fixture not loaded");
    return;
  }

  const json = `${JSON.stringify(candidate, null, 2)}\n`;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const filename = candidateFileName(candidate);

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
  const candidate = candidateForAction();
  if (!candidate) {
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
      body: JSON.stringify(candidate)
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

async function loadAssetInventory() {
  try {
    const response = await fetch(assetsEndpoint, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    assetInventory = {
      deviceImages: Array.isArray(data.deviceImages) ? data.deviceImages : [],
      helpImages: Array.isArray(data.helpImages) ? data.helpImages : []
    };
  } catch (error) {
    assetInventory = {
      deviceImages: [],
      helpImages: []
    };
    console.warn("Cannot load asset inventory", error);
  }
}

async function initialize() {
  await loadAssetInventory();
  await loadFixture();
}

initialize();

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

const deviceSearch = byId("device-search");
if (deviceSearch) {
  deviceSearch.addEventListener("input", applyFiltersFromControls);
}

const categoryFilter = byId("category-filter");
if (categoryFilter) {
  categoryFilter.addEventListener("change", applyFiltersFromControls);
}

const revertButton = byId("revert-candidate-btn");
if (revertButton) {
  revertButton.addEventListener("click", revertCandidate);
}
