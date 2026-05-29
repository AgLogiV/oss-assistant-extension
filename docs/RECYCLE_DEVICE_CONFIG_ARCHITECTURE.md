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
- 16:9 device card images through explicit `imagePath` metadata;
- selected-device visual state;
- selected-device validation context through `validationProfileId`;
- selected-device help images through `helpImagePath`;
- category material allowlists generated from catalog `materialId` values.

Current selected-device behavior affects validation, help context, SAP/material quick-button ordering, and controlled SAP/material auto-fill. SAP/material quick-button filtering remains category-level: selected devices are prioritized first when their material buttons exist, but they do not restrict the grid to selected devices only. A per-flow material snapshot in `sessionStorage` captures category/device/material/serial/date context at valid recycle Continue time so the SAP/material step does not have to depend only on live shared selected-device state. `getRecycleMaterialFillCandidate(...)` evaluates a controlled fill candidate and returns `{ ok, materialId, reason }`; when the candidate is safe and the OSS `MaterialId` field is empty, runtime fills the material value without calling auto-continue again.

Current recycle device image policy:

- recycle devices should prefer explicit extension-relative `imagePath` values;
- current recycle devices all have explicit `imagePath` values;
- device `imagePath` values must use packaged `images/devices/16x9/...` paths, never absolute local filesystem paths;
- the older runtime fallback image mapping still exists for future/legacy compatibility and must not be removed until a separate runtime cleanup is planned;
- `helpImagePath` is separate from `imagePath` and is used by the serial/help UI, not by the normal device card image policy.

Austrian is now partially device-based. `ADB Modem 2220` and `Huawei HA35-22 HYBRID` are local catalog devices with device cards, help images, device-level validation, and selected-device material fill through the same snapshot/controlled-fill flow. If no Austrian device is selected, the legacy Austrian preset fallback remains active for compatibility. `cam_modules` and `modems` remain special categories outside this migration.

### Already dashboard-driven

The existing dashboard/API currently applies to the Swap Shop/SAP material model list, not the recycle device catalog.

Dashboard-backed data can provide:

- material model `id`;
- material model `name`;
- broad material category;
- optional material button image URL/upload path.

The old Render dashboard polling path is currently disabled in production with `SWAP_MATERIAL_REMOTE_DASHBOARD_ENABLED = false` because deployed dashboard material data can be stale and override the packaged fallback. The extension currently relies on packaged/local fallback material model data for production safety. Re-enable the old Render polling only after its data source and override behavior are reviewed.

This is separate from the recycle catalog architecture described here.

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
  - `wifi_oss_recycle_entry_material_snapshot`
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
- Device `imagePath` must use packaged extension-relative `images/devices/16x9/...` paths.
- `helpImagePath` must use the separate help asset policy, normally `images/recycle-help/...`.
- Neither image field may use an absolute local filesystem path.
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

### Runtime loader readiness gate

The current fixture is a packaged-shape rehearsal, not a runtime source of truth. A runtime packaged JSON loader is not allowed until these gates are explicitly satisfied:

- `node Extension/scripts/validate-recycle-catalog.js` returns `Result: PASS`;
- `node Extension/scripts/export-recycle-config-fixture.js --compare-fixture` returns `Result: PASS`;
- schema, normalize, merge, and fallback strategy are documented;
- invalid or missing JSON has deterministic fallback to the embedded catalog in `Extension/content.js`;
- required `manifest.json` / `web_accessible_resources` exposure is reviewed before any runtime fetch is added;
- manual regression plan covers the category panel, selected-device validation/help/material fill, Austrian, CAM, modems, clipboard autofill, labels, and barcodes;
- dashboard override remains an optional validated overlay, not a replacement for local fallback.

Runtime loader work must still keep these out of JSON/dashboard control: DOM selectors, OSS navigation, CAM flow, arbitrary JavaScript or arbitrary regex validation, clipboard parsers, labels/barcodes, auto-continue logic, and keyboard normalization.

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

## 8. Future Admin / Config Roadmap

Recommended direction is a hybrid path, not an immediate dependency on the current dashboard:

1. **Local configurator UI / local tool**
   - A local editor can make device/category/material/help metadata easier for non-developers to edit.
   - It should generate schema-valid JSON and never write directly into packaged extension runtime files.
   - Its asset selectors/previews should store only extension-relative config paths, such as `images/devices/16x9/...` for `imagePath` and `images/recycle-help/...` for `helpImagePath`.

2. **GitHub or simple static hosting as the first remote MVP**
   - JSON and image assets can be published to GitHub or simple static hosting.
   - Git history gives review, version history, and rollback.
   - Run `node Extension/scripts/check-recycle-config.js` before publishing config changes.
   - This should be implemented as a separate validated config path and must not depend on the old Render material-model polling mechanism.
   - The preferred shape is a separate public config repository, not the full extension repository. Business has confirmed the recycle config/device/image data may be public, but the repo and configurator must never contain secrets, tokens, internal credentials, customer data, or other sensitive information.
   - Suggested repository layout: `config/recycle-device-catalog.json`, `config/recycle-device-catalog.schema.json`, `config/assets-manifest.json`, `images/devices/16x9/`, `images/recycle-help/`, and `configurator/index.html`, `configurator/app.js`, `configurator/styles.css`, with optional GitHub Action validation.
   - A GitHub Pages configurator should be static-only at first: load JSON from a URL or browser file upload, use `assets-manifest.json` instead of the local `/api/assets` endpoint, use static image URLs instead of `/api/asset-preview`, and download candidate JSON for manual PR/upload.
   - Do not add GitHub write access from the browser in the MVP. Keep tokens, OAuth flows, and secrets out of the static configurator. Validation should initially run through local scripts and/or GitHub Actions rather than duplicated browser validation logic.
   - Current dev-only assets manifest exporter: `node Extension/scripts/export-recycle-assets-manifest.js`.
   - The exporter prints JSON to stdout for a future `config/assets-manifest.json`, scans only `Extension/images/devices/16x9/` and `Extension/images/recycle-help/`, outputs only extension-relative `images/...` paths, and does not create files, publish anything, or change runtime behavior.
   - Current dev-only static package exporter: `node Extension/scripts/export-recycle-static-config-package.js --out path/to/output-dir`.
   - By default, the package exporter writes only `config/recycle-device-catalog.json` and `config/assets-manifest.json` to an explicit output directory. It reuses the existing catalog/assets exporters, validates the generated catalog, and refuses unsafe output paths such as runtime/source folders.
   - Optional `--include-images` also copies only package images referenced by the generated `assets-manifest.json` into `images/devices/16x9/` and `images/recycle-help/`. Optional `--include-configurator-ui` copies `configurator/index.html`, `configurator/app.js`, and `configurator/styles.css`; the copied `app.js` is transformed to static mode while source `public/app.js` remains local mode.
   - Practical smoke-tested full package command: `node Extension/scripts/export-recycle-static-config-package.js --out path/to/output-dir --include-images --include-configurator-ui`. Current full output is `2` config files plus `59` images (`41` device images and `18` help images) plus `3` configurator files. It should run without `/api/*` endpoints, show static validation as disabled/instructional, keep exported JSON paths as `images/...`, and still does not create GitHub Pages files, `.nojekyll`, GitHub write/OAuth/tokens, runtime JSON loading, or runtime behavior changes.
   - This package is intended to be copied or uploaded into a future separate config repo, not into extension runtime paths. `Extension/content.js` remains the runtime source of truth for now.
   - Future `oss-assistant-config` repo operations plan:
     - Keep the repo package-shaped, not extension-shaped: `README.md`, `config/recycle-device-catalog.json`, `config/assets-manifest.json`, `images/devices/16x9/`, `images/recycle-help/`, and `configurator/index.html`, `configurator/app.js`, `configurator/styles.css`.
     - Do not include full `Extension/`, `Extension/content.js`, `manifest.json`, the local Node server, temp candidates/outputs/backups/zips, secrets, tokens, customer data, or GitHub OAuth/browser-write code.
     - Expected GitHub Pages paths are `/config/recycle-device-catalog.json`, `/config/assets-manifest.json`, `/images/devices/16x9/...`, `/images/recycle-help/...`, and `/configurator/`.
     - Manual publish flow: generate the full package with `--include-images --include-configurator-ui`, validate the generated catalog, run the candidate review script, smoke test the static package, copy package contents into the config repo root, review the diff, then commit or open a PR.
     - Validation remains local-script based for now; a GitHub Action can later enforce schema/assets/review checks. Browser configurator writes to GitHub, runtime remote loading, and hard remote replacement remain out of scope.
   - Live public static config deployment:
     - Public repo: `https://github.com/oss-assistant/oss-assistant-config`
     - GitHub Pages root: `https://oss-assistant.github.io/oss-assistant-config/`
     - Static configurator: `https://oss-assistant.github.io/oss-assistant-config/configurator/`
     - Static config JSON: `https://oss-assistant.github.io/oss-assistant-config/config/recycle-device-catalog.json`
     - Static assets manifest: `https://oss-assistant.github.io/oss-assistant-config/config/assets-manifest.json`
     - Pages is enabled from the `main` branch root. The root URL showing the repo README is expected. The static configurator loads from GitHub Pages, but the extension runtime still does not load remote config; the optional remote config/runtime overlay remains a future separate task, and the browser configurator does not write to GitHub.
     - The separate private extension repo is `https://github.com/oss-assistant/oss-assistant-extension`; use it for normal full-extension development history. The public `oss-assistant-config` repo now has GitHub Action validation for static package structure and path safety.
   - Static package contract before implementation:
     - `config/recycle-device-catalog.json`
     - `config/assets-manifest.json`
     - `images/devices/16x9/`
     - `images/recycle-help/`
     - `configurator/index.html`
     - `configurator/app.js`
     - `configurator/styles.css`
   - The static configurator must not call `/api/*`. It should load config JSON by relative URL and/or file upload, load assets from `config/assets-manifest.json`, render previews only for manifest-approved images, and keep exported JSON paths as `images/...` values rather than static URLs.
   - Full validation is not available in the browser static MVP. Use `node Extension/scripts/validate-recycle-config-fixture.js --input path/to/candidate.json`, `node Extension/scripts/review-recycle-config-candidate.js --input path/to/candidate.json`, or a future GitHub Action.
   - Do not add browser GitHub writes, OAuth, tokens, or secrets. The first future code step should likely be a dev-only package/export script that writes a preview package only to an explicit output directory, never runtime paths.

3. **Optional validated remote overlay**
   - The extension may later read remote config only as an optional validated overlay.
   - Invalid, missing, or offline remote config must fall back to the embedded/local catalog.
   - Remote config must not hard-replace the local fallback.
   - Keep the rule local-first: packaged fallback first, optional validated remote override second.
   - Remote config loading is a later separate phase. When designed, it must merge safe metadata only, keep local fallback first, ignore invalid/offline remote data, and treat remote omissions as non-deleting; omission must not remove local devices.

4. **Proper hosted admin panel later**
   - A hosted admin panel can add persistence, image upload, validation, revisioning, rollback, and simple roles.
   - It is a long-term option, not an immediate requirement.
   - The current dashboard implementation should not constrain the future recycle config design.

Temporary internal dashboard/server hosting is possible for testing, but it must not become an unclear source of truth. If used, it needs explicit backup, revision, and rollback rules.

Config/admin may manage only safe metadata:

- `deviceId`;
- `categoryId`;
- `displayName`;
- `materialId`;
- `legacyMaterialIds`;
- `imagePath`;
- `helpImagePath`;
- `warningText`;
- `validationProfileId` from predefined profiles;
- `enabled`;
- `sortOrder`.

Config/admin must not control DOM selectors, OSS navigation, CAM flow, arbitrary JavaScript, arbitrary unsafe regex validation, clipboard parsers, labels/barcodes, auto-continue logic, or keyboard normalization.

## 9. Safe Migration Plan

1. **Docs/schema first**
   - Keep this document and related docs current.
   - Decide merge rules before implementation.

2. **Validator/adapter**
   - Add local schema validation helpers.
   - Validate current `RECYCLE_DEVICE_CATALOG_RAW` without changing runtime behavior.
   - Report or log schema problems without breaking operators.
   - Main dev-only readiness command: `node Extension/scripts/check-recycle-config.js`.
   - Current dev-only checker: `node Extension/scripts/validate-recycle-catalog.js`.
   - Current dev-only fixture exporter: `node Extension/scripts/export-recycle-config-fixture.js`.
   - Current dev-only assets manifest exporter for future static/GitHub Pages support: `node Extension/scripts/export-recycle-assets-manifest.js`.
   - Current dev-only static package exporter: `node Extension/scripts/export-recycle-static-config-package.js --out path/to/output-dir` with optional `--dry-run`, `--force`, `--include-images`, and `--include-configurator-ui`.
   - Current dev-only fixture validator: `node Extension/scripts/validate-recycle-config-fixture.js`.
   - Current dev-only loader adapter prototype: `node Extension/scripts/load-recycle-config-fixture.js`.
   - The exporter reads `Extension/content.js` as text and writes JSON to stdout with `schemaVersion`, `revision`, `devices`, `categoryHelp`, `validationProfiles`, and `generatedMaterialFilters`.
   - It checks expected top-level keys, `devices.length` against catalog count, Austrian material filter `1200017460, 1200017462`, and GPON material order `1200014928, 118560, 118563, 118564, 122933, 122944`.
   - It does not create runtime config files and is not loaded by the extension.
   - Current dev-only generated/reference fixture: `Extension/config/recycle-device-catalog.fixture.json`.
   - Update command: `node Extension/scripts/export-recycle-config-fixture.js > Extension/config/recycle-device-catalog.fixture.json`.
   - Compare command: `node Extension/scripts/export-recycle-config-fixture.js --compare-fixture`.
   - A compare mismatch is a development signal that recycle catalog/config metadata changed and the fixture should be reviewed and updated intentionally.
   - Mismatch diagnostics report the first semantic path, for example `Mismatch at generatedMaterialFilters.austrian[1]`, and print expected/actual values.
   - Source of truth remains `Extension/content.js`; the runtime does not load the fixture and `manifest.json` is not involved.
   - Default fixture validation command: `node Extension/scripts/validate-recycle-config-fixture.js`.
   - The default validator command still validates `Extension/config/recycle-device-catalog.fixture.json`.
   - Candidate config validation command for future local configurator exports: `node Extension/scripts/validate-recycle-config-fixture.js --input path/to/candidate.json`.
   - Candidate mode validates schema, shape, data, assets, validation profile references, and generated material filters, but it does not require exact parity with current `Extension/content.js`.
   - Candidate validation is dev-only readiness for future local configurator exports. The extension runtime still does not load JSON config.
   - Candidate review command before runtime metadata merge: `node Extension/scripts/review-recycle-config-candidate.js --input path/to/candidate.json`.
   - Candidate review is dev-only/no-write. It compares the candidate to the current runtime-shaped export by stable `deviceId` and reports added, edited, missing, reordered, material-filter, unknown-field, and manual-review-only changes.
   - Review does not merge, write `Extension/content.js`, regenerate the fixture, or add runtime JSON loading. If the review is acceptable, make a manual/Codex-assisted patch to `RECYCLE_DEVICE_CATALOG_RAW`, regenerate the fixture from `Extension/content.js`, run `node Extension/scripts/check-recycle-config.js`, review the diff, and commit.
   - `validate-recycle-config-fixture.js` validates fixture or candidate schema/data. `load-recycle-config-fixture.js` proves fixture JSON can be loaded and normalized into a future in-memory adapter shape with `devicesById`, `devicesByCategory`, `categoryHelp`, `validationProfiles`, and `materialFilters`.

3. **Packaged JSON read-only experiment**
   - Add a packaged JSON file only after schema is stable.
   - Add any required `manifest.json` exposure intentionally.
   - Keep embedded fallback until parity is proven.
   - Do not add runtime loading until the runtime loader readiness gate passes.

4. **Dashboard override**
   - Add a new remote endpoint for recycle config.
   - Validate and merge in memory.
   - Keep dashboard optional and non-blocking.

5. **Cache/rollback**
   - Add `chrome.storage.local` cache only after deciding on `storage` permission.
   - Cache only last-known-good validated config.
   - Add revision visibility and rollback rules.

## 10. Test Gates

Before any config architecture implementation is considered safe:

- catalog parity: normalized devices match current behavior;
- dev-only config readiness chain: `node Extension/scripts/check-recycle-config.js` passes catalog sanity, fixture compare, fixture validation, and fixture loader adapter checks;
- dev-only fixture export parity: `node Extension/scripts/export-recycle-config-fixture.js --compare-fixture` matches `Extension/config/recycle-device-catalog.fixture.json`; mismatch means catalog/config metadata changed and needs intentional review before packaged JSON work starts, with first semantic path and expected/actual values printed;
- material filter order remains unchanged for mapped categories;
- selected-device validation fallback remains correct;
- selected-device OR validation still works;
- no selected devices keeps category-level validation;
- help image fallback works for selected devices and category-level help;
- dashboard offline/invalid config keeps local fallback working;
- SAP/material quick buttons still render and fill values;
- SAP/material selected-device ordering uses a valid per-flow material snapshot when available and falls back safely when it is missing or stale;
- SAP/material controlled auto-fill requires a valid per-flow snapshot, an empty `MaterialId`, exactly one safe normalized material candidate, and a material model match;
- SAP/material controlled auto-fill does not overwrite prefilled OSS values and does not call auto-continue after extension fill;
- Austrian selected-device validation covers ADB `PI` + exactly 19 alphanumeric characters and Huawei exactly 16 alphanumeric characters;
- Austrian no-selected-device legacy preset fallback still works;
- material auto-continue debug toggle still works;
- CAM Modules flow is unchanged;
- Austrian label generation still works;
- clipboard SSID/password autofill still works;
- label/barcode generation still works;
- dev-only catalog validator returns `Result: PASS`;
- `Extension/content.js` syntax parse passes;
- `git diff` shows no unrelated dashboard, manifest, image, or storage-key changes unless explicitly planned.

The current validator is a local development helper. It reads `Extension/content.js` as text, extracts `RECYCLE_DEVICE_CATALOG_RAW`, `RECYCLE_SERIAL_HELP_BY_CATEGORY`, and predefined validation profile IDs, then checks catalog sanity, asset paths, material filter parity, and GPON order. It is not loaded by the extension runtime and must not become a runtime dependency.

## 11. What Not To Change During Field Testing

While colleagues are testing the current extension, avoid:

- moving recycle config to JSON runtime loading;
- adding dashboard recycle config;
- changing SAP/material filtering to selected-only behavior or broadening controlled auto-fill beyond the safe snapshot candidate policy;
- retiring Austrian no-selected-device legacy fallback without a separate plan;
- changing CAM flow;
- changing validation profiles;
- adding storage keys;
- changing `manifest.json`;
- broad `Extension/content.js` refactors;
- moving DOM selectors or OSS navigation into config;
- changing clipboard, keyboard normalization, labels, or barcode generation.
