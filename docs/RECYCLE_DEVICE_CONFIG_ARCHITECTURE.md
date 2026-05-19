# Recycle Device Config Architecture

**Status:** Architecture/schema plan only  
**Scope:** Future local config and optional dashboard override model for recycle device/category/SAP/help/validation metadata  
**Runtime impact:** None. This document does not describe current runtime implementation unless explicitly marked as current state.

## 1. Current State

### Hardcoded in `Extension/content.js`

The current recycle flow still keeps most business metadata in local JavaScript constants:

- `RECYCLE_DEVICE_CATALOG_RAW`
  - `deviceId`
  - `categoryId`
  - `displayName`
  - `materialId`
  - `legacyMaterialIds`
  - `imagePath`
  - `helpImagePath`
  - `warningText`
  - `validationProfileId`
  - `enabled`
- category definitions used by `injectRecycleEntryCategoryPanel`
- `RECYCLE_SERIAL_HELP_BY_CATEGORY` for category-level help images
- `RECYCLE_SERIAL_VALIDATION_PROFILES` for predefined local validation functions
- `SWAP_MATERIAL_MODELS_DEFAULT` for built-in SAP/material quick-button models
- risky runtime mechanisms:
  - OSS DOM selectors
  - OSS navigation behavior
  - CAM Modules flow
  - material auto-continue behavior
  - clipboard parsers
  - keyboard normalization
  - label/barcode generation

### Already catalog-driven

The normalized local recycle catalog already drives:

- recycle device cards after category selection;
- 16:9 device card images where available;
- selected-device visual state;
- selected-device validation context through `validationProfileId`;
- selected-device help images through `helpImagePath`;
- category material allowlists generated from catalog `materialId` values.

Current selected-device behavior affects validation and help context. SAP/material quick-button filtering still remains category-level.

### Already dashboard-driven

The existing dashboard/API currently applies to the Swap Shop/SAP material model list, not the recycle device catalog.

Dashboard-backed data can provide:

- material model `id`;
- material model `name`;
- broad material category;
- optional material button image URL/upload path.

The dashboard can replace the in-memory material model list after a successful fetch. This is separate from the recycle catalog architecture described here.

### State, not config

These values are runtime state and should not be treated as device/catalog config:

- `localStorage`
  - `wifi_oss_recycle_entry_category`
  - `wifi_oss_recycle_entry_category_date`
  - `wifi_oss_recycle_entry_selected_devices`
  - clipboard autofill state such as last clipboard text and auto mode
- `sessionStorage`
  - `wifi_oss_recycle_entry_last_serial`
  - `wifi_oss_recycle_entry_pending_material`
  - `wifi_oss_cam_modules_missing_material_operation_id`
  - `wifi_oss_debug_material_auto_continue_enabled`
  - serial keyboard debug keys

State keys are about the current user/session/workday. They are not a source of truth for categories, devices, SAP/material IDs, help images, or validation profiles.

## 2. Source of Truth Policy

### Short term

`Extension/content.js` remains the source of truth for recycle metadata.

This is the safest model while colleagues are testing the extension in real OSS. Data changes require a code patch and commit, but behavior is synchronous, reviewable, and easy to roll back.

### Medium term

A packaged local JSON file may become the read-only local config source after the schema is stable.

Possible file:

```text
Extension/config/recycle-device-catalog.json
```

The extension should load this packaged config, validate it, normalize it, and build the same in-memory catalog shape that current runtime code expects.

### Long term

The dashboard may provide a validated remote override or extension layer.

The extension must remain local-first:

```text
packaged local config -> always usable fallback
remote dashboard config -> optional validated override/extension
```

Dashboard data must not be required for recycle flow runtime.

### Packaged files are not writable runtime storage

Dashboard or remote config must not write directly back into packaged extension files.

A Chrome extension package should be treated as immutable at runtime. The safer model is:

- local packaged config as fallback;
- optional remote config validated in memory;
- optional last-known-good cache later, if explicitly designed.

## 3. Proposed Schema

```json
{
  "schemaVersion": 1,
  "revision": "2026-05-19.1",
  "categories": [
    {
      "categoryId": "gpon",
      "label": "GPON",
      "imagePath": "images/categories/16x9/GPON.webp",
      "enabled": true,
      "sortOrder": 70
    }
  ],
  "devices": [
    {
      "deviceId": "zte_zxhn_f600",
      "categoryId": "gpon",
      "displayName": "ZTE ZXHN F600",
      "materialId": "118564",
      "legacyMaterialIds": [],
      "imagePath": "images/devices/16x9/ZTE_ZXHN_F600.webp",
      "helpImagePath": "images/recycle-help/ZTE ZXHN F600.webp",
      "warningText": "",
      "validationProfileId": "gpon_16_alnum",
      "enabled": true,
      "sortOrder": 40
    }
  ],
  "categoryHelp": [
    {
      "categoryId": "modems",
      "title": "Modem Technivolor v1",
      "imagePath": "images/recycle-help/Modem Technivolor v1.webp",
      "alt": "Correct barcode for Modem Technivolor v1",
      "sortOrder": 10
    }
  ],
  "validationProfiles": [
    {
      "validationProfileId": "gpon_16_alnum",
      "type": "predefined",
      "label": "16 alphanumeric characters"
    }
  ]
}
```

### Safe field rules

- `schemaVersion` must be a supported integer.
- `revision` must be a stable string suitable for troubleshooting and rollback.
- `categoryId` must be stable and must not be a display label.
- `deviceId` must be stable and must not be a SAP/material number.
- `displayName` is UI text and may change more freely than `deviceId`.
- `materialId` must be the canonical SAP/material ID.
- `legacyMaterialIds` must be an array of string aliases/old IDs.
- `imagePath` and `helpImagePath` must use allowed asset path prefixes or validated remote URLs.
- `warningText` must be plain text only.
- `validationProfileId` must reference a predefined local profile.
- `enabled` defaults to `true` when omitted.
- `sortOrder` controls UI ordering but must not affect identity.

## 4. Allowed Dashboard Override Fields

Future dashboard config may override or extend only safe metadata fields:

- `displayName`
- `imagePath`
- `helpImagePath`
- `warningText`
- `enabled`
- `sortOrder`
- `materialId`
- `legacyMaterialIds`
- `validationProfileId`

Additional restrictions:

- `materialId` and `legacyMaterialIds` must pass schema validation and material normalization checks.
- `validationProfileId` must be one of the predefined local profiles implemented in the extension.
- Dashboard omission must not remove local devices.
- Dashboard-added devices must pass the same schema validation as packaged local devices.
- Duplicate `deviceId` or unsafe duplicate `materialId` values must be rejected or flagged for review.
- Remote config should not hard-replace the local catalog.

## 5. Blocked Fields / Blocked Behavior

Dashboard/local config must not control these runtime mechanisms:

- DOM selectors;
- OSS navigation;
- CAM Modules flow;
- material auto-continue behavior;
- clipboard parsers;
- keyboard normalization;
- label/barcode generation;
- arbitrary JavaScript;
- arbitrary validation logic;
- arbitrary dashboard-defined regex validation.

Validation should remain predefined and local. A future dashboard may choose from approved `validationProfileId` values, but it must not ship executable logic.

Custom regex should remain a future/root-only idea, not a normal admin feature. If it is ever considered, it needs strict constraints: reviewed profiles, max length, no arbitrary flags, no bypass of common guards, no dashboard JavaScript, and explicit rollback.

## 6. Packaged JSON Option

### Possible location

```text
Extension/config/recycle-device-catalog.json
```

### Manifest impact

A content script can fetch a packaged extension asset through `chrome.runtime.getURL(...)`, but the JSON file should be deliberately exposed through `web_accessible_resources` if it is fetched from the content-script/page context.

That means this option likely requires a reviewed `Extension/manifest.json` change such as:

```json
"config/*.json"
```

Do not add this casually while runtime behavior is being tested.

### Load unpacked

With Chrome `Load unpacked`, packaged JSON can work as an extension asset if the path and manifest exposure are correct.

### Packaged/installed extension

In a packaged/installed extension, the JSON remains read-only as part of the extension package. Updating it requires shipping a new extension build/version.

### Async loading risks

JSON loading introduces asynchronous startup behavior:

- recycle panel could render before config is ready;
- fetch may fail if manifest exposure is wrong;
- malformed JSON could break catalog initialization;
- slow loading may race with OSS DOM injection;
- fallback must be deterministic.

Safe fallback requirement:

- if JSON loading fails, use the embedded local JS fallback or keep the previous known safe packaged config model;
- never leave the recycle UI in a half-configured state;
- do not render selected-device behavior until the normalized catalog is available.

## 7. Dashboard Override + Cache Option

### Remote override

The dashboard may later return a config payload with `schemaVersion`, `revision`, `categories`, `devices`, `categoryHelp`, and profile references.

The extension should:

1. fetch remote config;
2. validate schema;
3. validate IDs, material IDs, paths, profile IDs, and duplicates;
4. merge with local fallback in memory;
5. ignore invalid remote config and continue with local fallback.

### No hard replace

Remote config must not simply replace the local catalog.

Safer model:

- local devices always exist unless a root-level policy explicitly disables them;
- remote may override safe display/help/image/warning/sort fields;
- remote may add schema-valid devices;
- remote omission does not delete local devices.

### Optional cache

Later, the extension may cache the last-known-good remote config.

Preferred storage for extension-owned cache is `chrome.storage.local`, but this likely requires adding the `storage` permission to `manifest.json`.

Avoid using page `localStorage` for long-lived config cache. It is origin-scoped to OSS page context and already used for workday state; mixing config cache there makes debugging and isolation worse.

### Offline behavior

If the dashboard is offline:

- use local fallback;
- optionally use last-known-good cache only if it validates and its schema version is compatible;
- log a warning for diagnostics;
- never block recycle workflow.

### Revision and rollback

Config payloads should include:

- `schemaVersion`;
- `revision`;
- optional `publishedAt`;
- optional `minExtensionVersion`;
- optional `notes`.

Rollback should be possible by serving a previous valid `revision` from the dashboard or clearing cached remote config. The extension should record which revision is active for troubleshooting.

## 8. Safe Migration Plan

1. **Docs/schema first**
   - Keep this document and related docs current.
   - Decide merge rules before implementation.

2. **Validator/adapter**
   - Add local schema validation helpers.
   - Validate current `RECYCLE_DEVICE_CATALOG_RAW` without changing runtime behavior.
   - Report or log schema problems without breaking operators.
   - Current dev-only checker: `node Extension/scripts/validate-recycle-catalog.js`.

3. **Packaged JSON read-only experiment**
   - Add a packaged JSON file only after schema is stable.
   - Add any required `manifest.json` exposure intentionally.
   - Keep embedded fallback until parity is proven.

4. **Dashboard override**
   - Add a new remote endpoint for recycle config.
   - Validate and merge in memory.
   - Keep dashboard optional and non-blocking.

5. **Cache/rollback**
   - Add `chrome.storage.local` cache only after deciding on `storage` permission.
   - Cache only last-known-good validated config.
   - Add revision visibility and rollback rules.

## 9. Test Gates

Before any config architecture implementation is considered safe:

- catalog parity: normalized devices match current behavior;
- material filter order remains unchanged for mapped categories;
- selected-device validation fallback remains correct;
- selected-device OR validation still works;
- no selected devices keeps category-level validation;
- help image fallback works for selected devices and category-level help;
- dashboard offline/invalid config keeps local fallback working;
- SAP/material quick buttons still render and fill values;
- material auto-continue debug toggle still works;
- CAM Modules flow is unchanged;
- Austrian material behavior and Austrian label generation still work;
- clipboard SSID/password autofill still works;
- label/barcode generation still works;
- dev-only catalog validator returns `Result: PASS`;
- `Extension/content.js` syntax parse passes;
- `git diff` shows no unrelated dashboard, manifest, image, or storage-key changes unless explicitly planned.

The current validator is a local development helper. It reads `Extension/content.js` as text, extracts `RECYCLE_DEVICE_CATALOG_RAW`, `RECYCLE_SERIAL_HELP_BY_CATEGORY`, and predefined validation profile IDs, then checks catalog sanity, asset paths, material filter parity, and GPON order. It is not loaded by the extension runtime and must not become a runtime dependency.

## 10. What Not To Change During Field Testing

While colleagues are testing the current extension, avoid:

- moving recycle config to JSON runtime loading;
- adding dashboard recycle config;
- changing SAP/material filtering by selected devices;
- changing Austrian behavior;
- changing CAM flow;
- changing validation profiles;
- adding storage keys;
- changing `manifest.json`;
- broad `Extension/content.js` refactors;
- moving DOM selectors or OSS navigation into config;
- changing clipboard, keyboard normalization, labels, or barcode generation.
