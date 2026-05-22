"use strict";

const endpoint = "/api/fixture";
const assetsEndpoint = "/api/assets";
const assetPreviewEndpoint = "/api/asset-preview";
const validationEndpoint = "/api/validate-fixture";
const MAX_IMPORT_FILE_BYTES = 1024 * 1024;
let currentCandidate = null;
let originalCandidateJson = "";
let isDirty = false;
let activeSearch = "";
let activeCategory = "";
let selectedDeviceIndex = null;
let lastCandidateValidationJson = "";
let candidateValidationHasRun = false;
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

function setResultBadge(id, state, text) {
  const element = byId(id);
  if (!element) return;

  element.textContent = text;
  element.className = `result-badge result-${state}`;
}

function setValidationHint(message, state = "neutral") {
  const element = byId("validation-hint");
  if (!element) return;

  element.textContent = message;
  element.className = `validation-hint validation-hint-${state}`;
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

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
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

function resetFilterControls() {
  activeSearch = "";
  activeCategory = "";

  const search = byId("device-search");
  if (search) search.value = "";

  const category = byId("category-filter");
  if (category) category.value = "";
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

function selectedDevice() {
  if (!currentCandidate || !Array.isArray(currentCandidate.devices)) return null;
  if (selectedDeviceIndex === null || selectedDeviceIndex === undefined) return null;
  return currentCandidate.devices[selectedDeviceIndex] || null;
}

function selectedDeviceIsVisible(entries) {
  return entries.some(entry => entry.index === selectedDeviceIndex);
}

function ensureSelectedDevice(entries) {
  const devices = Array.isArray(currentCandidate && currentCandidate.devices) ? currentCandidate.devices : [];
  if (!devices.length) {
    selectedDeviceIndex = null;
    return;
  }

  if (selectedDeviceIndex === null || !devices[selectedDeviceIndex]) {
    selectedDeviceIndex = entries.length ? entries[0].index : 0;
  }
}

function renderFilteredDevices() {
  const entries = filteredDeviceEntries();
  ensureSelectedDevice(entries);
  renderDevices(entries);
  updateFilterStatus(entries.length);
  updateSelectedDeviceVisibility(entries);
  renderDeviceEditor();
}

function refreshDeviceList() {
  const entries = filteredDeviceEntries();
  renderDevices(entries);
  updateFilterStatus(entries.length);
  updateSelectedDeviceVisibility(entries);
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

function candidateValidationFingerprint() {
  const candidate = candidateForAction();
  return candidate ? JSON.stringify(candidate) : "";
}

function resetValidationUi(message) {
  lastCandidateValidationJson = "";
  candidateValidationHasRun = false;
  setText("validation-target", "-");
  setResultBadge("validation-status", "neutral", "Not run");
  setResultBadge("candidate-validation-status", "neutral", "Not validated");
  setText("validation-exit-code", "-");
  setText("validation-input", "temp-candidate.json");
  setText("validation-stdout", "Validation output will appear here.");
  setText("validation-stderr", "Validation errors will appear here.");
  setValidationHint(message || "Run Validate Candidate to validate the current browser-memory candidate.");
}

function markCandidateValidationStaleIfNeeded() {
  if (!candidateValidationHasRun) return;

  const currentJson = candidateValidationFingerprint();
  if (currentJson && currentJson !== lastCandidateValidationJson) {
    setResultBadge("candidate-validation-status", "stale", "Unvalidated changes");
    setValidationHint("Candidate changed after the last validation. Run Validate Candidate again before exporting or publishing.", "stale");
  }
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
  markCandidateValidationStaleIfNeeded();
  setText("export-status", isDirty ? "Edited candidate ready" : "Ready");
  updateFilterStatus(filteredDeviceEntries().length);
}

function syncAssetSelect(select, value) {
  const normalized = normalizeString(value);
  select.value = Array.from(select.options).some(option => option.value === normalized) ? normalized : "";
}

function previewUrlForAssetPath(value) {
  const normalized = normalizeString(value);
  if (!normalized) return "";
  return `${assetPreviewEndpoint}?path=${encodeURIComponent(normalized)}`;
}

function setAssetPreview(preview, value) {
  if (!preview) return;
  const url = previewUrlForAssetPath(value);
  preview.textContent = "";

  if (!url) {
    preview.className = "asset-preview asset-preview-empty";
    preview.textContent = "No preview";
    return;
  }

  const image = document.createElement("img");
  image.src = url;
  image.alt = "";
  image.loading = "lazy";
  image.addEventListener("error", () => {
    preview.textContent = "";
    preview.className = "asset-preview asset-preview-empty";
    preview.textContent = "No preview";
  });

  preview.className = "asset-preview";
  preview.appendChild(image);
}

function readonlyCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = value || "";
  row.appendChild(cell);
}

function enabledListCell(row, device) {
  const cell = document.createElement("td");
  const status = document.createElement("span");
  status.className = device.enabled === false ? "status-badge status-disabled" : "status-badge status-enabled";
  status.textContent = device.enabled === false ? "disabled" : "enabled";
  cell.appendChild(status);
  row.appendChild(cell);
}

function selectDevice(index) {
  selectedDeviceIndex = index;
  renderFilteredDevices();
}

function updateSelectedDeviceVisibility(entries) {
  const device = selectedDevice();
  if (!device) {
    setText("selected-device-status", "No device selected");
    return;
  }

  const suffix = selectedDeviceIsVisible(entries) ? "" : " (hidden by filters)";
  setText("selected-device-status", `${device.deviceId}${suffix}`);
}

function renderDevices(entries) {
  const body = byId("device-table-body");
  if (!body) return;

  body.textContent = "";

  if (!Array.isArray(entries) || !entries.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = currentCandidate ? "No devices match the current filters." : "No devices found in fixture.";
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  entries.forEach(entry => {
    const { device, index } = entry;
    const row = document.createElement("tr");
    row.className = index === selectedDeviceIndex ? "selected-row" : "";
    row.tabIndex = 0;
    row.dataset.deviceIndex = String(index);
    row.addEventListener("click", () => selectDevice(index));
    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectDevice(index);
      }
    });
    readonlyCell(row, device.deviceId);
    readonlyCell(row, device.categoryId);
    readonlyCell(row, device.displayName);
    readonlyCell(row, device.materialId);
    enabledListCell(row, device);
    body.appendChild(row);
  });
}

function setEditorControlsEnabled(isEnabled) {
  [
    "editor-displayName",
    "editor-materialId",
    "editor-legacyMaterialIds",
    "editor-imagePath",
    "editor-imagePath-select",
    "editor-helpImagePath",
    "editor-helpImagePath-select",
    "editor-warningText",
    "editor-validationProfileId",
    "editor-enabled"
  ].forEach(id => {
    const control = byId(id);
    if (control) control.disabled = !isEnabled;
  });
}

function populateAssetSelect(select, field, value) {
  if (!select) return;
  select.textContent = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Manual / empty";
  select.appendChild(emptyOption);

  assetOptionsForField(field).forEach(asset => {
    const option = document.createElement("option");
    option.value = asset.path;
    option.textContent = asset.fileName;
    select.appendChild(option);
  });

  syncAssetSelect(select, value);
}

function populateValidationProfileSelect(select, value) {
  if (!select) return;
  select.textContent = "";

  validationProfileOptions().forEach(profileId => {
    const option = document.createElement("option");
    option.value = profileId;
    option.textContent = profileId;
    select.appendChild(option);
  });

  select.value = normalizeString(value);
}

function renderDeviceEditor() {
  const device = selectedDevice();
  const hasDevice = Boolean(device);

  setEditorControlsEnabled(hasDevice);
  setText("editor-deviceId", hasDevice ? device.deviceId : "-");
  setText("editor-categoryId", hasDevice ? device.categoryId : "-");

  const textControls = {
    "editor-displayName": hasDevice ? normalizeString(device.displayName) : "",
    "editor-materialId": hasDevice ? normalizeString(device.materialId) : "",
    "editor-legacyMaterialIds": hasDevice ? legacyMaterialIdsToText(device.legacyMaterialIds) : "",
    "editor-imagePath": hasDevice ? normalizeString(device.imagePath) : "",
    "editor-helpImagePath": hasDevice ? normalizeString(device.helpImagePath) : "",
    "editor-warningText": hasDevice ? normalizeString(device.warningText) : ""
  };

  Object.entries(textControls).forEach(([id, value]) => {
    const control = byId(id);
    if (control) control.value = value;
  });

  populateAssetSelect(byId("editor-imagePath-select"), "imagePath", hasDevice ? device.imagePath : "");
  populateAssetSelect(byId("editor-helpImagePath-select"), "helpImagePath", hasDevice ? device.helpImagePath : "");
  populateValidationProfileSelect(byId("editor-validationProfileId"), hasDevice ? device.validationProfileId : "");
  setAssetPreview(byId("editor-imagePath-preview"), hasDevice ? device.imagePath : "");
  setAssetPreview(byId("editor-helpImagePath-preview"), hasDevice ? device.helpImagePath : "");

  const enabled = byId("editor-enabled");
  if (enabled) enabled.checked = hasDevice ? device.enabled !== false : false;

  if (!hasDevice) {
    setText("selected-device-status", currentCandidate ? "No device selected" : "Waiting for fixture");
  }
}

function renderFixture(data) {
  currentCandidate = data.candidate ? cloneJson(data.candidate) : null;
  originalCandidateJson = currentCandidate ? JSON.stringify(currentCandidate) : "";
  selectedDeviceIndex = null;
  resetFilterControls();
  setText("fixture-status", data.ok ? "Loaded" : "Failed");
  setText("export-status", currentCandidate ? "Ready" : "Unavailable");
  resetValidationUi("Loaded the project fixture. Run Validate Fixture or Validate Candidate to see the latest validation result.");
  setText("import-status", "Import status: No candidate imported.");
  setText("fixture-source", `Fixture: ${data.source || "Extension/config/recycle-device-catalog.fixture.json"}`);
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
    renderDeviceEditor();
  }
  updateDirtyState();
  setExportReady(Boolean(currentCandidate));
  setFormControlsReady(Boolean(currentCandidate));
}

function renderError(error) {
  currentCandidate = null;
  originalCandidateJson = "";
  selectedDeviceIndex = null;
  lastCandidateValidationJson = "";
  candidateValidationHasRun = false;
  activeSearch = "";
  activeCategory = "";
  setText("fixture-status", "Failed");
  setText("export-status", "Unavailable");
  setText("import-status", "Import status: Fixture load failed.");
  setText("validation-target", "-");
  setResultBadge("validation-status", "error", "ERROR");
  setResultBadge("candidate-validation-status", "neutral", "Not run");
  setValidationHint("Fixture could not be loaded. Check the error details and local server output.", "fail");
  updateFilterStatus(0);
  updateDirtyState();
  setExportReady(false);
  setFormControlsReady(false);
  const body = byId("device-table-body");
  if (body) {
    body.textContent = "";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = `Cannot load fixture: ${error.message}`;
    row.appendChild(cell);
    body.appendChild(row);
  }
  renderDeviceEditor();
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
  selectedDeviceIndex = null;
  setText("export-status", "Ready");
  resetValidationUi("Reverted to the loaded baseline. Run Validate Candidate to validate the current browser-memory candidate.");
  updateSummaryFromCandidate();
  renderFilteredDevices();
  updateDirtyState();
}

function validateImportedCandidateShape(candidate) {
  const errors = [];

  if (!isPlainObject(candidate)) {
    return ["JSON root must be an object."];
  }

  if (candidate.schemaVersion === undefined) errors.push("schemaVersion is missing.");
  if (!normalizeString(candidate.revision)) errors.push("revision is missing.");
  if (!Array.isArray(candidate.devices)) errors.push("devices must be an array.");
  if (!isPlainObject(candidate.categoryHelp)) errors.push("categoryHelp must be an object.");
  if (!Array.isArray(candidate.validationProfiles)) errors.push("validationProfiles must be an array.");
  if (!isPlainObject(candidate.generatedMaterialFilters)) errors.push("generatedMaterialFilters must be an object.");

  return errors;
}

function setCurrentCandidateFromImport(candidate, fileName) {
  currentCandidate = cloneJson(candidate);
  originalCandidateJson = JSON.stringify(currentCandidate);
  selectedDeviceIndex = null;
  resetFilterControls();
  setText("fixture-status", "Imported");
  setText("fixture-source", `Imported candidate: ${fileName}`);
  setText("import-status", `Import status: Loaded ${fileName}.`);
  setText("export-status", "Ready");
  resetValidationUi("Imported candidate loaded. Basic shape checks passed, but Validate Candidate is still required.");
  updateSummaryFromCandidate();
  renderFilteredDevices();
  updateDirtyState();
  setExportReady(true);
  setFormControlsReady(true);
}

async function importCandidateFile(file) {
  if (!file) return;

  const isJsonFile = /\.json$/i.test(file.name || "") || file.type === "application/json";
  if (!isJsonFile) {
    setText("import-status", `Import status: ${file.name || "Selected file"} is not a JSON file.`);
    setValidationHint("Candidate import failed before loading. Choose a .json or application/json file.", "fail");
    return;
  }

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    setText("import-status", `Import status: ${file.name} is too large. Limit is 1 MB.`);
    setValidationHint("Candidate import failed before loading. Choose a JSON file under 1 MB.", "fail");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (error) {
    setText("import-status", `Import status: ${file.name} is not valid JSON.`);
    setValidationHint("Candidate import failed because the selected file is not valid JSON.", "fail");
    return;
  }

  const shapeErrors = validateImportedCandidateShape(parsed);
  if (shapeErrors.length) {
    setText("import-status", `Import status: ${file.name} failed basic shape checks.`);
    setValidationHint(`Candidate import failed: ${shapeErrors.join(" ")}`, "fail");
    return;
  }

  setCurrentCandidateFromImport(parsed, file.name);
}

function reloadFixture() {
  if (isDirty && !window.confirm("Discard browser-memory edits and reload the project fixture?")) {
    return;
  }

  loadFixture();
}

function handleEditorTextInput(event) {
  if (selectedDeviceIndex === null) return;
  const field = event.target.dataset.editorField;
  updateDeviceField(selectedDeviceIndex, field, event.target.value);

  if (field === "imagePath") {
    syncAssetSelect(byId("editor-imagePath-select"), event.target.value);
    setAssetPreview(byId("editor-imagePath-preview"), event.target.value);
  } else if (field === "helpImagePath") {
    syncAssetSelect(byId("editor-helpImagePath-select"), event.target.value);
    setAssetPreview(byId("editor-helpImagePath-preview"), event.target.value);
  }

  refreshDeviceList();
}

function handleEditorSelectChange(event) {
  if (selectedDeviceIndex === null) return;
  const field = event.target.dataset.editorField;
  const value = event.target.value;
  const input = byId(`editor-${field}`);

  if (input) input.value = value;
  updateDeviceField(selectedDeviceIndex, field, value);

  if (field === "imagePath") {
    setAssetPreview(byId("editor-imagePath-preview"), value);
  } else if (field === "helpImagePath") {
    setAssetPreview(byId("editor-helpImagePath-preview"), value);
  }

  refreshDeviceList();
}

function handleEditorEnabledChange(event) {
  if (selectedDeviceIndex === null) return;
  updateDeviceField(selectedDeviceIndex, "enabled", event.target.checked);
  refreshDeviceList();
}

function setupEditorControls() {
  [
    "editor-displayName",
    "editor-materialId",
    "editor-legacyMaterialIds",
    "editor-imagePath",
    "editor-helpImagePath",
    "editor-warningText"
  ].forEach(id => {
    const control = byId(id);
    if (control) control.addEventListener("input", handleEditorTextInput);
  });

  [
    "editor-imagePath-select",
    "editor-helpImagePath-select",
    "editor-validationProfileId"
  ].forEach(id => {
    const control = byId(id);
    if (control) control.addEventListener("change", handleEditorSelectChange);
  });

  const enabled = byId("editor-enabled");
  if (enabled) enabled.addEventListener("change", handleEditorEnabledChange);
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
  setText("validation-target", "Fixture");
  setResultBadge("validation-status", data.pass ? "pass" : "fail", data.pass ? "PASS" : "FAIL");
  setText("validation-exit-code", data.exitCode === null || data.exitCode === undefined ? "-" : String(data.exitCode));
  setText("validation-input", data.input || "Extension/config/recycle-device-catalog.fixture.json");
  setText("validation-stdout", data.stdout || "(empty)");
  setText("validation-stderr", data.stderr || "(empty)");
  setValidationHint(
    data.pass
      ? "Fixture validation passed. The checked project fixture is valid."
      : "Fixture validation failed. This may indicate a project/config issue.",
    data.pass ? "pass" : "fail"
  );
}

function renderCandidateValidationResult(data, candidateJson) {
  candidateValidationHasRun = true;
  lastCandidateValidationJson = candidateJson;
  setText("validation-target", "Candidate");
  setResultBadge("candidate-validation-status", data.pass ? "pass" : "fail", data.pass ? "PASS" : "FAIL");
  setResultBadge("validation-status", data.pass ? "pass" : "fail", data.pass ? "PASS" : "FAIL");
  setText("validation-exit-code", data.exitCode === null || data.exitCode === undefined ? "-" : String(data.exitCode));
  setText("validation-input", data.input || "temp-candidate.json");
  setText("validation-stdout", data.stdout || "(empty)");
  setText("validation-stderr", data.stderr || "(empty)");
  setValidationHint(
    data.pass
      ? "Candidate validation passed for the current browser-memory candidate."
      : "Candidate validation failed. Check the errors below. If this was only a test edit, use Revert changes.",
    data.pass ? "pass" : "fail"
  );
}

function renderValidationError(error) {
  setText("validation-target", "Fixture");
  setResultBadge("validation-status", "error", "ERROR");
  setText("validation-exit-code", "-");
  setText("validation-stdout", "(empty)");
  setText("validation-stderr", error.message);
  setValidationHint("Fixture validation could not complete. This may indicate a local project/tooling issue.", "fail");
}

function renderCandidateValidationError(error) {
  setText("validation-target", "Candidate");
  setResultBadge("candidate-validation-status", "error", "ERROR");
  setResultBadge("validation-status", "error", "ERROR");
  setText("validation-exit-code", "-");
  setText("validation-input", "temp-candidate.json");
  setText("validation-stdout", "(empty)");
  setText("validation-stderr", error.message);
  setValidationHint("Candidate validation could not complete. Check the errors below. If this was only a test edit, use Revert changes.", "fail");
}

async function validateCandidate() {
  const candidate = candidateForAction();
  if (!candidate) {
    setResultBadge("candidate-validation-status", "error", "No candidate loaded");
    setValidationHint("No browser-memory candidate is loaded yet.", "fail");
    return;
  }
  const candidateJson = JSON.stringify(candidate);

  setCandidateValidationRunning(true);
  setText("validation-target", "Candidate");
  setResultBadge("candidate-validation-status", "running", "Running");
  setResultBadge("validation-status", "running", "Running");
  setValidationHint("Candidate validation is running for the current browser-memory candidate.");
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
    renderCandidateValidationResult(data, candidateJson);
  } catch (error) {
    renderCandidateValidationError(error);
  } finally {
    setCandidateValidationRunning(false);
  }
}

async function validateFixture() {
  setValidationRunning(true);
  setText("validation-target", "Fixture");
  setResultBadge("validation-status", "running", "Running");
  setValidationHint("Fixture validation is running against the fixed project fixture.");
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
  setupEditorControls();
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

const importCandidateInput = byId("import-candidate-input");
if (importCandidateInput) {
  importCandidateInput.addEventListener("change", event => {
    const file = event.target.files && event.target.files[0];
    importCandidateFile(file).finally(() => {
      event.target.value = "";
    });
  });
}

const reloadFixtureButton = byId("reload-fixture-btn");
if (reloadFixtureButton) {
  reloadFixtureButton.addEventListener("click", reloadFixture);
}
