"use strict";

const endpoint = "/api/fixture";

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
  setText("fixture-status", data.ok ? "Loaded" : "Failed");
  setText("fixture-source", data.source || "Extension/config/recycle-device-catalog.fixture.json");
  setText("schema-version", String(data.schemaVersion ?? "-"));
  setText("revision", data.revision || "-");
  setText("device-count", String(data.deviceCount ?? "-"));
  setText("enabled-count", `${data.enabledDeviceCount ?? "-"} / ${data.disabledDeviceCount ?? "-"}`);
  setText("category-count", String(data.categoryCount ?? "-"));
  renderCategories(data.categories);
  renderDevices(data.devices);
}

function renderError(error) {
  setText("fixture-status", "Failed");
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
