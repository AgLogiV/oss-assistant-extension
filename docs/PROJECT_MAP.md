# OSS Assistant Project Map

## Overview

`OSS Assistant` is an internal Chrome Manifest V3 extension for A1 OSS portal workflows. It is loaded with Chrome `Load unpacked` from the `Extension/` directory and injects `content.js` into internal OSS pages. The current development focus is the recycle-device entry workflow: choosing a device category for the workday, validating the serial number, and guiding the next SAP/material step with quick-fill material buttons.

The project also contains older/secondary workflows for clipboard-based Wi-Fi autofill, label/barcode printing, in-page extension reload, and the SharePoint OSSRecycleSchedule date/time widget. They are not the current focus, but they are active runtime behavior and should be protected from regressions.

For future recycle redesign/device catalog work, read `docs/RECYCLE_DEVICE_CATALOG_CONCEPT_EN.md` before planning changes. It is a concept/roadmap document and must not be treated as current implemented behavior.

For future device catalog architecture, validation profiles, multi-select, SAP/material mapping, help menu, or dashboard config layer work, also read `docs/RECYCLE_DEVICE_CATALOG_ARCHITECTURE_PLAN.md`. It is the current bridge between the concept document and future implementation tasks.

For future work on moving hardcoded recycle metadata out of `content.js`, read `docs/RECYCLE_DEVICE_CONFIG_ARCHITECTURE.md`. It defines the local config, packaged JSON, dashboard override, cache, and blocked-runtime-behavior rules.

For the colleague-provided simple external recycle catalog runtime adapter, read `docs/EXTERNAL_RECYCLE_CATALOG_RUNTIME.md`. It documents `external_simple_v1`, the approved raw GitHub default source, synthesized internal contract fields, generated `remoteMaterialModels`, approved HTTPS image handling, 6-hour normal refresh, manual force refresh, and LKG/cache expectations.

When adding new local recycle devices to the catalog, read `docs/RECYCLE_DEVICE_ADDING_GUIDE.md` first. It documents required fields, optional contract fields, naming rules, image rules, and test gates for safe catalog additions.

For device-level validation profile work, read `docs/RECYCLE_DEVICE_VALIDATION_RULES.md`. It is a human-authored input file for predefined local validation profiles; part of it is now implemented only when concrete recycle devices are selected.

## GitHub Repositories

- Private extension repo: `https://github.com/oss-assistant/oss-assistant-extension`. This is the full private extension project for local development history, backup, progress tracking, and normal extension commits. The main local branch is `main` and tracks `origin/main`; normal workflow is local patch, checks/tests, review, commit, then `git push origin main`.
- Public config repo: `https://github.com/oss-assistant/oss-assistant-config`. This is the public static config package with config JSON, packaged images, the static configurator, GitHub Pages, and static package structure/path-safety validation through GitHub Actions. Normal static config workflow is generate the static package, validate/review it, publish it to `oss-assistant-config`, let the Action validate it, then serve through Pages.
- Minimum Candidate JSON acceptance workflow: exported candidate files stay outside both repos; private scripts `validate-recycle-config-fixture.js --input` and `review-recycle-config-candidate.js --input` validate/review them; accepted candidates replace only `oss-assistant-config/config/recycle-device-catalog.json`; public repo checks are `.github/validate-static-package.js`, `git diff --stat`, `git diff --check`, and `git diff -- config/recycle-device-catalog.json`; commit/push only that JSON. `staging/recycle-device-catalog.test.json` stays the stable smoke/regression fixture, `staging/recycle-device-catalog.demo.json` stays demo-only, and `REVIEW_REQUIRED` for `remoteMaterialModels` requires human business approval before production promotion. `prepare-recycle-config-candidate-publish.js --input <candidate.json> --config-repo <path/to/oss-assistant-config>` automates the no-commit/no-push preparation, stops on `REVIEW_REQUIRED` unless `--accept-review-required` is passed after human review, and does not copy images, `assets-manifest.json`, configurator UI, or runtime files. New image references must become a separate asset publish task.
- Live GitHub Pages URLs: root `https://oss-assistant.github.io/oss-assistant-config/` and static configurator `https://oss-assistant.github.io/oss-assistant-config/configurator/`.
- The browser configurator still does not write to GitHub. The runtime extension can fetch/validate/cache remote recycle config in `background.js`, then resolve a safe effective remote plan in `content.js` without mutating the packaged local catalog. The recycle panel has a collapsed `Remote config debug` tray for `Source`, `Auto-refresh`, `Status`, `Refresh remote`, `Preview diff`, `Preview plan`, `Apply visual`, `Apply eligible`, `Enable material`, and `Clear`. On branch `codex/external-recycle-catalog-runtime`, the approved raw external source is the default/non-debug source for newly added recycle devices; debug source override still has priority for allowlisted GitHub Pages staging/demo JSON. `Preview plan` is compact/capped, while apply paths use `recycleConfig.getResolvedCatalogApplyPlan` projected entries plus content-side revalidation. `remoteAdditionsAuto` (`35c2031`) can automatically show eligible remote cards from a compatible explicit contract, `remoteMaterialAuto` (`c4852bf`) can automatically expose SAP/material for those auto-accepted cards, and `remoteMaterialModelsAuto` (`86d7925`, fixed by `9e27760`) can accept new remote-defined SAP/material IDs only through strictly validated `remoteMaterialModels`. Visual demo support now includes packaged and public-mirrored Austrian demo images (`67276c4`, `31a58ca`): `staging/recycle-device-catalog.demo.json` smoke showed `auto remote applied 7` / `auto material 7`, six `Австрийски` custom-image demo cards, and the existing demo router. Manual `Apply eligible` / `Enable material` remain diagnostic/debug flows. Remote `generatedMaterialFilters` is not runtime authority; effective material behavior is derived from packaged local filters plus strictly gated remote material overlays without mutating `SWAP_MATERIAL_RECYCLE_FILTERS`.
- External simple catalog support is checkpointed on branch `codex/external-recycle-catalog-runtime` (`464b564 Add external recycle catalog runtime adapter`, `d168f73 Use external recycle catalog as default source`). The approved raw GitHub source `https://raw.githubusercontent.com/AgLogiV/oss-assistant-extension/main/config/recycle-device-catalog.fixture.json` is now the default/non-debug remote source, loads as source-gated `external_simple_v1`, normalizes internally, and exercises the same auto-card/auto-material path. Smoke showed no `Use debug source`, `source external`, `normal refresh 6h`, `contract v1 ok`, `auto remote applied 2`, `auto material 2`, external images rendered, `BOJIDAT NETBOX / 888888`, `BOJKATA RUTERA BRAT / 9191919191`, SAP fill for `888888`, repeated force refresh stability, page refresh/navigation stability, and selected remote devices persisted after refresh. Same-source LKG protects the flow if the external source is stale/unavailable; first fetch without valid LKG falls back local-only if the source is invalid. See `docs/EXTERNAL_RECYCLE_CATALOG_RUNTIME.md` before changing this source model.

## Project Structure

- `Extension/manifest.json` - Chrome MV3 manifest. Defines permissions, internal OSS matches, SharePoint OSSRecycleSchedule match, background service worker, content script, recycle-theme CSS on selected OSS wflow paths, and web-accessible image assets.
- `Extension/background.js` - MV3 service worker. Handles toolbar-click injection, proxies dashboard fetches/image downloads for `content.js`, optional remote recycle config fetch/cache, Dailywork schedule fetch/cache, and `extension.reload` (stores tab id, reloads extension, then reloads the stored tab on startup).
- `Extension/content.js` - main extension runtime. It contains clipboard parsing/autofill, button injection, label/barcode printing, device-function UI, SAP/material quick buttons, dashboard polling, and recycle entry validation. It remains local-first for recycle config and has a CSP-safe debug bridge for manual remote refresh/status/clear plus manual visual-only overlay apply.
- `Extension/bbs-assistant/` - integrated BBS/RCBill client-search helper. Its content scripts mount the BBS Assistant panel and bridge the after-recycle `Отвори в договор` action to the BBS client search and matching device page.
- `Extension/images/` - extension icons, label templates, and image assets.
- `Extension/images/devices/` - packaged device images used by SAP/material quick buttons.
- `Extension/images/categories/` - category card images used by the recycle entry category panel.
- `Extension/dashboard/` - Express dashboard/API for managing material models, categories, and uploaded/remote images.
- `Extension/dashboard/data/models.json` - local dashboard data store for material models.
- `Extension/scripts/` - dev-only helper scripts. `validate-recycle-catalog.js` validates the local recycle catalog and help image mappings without loading into extension runtime. `export-recycle-config-fixture.js` exports the current recycle config fixture JSON to stdout for future packaged-config readiness checks. `export-recycle-assets-manifest.js` prints a no-write future `config/assets-manifest.json` candidate to stdout from packaged recycle image folders. `export-recycle-static-config-package.js --out path/to/output-dir` writes a future static config package preview with `config/recycle-device-catalog.json` and `config/assets-manifest.json` by default; optional `--include-images` copies manifest-referenced recycle images, and optional `--include-configurator-ui` copies a static-mode configurator UI into the output package. `validate-recycle-config-fixture.js`, `load-recycle-config-fixture.js`, and `check-recycle-config.js` complete the dev-only recycle config readiness chain.
- `Extension/scripts/validate-recycle-config-fixture.js --input path/to/candidate.json` - dev-only candidate JSON validator for future local configurator exports. It validates schema/shape/data without requiring exact parity with current `Extension/content.js`; optional `runtimeContract` is accepted and validated, but not required. The extension runtime still does not load JSON config.
- `Extension/scripts/review-recycle-config-candidate.js --input path/to/candidate.json` - dev-only no-write candidate review helper. It compares exported candidate JSON to the current runtime-shaped export by stable `deviceId`, reports added/edited/missing/reordered devices, material filter changes, unknown fields, optional `runtimeContract` review signals, and manual-review-only sections, but does not merge, write `content.js`, regenerate the fixture, or add runtime JSON loading.
- `Extension/scripts/prepare-recycle-config-candidate-publish.js --input path/to/candidate.json --config-repo path/to/oss-assistant-config` - dev-only no-commit/no-push helper for the public Candidate JSON publish flow. It requires the candidate outside both repos, validates/reviews it, copies only to `config/recycle-device-catalog.json` in the config repo, runs the public static package validator and diff checks, and stops on `REVIEW_REQUIRED` unless `--accept-review-required` is explicitly passed after human review.
- `Extension/tools/recycle-configurator/` - dev-only local recycle configurator. Start with `start-configurator.cmd` or `node Extension/tools/recycle-configurator/server.js`; it loads the fixture, supports search/category filtering, compact device selection, side-editor browser-memory edits, browser-memory-only Add Device drafts, asset selectors/previews, candidate validation, candidate JSON export, and revert. Add Device appends only to `currentCandidate.devices`, excludes `cam_modules`/`modems` as add targets, uses predefined local `validationProfileId` choices only, and must not define arbitrary validation logic, regex, or JavaScript. The tool has no server-side save/write endpoint and is not used by extension runtime.
- `.gitignore` - ignores archives, dependencies, `.env` files, and OS files.

Old `.zip` backup/export files are not part of the extension runtime. Ignore them unless a future task explicitly asks to inspect an archive.

## Manifest and Domains

`Extension/manifest.json` declares:

- `manifest_version`: `3`
- `permissions`: `clipboardRead`, `scripting`, `storage`
- content scripts:
  - `recycle-theme.css` at `document_start` on selected OSS recycle/wflow paths (`sap-warehouse-recycle`, `device-recycle`, `device-history`, `recycle-state`, `after-recycle-state`) for production/test OSS hosts
  - `content.js` at `document_idle` on all OSS paths for each production/test host
  - `content.js` at `document_idle` on SharePoint OSSRecycleSchedule list pages
  - integrated BBS Assistant scripts at `document_idle` in all frames on `oss.a1.bg/rcbill/*`, `oss.a1.bg/RCBill/*`, and `oss.a1.bg/bbs2/*`
- background service worker: `background.js`
- OSS matches/host permissions:
  - `https://oss.a1.bg/*`
  - `https://oss.mobiltel.bg/*`
  - `https://srvvm-webtst-0.mobiltel.bg/*`
- dashboard host permission:
  - `https://oss-assistant.onrender.com/*`
- remote config / Dailywork raw sources (host permissions):
  - `https://oss-assistant.github.io/*`
  - approved external recycle catalog and Dailywork JSON URLs as listed in `manifest.json`
- SharePoint content script match (no extra host permission required for the list URL pattern):
  - `https://a1g.sharepoint.com/sites/o365RCR/Lists/OSSRecycleSchedule/*`
- web-accessible resources:
  - `images/*.svg`
  - `images/*.png`
  - `images/devices/*.webp`
  - `images/categories/*.webp`

Any new packaged images must be under these existing paths or `manifest.json` must be intentionally updated.

## Runtime Entry Points

### `background.js`

The background service worker:

- On extension action click, injects `content.js` into the current tab via `chrome.scripting.executeScript`.
- Handles messages from `content.js`:
  - `swapMaterial.fetchModels` fetches dashboard JSON.
  - `swapMaterial.fetchImageDataUrl` fetches remote images and returns data URLs.
  - Dailywork schedule fetch/cache messages (`dailywork.fetchSchedule`, etc.).
  - Remote recycle config fetch/cache messages used by the debug bridge.
  - `extension.reload` stores the sender tab id in `chrome.storage.local` (`wifi_oss_extension_reload_tab_id_v1`), responds, then calls `chrome.runtime.reload()`.
- On service worker startup, `maybeReloadTabAfterExtensionReload()` consumes the stored tab id and calls `chrome.tabs.reload(tabId)` so the operator returns to the same OSS page after an in-page Reload Extension action.

This bridge avoids mixed-content/CORS issues when OSS pages are HTTPS and dashboard resources are external.

### `content.js`

`content.js` is wrapped in an IIFE and guarded by `window.__wifiOssAssistantInjected` to avoid duplicate injection.

On SharePoint OSSRecycleSchedule pages it starts only the SharePoint date/time widget and returns early.

On OSS pages it starts all active behaviors:

- `loadLastClipboardText()`
- `injectButton()` (includes `Reload Extension`)
- `startLabelsObservers()`
- `startSwapMaterialObserver()`
- `startSwapMaterialDashboardPolling()`
- `startDeviceFunctionsObserver()`
- `startRecycleEntryObserver()`
- plus recycle-state helpers, CAM hint observer, Conax dialog observer, etc.

Because this file is monolithic and powers multiple workflows, changes should be small and targeted.

## Functional Map

### Clipboard SSID/Password Autofill

Main functions/values:

- `AUTO_MODE_KEY`: `wifi_oss_auto_mode_enabled`
- `LAST_CLIPBOARD_KEY`: `wifi_oss_last_clipboard_text`
- `deviceConfig` — model keyword detection with default ports and 5G flag
- `detectDeviceModel`
- model-specific parsers: `parseForH3601P`, `parseForMF296R`, `parseForMF283U`, `parseForMF293N`, `parseForEX220`, `parseForG5B`
- `genericParse`, `normalizeA1Base`, `normalizeZeros`
- `processText`, `fillOssForm`
- `injectButton`, `setAutoMode`, `autoLoopTick`, `createReloadExtensionButton`

Supported models in `deviceConfig`:

| Model keyword | Ports | 5G | Parser branch | Notes |
|---|---|---|---|---|
| `MF283U` | 4 | no | `parseForMF283U` | WLAN NAME (SSID) + (PASSWORD) |
| `MF293N` | 1 | no | `parseForMF293N` | WLAN NAME (SSID) |
| `MF296R` | 4 | yes | `parseForMF296R` + `_5G` SSID2 | WiFi SSID1 + generic password |
| `MC888A` | 2 | no | generic | |
| `MC801A` | 2 | yes | WLAN SSID1/SSID2 | adds `_5G` when needed |
| `G5B`, `G5B1`, `G5TS` | 2 | no | `parseForG5B` | Wi-Fi Name |
| `EX220`, `NX220` | 4 | yes | `parseForEX220` | `SSID:` blocks; password `Wireless Password` or `Wireless Password/PIN` |
| `HX520` | 2 | yes | `parseForEX220` + `_5G` fallback | same TP-Link label shape as EX220; label password is usually `Wireless Password:` |
| `Deco M4` | 2 | no | generic | |
| `ZXHN H3601P`, `H3601P` | 3 | yes | `parseForH3601P` | WLAN SSID(2.4G) + WLAN Security; SSID2 gets `_5G` |

After model-specific parsing, any device with `has5g: true` that yielded `ssid1` but no `ssid2` gets `ssid2 = ssid1 + "_5G"` (unless SSID1 already ends with `_5G`).

Password patterns:

- `parseForEX220`: `/Wireless\s+Password(?:\/PIN)?\s*[:\-]?\s*([^\s]+)/i`
- `genericParse`: tries `Wireless Password` / `Wireless Password/PIN`, `WiFi Key`, `KEY`, then `PASSWORD`

Behavior:

- Adds `ПОПЪЛНИ`, `АВТОМАТИЧНО`, `RESET`, and `Reload Extension` near existing OSS `Запази`/`Продължи` buttons when `injectButton()` finds a suitable anchor.
- Reads clipboard manually or in auto mode.
- Recognizes device text by model keywords and parses SSID/password/ports/5G details.
- Fills OSS fields by stable IDs first, then by label/table proximity fallback.
- Auto mode processes only recognized clipboard text and avoids processing hidden/unfocused tabs.
- For 5G-capable devices, `fillOssForm` fills `Ssid2` and `Psk2` only when `has5g && ssid2` / `has5g && pass`; empty `Ssid2` means the parser did not produce SSID2.

Important autofill selectors/IDs:

- `_wflowRecycleState_PortCount`, `_correctWifiSettings_PortCount`
- `_wflowRecycleState_CheckWifi`, `_correctWifiSettings_CheckWifi`
- `_wflowRecycleState_Ssid1`, `_correctWifiSettings_Ssid1`
- `_wflowRecycleState_Ssid2`, `_correctWifiSettings_Ssid2`
- `_wflowRecycleState_Psk1`, `_correctWifiSettings_Psk1`
- `_wflowRecycleState_Psk2`, `_correctWifiSettings_Psk2`
- `_correctWifiSettings_CustomRequest`
- `_correctWifiSettings_save`

### Reload Extension Button

Main functions/values:

- `EXTENSION_RELOAD_MESSAGE_TYPE`: `extension.reload`
- `createReloadExtensionButton`, `sendExtensionReloadMessage`, `detectOssAssistantBrowserKind`
- background helpers: `storeExtensionReloadTabId`, `consumeExtensionReloadTabId`, `maybeReloadTabAfterExtensionReload`
- storage key: `wifi_oss_extension_reload_tab_id_v1` in `chrome.storage.local`

Behavior:

- Injected by `injectButton()` as `Reload Extension` after `RESET`, using the same OSS anchor button styling.
- Click opens `showRecycleAssignmentChangeConfirm` (`Презареждане на extension`, `Да, презареди` / `Отказ`).
- On confirm, `content.js` sends `extension.reload` with the detected browser kind (`chrome`, `edge`, or `chromium`).
- `background.js` stores the sender tab id, responds, then reloads the extension runtime.
- After the service worker restarts, it reloads the stored tab so the operator stays on the same OSS step with the updated extension code.
- On failure, the button re-enables and shows an alert pointing to `chrome://extensions/` or `edge://extensions/`.

This is an operator/dev convenience on OSS WiFi/recycle pages that already receive `injectButton()`. It does not replace Chrome's manual Load unpacked reload during development.

### SharePoint OSSRecycleSchedule Date/Time Widget

Main functions/values:

- `isSharePointRecycleSchedulePage`
- `formatSharePointRecycleScheduleDateTime`
- `findSharePointRecycleScheduleTitleRow`
- `ensureSharePointRecycleScheduleDateTimeWidget`
- `startSharePointRecycleScheduleDateTimeWidget`
- widget id: `wifi-oss-sharepoint-recycle-schedule-datetime`

Page match:

- host ends with `.sharepoint.com`
- path includes `/lists/ossrecycleschedule/`
- manifest match: `https://a1g.sharepoint.com/sites/o365RCR/Lists/OSSRecycleSchedule/*`

Behavior:

- At the bottom of the IIFE, SharePoint pages call `startSharePointRecycleScheduleDateTimeWidget()` and then `return`, so OSS recycle entry, clipboard autofill observers, SAP/material observers, and label observers do not start on SharePoint.
- The widget is inserted in the SharePoint list title row, preferably immediately after the sync icon (`od-ListState-icon`).
- Shows Bulgarian date/time, for example `10 юли 2026г.` and `Петък 9:26`.
- Refreshes every 30 seconds and re-injects if SharePoint re-renders the title row.

### Label/Barcode Generation

Main functions/values:

- `WAREHOUSE_LIST_ID`: `_warehouseMaterialsCellList`
- `RECYCLE_LIST_ID`: `_recycleDevicesByTechnician`
- `getSerialNumbersFromList`
- `getSelectedSerialNumbersFromList`
- `getRecycleDevicesForBarcodeSheet`
- `getLabelTemplateDataUrl`
- `buildA4LabelsHtml`
- `buildRecycleBarcodeSheetHtml`
- `printLabelsInIframe`
- `printRecycleBarcodeSheetInIframe`
- `injectLabelsButton`
- `bindRecyclePrintBarcodeButton`
- `startLabelsObservers`

Behavior:

- Injects print buttons into warehouse/recycle list controls when matching list roots and pagination exist.
- For warehouse labels, reads serial numbers and overlays Code128 barcode/text onto `images/label.svg`, falling back to `images/label.png`.
- For recycle barcode sheets, reads name/serial/SAP ID and prints a 3x8 A4 barcode grid.
- For recycle lists, manually selected checkbox rows are printed exactly as selected (including `Успешно рециклиран = Не`). When no rows are selected, printing defaults to successful rows only (`Успешно рециклиран = Да`) instead of all rows.
- `getRecycleDevicesForBarcodeSheet` reads the `Успешно рециклиран`/`IsSuccess` column via `normalizeRecycleHistorySuccess` to apply the successful-only default. If nothing successful is found and nothing is selected, all three recycle print entry points show a clear alert telling the operator to select rows manually.
- The recycle `Принтирай баркод` OSS button is hooked (capture-phase) so its default behavior also follows the successful-only default and manual-selection override, matching `Принтирай Всичко` and the injected printer icon.

Important selectors/IDs:

- `_warehouseMaterialsCellList`
- `_warehouseMaterialsCellList_edit_columns`
- `_warehouseMaterialsCellList_print_labels`
- `_recycleDevicesByTechnician`
- `_recycleDevicesByTechnician_edit_columns`
- `_recycleDevicesByTechnician_print_labels`
- `_recycleDevicesByTechnician_printBarcode`
- `_recycleDevicesByTechnician_printAll`
- `td input[type='checkbox'].icheck-input:checked`
- table header `rel` values such as `serialnumber`, `name`, `sapid`

### Device Functions UI

This is a smaller helper around `_deviceFunctions_DeviceFunction`.

Main functions:

- `guessDeviceFunctionGroup`
- `setChosenValue`
- `buildDeviceFunctionsCheckboxUi`
- `startDeviceFunctionsObserver`

Behavior:

- Hides the original select/chosen UI.
- Builds a two-column checkbox UI grouped as `ADB модели` and `Hybrid модели`.
- Keeps the real select value synchronized for existing OSS form behavior.

## Recycle Device Entry: Category + Validation

This is the most important current workflow.

### DOM Selectors and IDs

Constants:

- `RECYCLE_ENTRY_ROOT_ID`: `_wflowEnterDeviceDataForRecycle`
- `RECYCLE_ENTRY_SERIAL_INPUT_ID`: `_wflowEnterDeviceDataForRecycle_SerialNo`
- `RECYCLE_ENTRY_CONTINUE_BTN_ID`: `_wflowEnterDeviceDataForRecycle_save`
- `RECYCLE_ENTRY_PANEL_CLASS`: `wifi-oss-recycle-category-panel`
- inline message ID: `wifi-oss-recycle-serial-msg`
- category button attribute: `data-wifi-oss-recycle-cat`
- check indicator attribute: `data-wifi-oss-check`

Injection:

- `startRecycleEntryObserver` watches `document.documentElement || document.body` with `MutationObserver`.
- `injectRecycleEntryCategoryPanel` looks for the recycle root, serial input, and continue button.
- The panel is appended to `root.querySelector("fieldset") || root`.
- The inline validation message is appended near `serialInput.closest(".row") || serialInput.parentElement`.

### Category Selection

Current categories:

- `android_iptv` - `Android TV & ZTE IPTV`
- `xplore_zapper` - `5019/5020 & Zapper`
- `dth_kaon_nagra` - `DTH Kaon & Nagra`
- `austrian` - `Австрийски`
- `netbox` - `Netbox`
- `routers` - `Рутери`
- `gpon` - `GPON`
- `cam_modules` - `CAM Модули`
- `modems` - `Модеми`

Each category has a card/button with an image from `images/categories/` except `modems`, which uses the Technicolor device image.
`cam_modules` uses `Extension/images/categories/CAM_modules.webp`.

Category clicks go through `requestCategorySelection` and device clicks through `requestDeviceToggle`, which enforce the dailywork manual-change confirmation described in `Dailywork Schedule Auto-Selection`. Without a dailywork assignment for the current workday, selection is unguarded.

### Local Device Catalog and Device Cards

`RECYCLE_DEVICE_CATALOG_RAW` is the local source list for recycle devices. `RECYCLE_DEVICE_CATALOG` is the normalized catalog produced by `normalizeRecycleDeviceCatalogEntry`.

The normalized contract supports:

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

After a category is selected, mapped categories render concrete device cards in the right-side area. Device cards use 16:9 packaged images where available, fall back safely, and can be visually multi-selected. Multi-select currently affects validation context, recycle help context, SAP/material quick-button filtering, and controlled SAP/material auto-fill when a safe single material candidate exists. With a valid per-flow material snapshot, selected devices restrict the SAP/material quick-button grid to only the selected devices/material IDs; without selected devices, SAP/material filtering remains category-level.

### Recycle Help UI

Recycle serial help is visual guidance only. It must not fill serial values, change SAP/material selection, change validation decisions, or navigate OSS.

Current behavior:

- invalid non-empty serial input opens a floating help preview when help content exists;
- the floating preview uses selected-device `helpImagePath` images first;
- if no device is selected, or selected devices have no help images, help falls back to category-level help content;
- the floating preview auto-hides after about 5 seconds and also hides on outside click;
- the yellow help button opens the full manual help menu;
- the full manual help menu is separate from the automatic floating preview;
- Android/IPTV currently has device-level help images for its implemented help entries.

### Recycle-State EX220 SSID Warning

On `/wflow/recycle-state/` pages, the extension shows a warning-only yellow inline message for unusual TP-Link EX220 SSID values.

Current behavior:

- reads only `_wflowRecycleState_Ssid1` and `_wflowRecycleState_Ssid2`;
- applies only when the current per-domain selected concrete device includes `tp_link_ex220` or `tp_link_ex220_home`;
- does not apply to the broader `routers` category when no concrete EX220 device is selected;
- treats empty SSID fields as no warning;
- treats populated SSIDs that start with `A1` or `A1_` as normal;
- shows the warning when any populated SSID does not start with `A1`;
- clears the warning when the SSID values are corrected to `A1...`;
- does not block Continue/Save, change serial validation, auto-click anything, or write to SSID/PSK/Port fields.

The warning uses the same per-domain recycle selection state as the existing category/device flow. It does not introduce cross-domain shared selection or `chrome.storage.local` context.

### Recycle-State DTH Chip Id Autofill

On `/wflow/recycle-state/` pages, the extension can auto-fill the DTH `Chip Id:` field from the OSS-populated serial field for configured DTH devices.

Current behavior:

- applies only when the current per-domain selected category is `dth_kaon_nagra`;
- applies only when the selected concrete devices list contains exactly one configured `deviceId`: `dth_kaon_kstb1001` or `dth_nagra_dts3460`;
- does not apply to category-only `dth_kaon_nagra`, no concrete device, any multi-select, or any other category/device;
- reads only the disabled source field `_wflowRecycleState_ChipIdDth` (visible label `Сериен номер:`);
- fills only the empty editable target field `_wflowRecycleState_SerialNoDth` (visible label `Chip Id:`);
- leaves a non-empty `Chip Id:` unchanged and keeps the field editable after extension fill;
- dispatches `input` and `change` after extension fill so OSS can detect the value;
- applies a yellow/red auto-filled marker to `Chip Id:` and focuses `_wflowRecycleState_CardNo` (visible label `Карта No:`) once after a successful fill;
- does not block Continue/Save, call `preventDefault`, auto-click anything, change serial validation, or write to the disabled source field.

### Recycle-State KSTB5019 XploreTV MAC + OTT Helper

On `/wflow/recycle-state/` pages, the extension can auto-fill the MAC field and default the OTT profile for the selected `KSTB5019 XploreTV` recycle flow.

Current behavior:

- applies only when the current per-domain selected category is exactly `xplore_zapper`;
- applies only when the selected concrete devices list contains exactly one `deviceId`, and it is `kaon_kstb5019_xploretv`;
- does not apply to category-only `xplore_zapper`, no concrete device, multi-select, `KSTB5020 XploreTV`, `KSTB6106 Zapper`, or any other device/category;
- reads the current operation serial/MAC only from the same-page disabled source field `_wflowRecycleState_SerialNo`;
- does not use `wifi_oss_recycle_entry_last_serial`, does not add a storage fallback, and does not use `chrome.storage.local`;
- normalizes the source as uppercase 12-hex MAC and treats missing, empty, or invalid source values as a safe no-op;
- fills only an empty editable `_wflowRecycleState_Mac` target field, formatting `840112DA0EDB` as `84:01:12:DA:0E:DB`;
- leaves a non-empty MAC unchanged and keeps the field editable after extension fill;
- dispatches `input` and `change` after MAC fill so OSS can detect the value;
- applies a yellow/red auto-filled marker to the MAC field, removes it if the operator edits the MAC, and does not re-fill again on the same page load after manual edit;
- selects the `OTT` option in `_wflowRecycleState_StbProfile`, dispatches the existing select/Chosen events, and updates the Chosen UI so it displays `OTT`;
- shows a yellow inline informational notice inside the `Тип ОТТ` fieldset with text `OTT е избрано по подразбиране.`;
- allows the operator to manually change the MAC field or OTT dropdown after automation;
- does not block Continue/Save, call `preventDefault`, auto-click anything, change serial validation, or change SAP/material flow.

Separate from the KSTB5019 MAC autofill helper: when exactly `KSTB5019 XploreTV` or `KSTB5020 XploreTV` is selected in `xplore_zapper`, `injectRecycleStateXploreKaonMacScannerGuard` also attaches the MAC scanner shortcut guard on recycle-state `_wflowRecycleState_SerialNo` and `_wflowRecycleState_Mac` (see `Serial Keyboard Layout Protection`).

### Later-Page Helpers by Selected Device

The EX220 recycle-state SSID warning, DTH Chip Id autofill, and KSTB5019 MAC + OTT helper are implemented examples of a broader pattern: a concrete recycle device selected earlier can decide whether a small helper runs on a later OSS page.

General rules for future helpers:

- recycle category/device selection is intentionally per-domain, using the current OSS origin's existing recycle selection state;
- do not introduce `chrome.storage.local` or global cross-domain shared selection unless a future task proves that the same real workflow changes origin mid-flow and cannot work otherwise;
- use stable `deviceId` values, not display names, to decide whether a helper applies;
- if only a category is selected and no concrete device is selected, device-specific helpers should normally stay inactive unless a task explicitly says otherwise;
- later-page helpers should be guarded by stable page/root selectors and path checks;
- warning/observe-only helpers should be read-only and must not block Continue/Save, call `preventDefault`, auto-click, or edit fields;
- automation helpers are allowed only when explicitly requested and must define exact source fields, target fields, timing, overwrite rules, and device/category scope;
- automation helpers should avoid overwriting a non-empty user-entered target field unless the task explicitly allows it;
- protect sensitive existing runtime areas: serial validation, CAM flow, material auto-continue, clipboard autofill, and label/barcode generation.

A possible future example is a DTH-specific helper that reads or copies a `chip id` value into a `serial number` field only for selected devices that require that behavior. This is not implemented behavior yet.

### After-Recycle: `Отвори в договор`

On `/wflow/after-recycle-state/`, the extension injects `Отвори в договор` next to `Функции на устройство` only in the selected KSTB5019/KSTB5020 XploreTV context. There is no `Провери договор` button or background-only contract lookup in the current runtime.

The button reads a valid 12-hex MAC from the after-recycle page, stores a short-lived pending lookup in `chrome.storage.local` under `wifi_oss_pending_bbs_contract_lookup_v1`, and opens a BBS/RCBill tab. The BBS bridge then:

1. opens the legacy sidebar `Договори` section when its `#o_4278` container is hidden;
2. selects `Търсене (ББС2)` (`#a3` / `valeng="Search2"`);
3. fills `_clients_Mac` and submits `_clients_get` once only;
4. lets the integrated BBS Assistant find the matching MAC in the returned contract/device rows;
5. opens the matching `/bbs2/devices/...` link directly in the BBS tab.

The native BBS search stage is persisted in the pending lookup so the sidebar does not re-open the empty client-search form after the request was submitted. The opened device page carries the matched MAC in its URL fragment; the matching MAC input is styled with a green background and dark-green text/border. The pending lookup is removed before direct device navigation.

This flow depends on the internal BBS DOM and permissions. Validate it manually after OSS/BBS changes; do not reintroduce a background `ExecuteGet` check without a verified response schema.

### Storage Keys

Recycle entry storage:

- `wifi_oss_recycle_entry_category` in `localStorage`
- `wifi_oss_recycle_entry_category_date` in `localStorage`
- `wifi_oss_recycle_entry_selected_devices` in `localStorage`, JSON array of selected `deviceId` strings
- `wifi_oss_dailywork_auto_applied_date_v1` in `localStorage`, local workday marker after a successful production Dailywork auto-selection
- `wifi_oss_dailywork_auto_suppressed_date_v1` in `localStorage`, local workday marker set by Reset so production Dailywork auto-selection does not immediately reapply
- `wifi_oss_dailywork_manual_user_override_v1` in `localStorage`, manual Dailywork fallback user ID only; it does not store schedule rows, names, or devices
- `wifi_oss_dailywork_noop_notice_date_v1` in `localStorage`, local workday marker so the non-blocking "Няма разпределение за рециклиране" notice shows at most once per workday
- `wifi_oss_dailywork_assignment_v1` in `localStorage`, the category/device the dailywork distribution applied for the current workday (`{ workday, categoryId, deviceIds }`); used to confirm manual category/device changes that deviate from the schedule
- `wifi_oss_recycle_processed_ledger_v1` in `localStorage`, local processed-serial ledger keyed by normalized serial (`{ serial, action, categoryId, at, firstAt, workday }`); independent double-process guard checked alongside the server recycle history, pruned after ~30 days and capped in size
- `wifi_oss_recycle_entry_last_serial` in `sessionStorage`
- `wifi_oss_recycle_entry_pending_material` in `sessionStorage`
- `wifi_oss_recycle_entry_material_snapshot` in `sessionStorage`, per-flow category/device/material/serial/date context for the next SAP/material step

The selected category and selected devices are shared across OSS tabs/windows for the same browser origin. `sessionStorage` remains for transient recycle flow state such as the last valid serial, pending material context, and the per-flow material snapshot. Clipboard SSID/password autofill has its own storage and is not part of this recycle selection flow.

Background Dailywork cache:

- `wifi_oss_dailywork_lkg_v1` in `chrome.storage.local`, validated last-known-good normalized schedule payload
- `wifi_oss_dailywork_meta_v1` in `chrome.storage.local`, compact fetch/cache metadata

### Daily Reset Logic

`localDateKey()` returns `YYYY-MM-DD` using the browser local date.

During `injectRecycleEntryCategoryPanel`:

- Reads today with `localDateKey()`.
- Reads `wifi_oss_recycle_entry_category_date` from `localStorage`.
- If a saved date exists and differs from today:
  - removes `wifi_oss_recycle_entry_category` from `localStorage`
  - removes `wifi_oss_recycle_entry_category_date` from `localStorage`
  - removes `wifi_oss_recycle_entry_selected_devices` from `localStorage`
  - removes the legacy `wifi_oss_recycle_entry_category` from `sessionStorage`
- Reads the selected category and selected devices from shared `localStorage`.
- Gives the production Dailywork auto-selection hook a clean post-reset opportunity to select only when the safe plan allows it.

Risk/TBD: this reset happens when the panel injects/renders. If an OSS tab stays open across midnight without reload/navigation/reinjection, the already-rendered panel may keep its old `panel.dataset.wifiOssRecycleSelected`.

### Dailywork Schedule Auto-Selection

Dailywork schedule support is separate from the external recycle catalog runtime. The remote schedule is fetched through the fixed `dailywork.fetchSchedule` background message from the raw GitHub `config/dailywork.json` source, validated into normalized rows, and cached as a last-known-good payload. It is not loaded through the recycle catalog remote-config overlay and does not define catalog devices, material IDs, validation rules, images, selectors, or JavaScript.

Production auto-selection runs only on the recycle entry page after the initial category panel render and daily reset opportunity. It detects the current logged-in OSS technician, finds exactly one matching Dailywork `User`, resolves that row's `Device` through the explicit local schedule-device mapping, and applies only safe `category` or `category_device` plans. It skips on no row, multiple rows, `noop` devices such as absence/admin work, invalid categories/devices, existing manual category/device selection, or same-day suppress markers. Production auto-selection never uses the saved fallback user automatically and never clicks OSS category/device DOM elements, navigates OSS, clicks Continue, edits serial input, or writes material snapshots.

Explicit concrete mapping examples in `DAILYWORK_DEVICE_CONCRETE_MAPPINGS`:

- `DTH STB` -> category `dth_kaon_nagra`, device `dth_kaon_kstb1001`
- `TP-Link EX220` -> category `routers`, device `tp_link_ex220`
- `Kaon Xplore 5019 - ОТТ` -> category `xplore_zapper`, device `kaon_kstb5019_xploretv`

Broad category-only examples in `DAILYWORK_DEVICE_CATEGORY_MAPPINGS`:

- `SD STB` -> category `dth_kaon_nagra` only
- `NETBOX 4G` / `NETBOX 5G` -> category `netbox`

Production auto-selection is triggered through `scheduleDailyworkProductionAutoSelectWithRetry(panel)`, a hardened wrapper around `runDailyworkProductionAutoSelect(panel)`:

- One scheduler runs per injected panel element (guarded by `panel.dataset.wifiOssDailyworkAutoScheduler`); a re-injected panel re-arms a fresh scheduler.
- Transient outcomes (technician detection failed, schedule fetch/items unavailable, cells fetch failed, in-flight `null`, unexpected throw, or `dailywork_auto_persist_verification_failed`) are retried with a bounded backoff schedule (`250ms → 8s`, ~20s worst case). Each retry re-runs detection and the background schedule fetch, so slow OSS DOM render, momentary network failures, and last-known-good warm-up recover automatically.
- Terminal/intentional outcomes stop immediately and are never retried or overridden: `resolved_action_noop`, `current_category_already_selected`, `current_devices_already_selected`, `dailywork_auto_suppressed_for_workday`, and `dailywork_auto_already_applied_for_workday`.
- Config-gap outcomes that will not self-heal in-session (`unmapped_device_name`, `missing_device_name`, `target_category_unknown`, `target_category_missing`, `resolved_action_not_applicable`) get only a few extra attempts and then stop.
- The scheduler stops if the panel is removed from the DOM (navigation/re-render).
- `runDailyworkProductionAutoSelect` verifies the write persisted by reading the selection back before marking success; a failed/blocked storage write returns the retryable `dailywork_auto_persist_verification_failed` instead of a silent no-op.

Non-blocking "no recycle assignment" notice: when the retry scheduler reaches a terminal outcome where the technician row was positively found (`scheduleRowStatus === "found"`) but the resolved action is `noop` (absence/`Друго` or an unmapped device name), `maybeShowDailyworkNoRecycleAssignmentNotice` shows a closable modal (`wifi-oss-dailywork-noop-notice-modal`) at most once per workday (`wifi_oss_dailywork_noop_notice_date_v1`). It only appears for a positively found unmappable row, never for transient detection/fetch failures. It never blocks recycling and can be dismissed with the button, `x`, backdrop click, or `Escape`.

Manual-change confirmation: whenever the dailywork target is applied (production auto-select, manual apply, or debug force), `recordDailyworkAssignment` stores the applied category/device in `wifi_oss_dailywork_assignment_v1` for the current workday. In the recycle entry panel, category clicks go through `requestCategorySelection` and device clicks through `requestDeviceToggle`. If an assignment exists for today and the operator picks a different category (or toggles the device selection so it no longer matches the assigned device set), `showRecycleAssignmentChangeConfirm` opens a closable dialog before the change is applied. Confirming applies the change; cancel/Escape/backdrop keeps the current selection. The assignment baseline is the schedule, not the last manual pick, so re-selecting the assigned category/device is always free and any deviation keeps prompting. When there is no assignment for today (e.g. `Друго`/config gap), selection is unguarded. The Reset button reuses the same confirm ("Нулиране на избора") via `showRecycleAssignmentChangeConfirm` when an assignment exists for today and a category/device is currently selected; confirming runs the normal reset (clear selection + suppress auto-reapply for the workday), cancel keeps the selection.

Reset clears the current recycle category/device selection and writes `wifi_oss_dailywork_auto_suppressed_date_v1` for the current local workday. This prevents production Dailywork auto-selection from immediately reapplying after an operator intentionally resets the selection. Manual Dailywork apply remains available after Reset because it is an explicit operator action.

Double-process guard: in addition to the server recycle history, the recycle entry gate (`guardContinue` in `injectRecycleEntryCategoryPanel`) checks a local processed-serial ledger (`wifi_oss_recycle_processed_ledger_v1`) through `buildRecycleDuplicateForSerial`, which merges the server history duplicate and the local ledger entry into one duplicate signal. When a serial passes all guards and the flow proceeds, `recordRecycleProcessedSerial` writes it to the ledger, so an immediate re-entry of the same serial is blocked even before the server history reflects it. Because the entry serial gate is shared by recycle and scrap, this enforces cross-action safety (an already recycled/scrapped device is blocked for both). The existing "Да" override (`consumeRecycleHistoryDuplicateOverride`) still allows intentional re-processing, and an in-memory per-page-load key (`recycleEntryHandledSerialKey`, reset on each fresh panel injection) prevents a single Continue gesture from self-blocking after it records the serial. The ledger is shared across tabs (same origin), pruned after `RECYCLE_PROCESSED_LEDGER_MAX_DAYS` (30) and capped at `RECYCLE_PROCESSED_LEDGER_MAX_ENTRIES` (3000). The warning wording reflects the known action: recycled, scrapped, or a generic "обработено" when only the ledger knows.

The server recycle history covers the last `RECYCLE_HISTORY_DAYS_BACK` (7) days, so a device recycled/scrapped within the past week is detected as a duplicate. Because the history loads asynchronously, `guardContinue` performs a fast, bounded, one-shot wait per serial (`recycleEntryHistoryWaitedSerialKey`) when the history is still `idle`/`loading`: it awaits the in-flight fetch capped at `RECYCLE_HISTORY_CONTINUE_WAIT_MS` (1500 ms) and then re-triggers Continue so the duplicate check runs against real data. On timeout it fails open and the local processed-serial ledger still blocks same-device repeats, keeping the flow fast.

Recycle-history duplicate validation first discovers a `sap-recycle-devices-by-technician` template from the current page, matching links, or the saved `wifi_oss_recycle_history_url_template` value. If that template is missing, it falls back to technician detection: first the visible OSS header user code such as `A1BG514837` plus the selected numeric warehouse dropdown, then discover/fetch `sap-warehouse-cells-recycle`. When a technician and warehouse are available, it builds the same-origin `sap-recycle-devices-by-technician/{technicianId}/{warehouseId}` URL and caches it as the history template. If all discovery paths fail, duplicate validation remains fail-open with the visible history warning.

Manual/demo Dailywork tools:

- Floating `ДР` schedule panel shows the loaded schedule table, current technician status, a collapsed `Инфо` metadata/device summary, and saved fallback technician controls.
- Floating `wifi-oss-dailywork-apply-btn` performs manual apply only when clicked. It tries the current technician first, then uses the saved fallback user only if the current technician row is not found.
- The fallback key `wifi_oss_dailywork_manual_user_override_v1` stores only the selected `user` ID. The current schedule row is always re-read from the loaded/fetched schedule before manual apply.

### Reset Button

The `RESET` button is created by the generic `injectButton()` flow, not by `injectRecycleEntryCategoryPanel()`.

The same `injectButton()` row also injects `Reload Extension`; see `Reload Extension Button` above.

Before it clears anything, if the dailywork distribution assigned a category/device for today (`readDailyworkAssignmentForToday`) and a category/device is currently selected, it opens the shared `showRecycleAssignmentChangeConfirm` dialog ("Нулиране на избора", `Да, нулирай` / `Отказ`). Cancel/Escape keeps the selection; confirm runs the reset. With no assignment for today, or nothing currently selected, it resets immediately without a prompt.

On (confirmed) click it:

- removes `wifi_oss_recycle_entry_category`
- removes `wifi_oss_recycle_entry_category_date`
- removes `wifi_oss_recycle_entry_selected_devices`
- removes the legacy category value from `sessionStorage`
- writes `wifi_oss_dailywork_auto_suppressed_date_v1` for the current workday so production Dailywork auto-selection does not immediately reapply
- clears `panel.dataset.wifiOssRecycleSelected`
- sets category button backgrounds back to `#585858`
- clears `wifi-oss-recycle-serial-msg`

Risks:

- It does not remove `wifi_oss_recycle_entry_last_serial` or `wifi_oss_recycle_entry_pending_material`.
- It adjusts only some visuals; checkmark text/box shadow may not fully reset in every state.
- The reset button appears only if `injectButton()` finds a suitable `Запази` or `Продължи` anchor button. Verify in the real OSS step.

### Validation Guard

`guardContinue` is attached to:

- continue button `click`, capture phase
- root form `submit`, capture phase
- serial input `keydown` for `Enter`, capture phase

Behavior:

- If no category is selected, prevents continuing and shows `Избери категория преди да продължиш.`
- If a category is selected, that category renders visible/enabled concrete device cards, and no active concrete device is selected for that category, prevents continuing and shows `Избери поне едно устройство.`
- The selected-device-required guard does not apply to `cam_modules`, `modems`, or categories without visible/enabled concrete device cards.
- The selected-device-required guard is controlled only by the same-tab `sessionStorage` debug key `wifi_oss_debug_recycle_device_required_enabled`; missing key/default state means `ON`, and value `"0"` bypasses only this new guard.
- If the serial is invalid for the current category/device context, prevents continuing, shows the validation message, focuses/selects the serial input.
- If valid, stores `wifi_oss_recycle_entry_last_serial` and sets `wifi_oss_recycle_entry_pending_material` to `1` for the next material step.

Validation behavior:

- no selected devices -> current category-level `validateRecycleSerial(...)` fallback;
- one selected device -> implemented predefined local `validationProfileId` is used when available;
- multiple selected devices -> OR logic, where the serial is valid if at least one selected device profile accepts it;
- selected device with no implemented profile -> safe fallback to category-level validation;
- empty serial and Cyrillic checks are common guards and are not bypassed by OR logic.

### Recycle Entry Debug Guards

The recycle entry panel includes a small collapsed `Debug guards` tray in the extension-owned panel area near the `Remote config` tray. It is not injected into `#footer` and does not create its own observer, polling loop, or repeated remove/reinsert cycle.

Controls:

- `Debug: Material auto-continue ON/OFF` uses same-tab `sessionStorage` key `wifi_oss_debug_material_auto_continue_enabled`; missing key/default state means `ON`, and value `"0"` means `OFF`.
- `Device required ON/OFF` uses same-tab `sessionStorage` key `wifi_oss_debug_recycle_device_required_enabled`; missing key/default state means `ON`, and value `"0"` bypasses only the selected-device-required recycle entry guard.

The device-required toggle does not bypass no-category validation, serial validation, duplicate recycle-history guards, SAP/material logic, CAM flow, clipboard autofill, label/barcode helpers, or `Remote config` behavior.

### Serial Keyboard Layout Protection

- `_wflowEnterDeviceDataForRecycle_SerialNo` protects scanner input from active BG keyboard layouts.
- Trusted `keydown` events with a single Cyrillic `event.key` and known `KeyboardEvent.code` are normalized only for clear cases: `KeyA`..`KeyZ` -> `A`..`Z`, and `Semicolon` + `Shift` -> `:`.
- Normal Latin/digit input is left unchanged. Paste or unknown Cyrillic input is not auto-corrected; it keeps the warning/block fallback.
- Opt-in serial keyboard diagnostics use `sessionStorage.setItem("wifi_oss_serial_keyboard_debug", "1")` and expose `window.__wifiOssSerialDebugEvents` plus `wifi_oss_serial_keyboard_debug_events`.
- For `KSTB5019 XploreTV` and `KSTB5020 XploreTV` (single selected device in `xplore_zapper`), `attachRecycleXploreKaonMacScannerShortcutGuard` blocks scanner prefix/suffix keys that steal focus or switch browser tabs: `Tab`, `Alt`/`Meta` combos, most `Ctrl` shortcuts (except copy/paste/select), `F1`–`F12`, `PageUp`/`PageDown`. Applied on recycle entry serial input and recycle-state serial/MAC inputs. Does not block `Enter` (Continue) or manual `Ctrl+C/V/A/X/Z/Y`. True OS-level `Alt+Tab` between applications cannot be blocked by a page extension; if that persists, reprogram the scanner prefix/suffix.

Risk/TBD: the guard uses `preventDefault()` and `stopPropagation()`, not `stopImmediatePropagation()`. If OSS has other capture listeners on the same element, verify that invalid entries truly cannot continue.

### Validation Rules by Category

- `xplore_zapper`
  - Must be exactly 12 hex characters, case-insensitive.
  - Separators `:` or `-` are rejected.
  - Digits-only MAC values are accepted; there is no minimum A-F letter count.
- `modems`
  - `0099...` accepted only if all digits.
  - `SAAP...` or `SAPP...` accepted as alphanumeric, with optional single dash only at character index 5.
  - Other modem serials are accepted only if they have a dash at character index 5 and match `^[A-Za-z0-9]{5}-[A-Za-z0-9]+$`.
- `android_iptv`
  - Must be 12-17 characters long.
  - Rejects MAC-like values.
  - If it does not start with `BG`, it must be digits only.
  - If it starts with `BG`, letters are allowed.
- `netbox`
  - Must be 15 digits and pass IMEI Luhn validation.
- `routers`
  - If it starts with `ZTE`, length must be exactly 15.
  - Otherwise length must be exactly 13.
- `gpon`
  - Accepts values starting with `5A54` or `4857`.
  - Accepts `ZTEK` values only when length is exactly 15.
  - Note: the code comment says "starts with ZTE AND is exactly 12 chars long", but the code checks `ZTEK` and length `15`. Treat this as a business-rule uncertainty.
- `austrian`
  - No selected device keeps the current category fallback: at least 16 alphanumeric characters.
  - Selected `ADB Modem 2220` uses `austrian_adb_vv2220`: starts with `PI` and is exactly 19 alphanumeric characters total.
  - Selected `Huawei HA35-22 HYBRID` uses `austrian_huawei_ha35_22_hibrid`: exactly 16 alphanumeric characters.
- `dth_kaon_nagra`
  - Must be exactly 11 digits.
- `cam_modules`
  - Has no format validation.
  - Only the shared empty-field guard applies: the user must enter some serial value before continuing.

### Selected-Device Validation Profiles

Implemented predefined local profiles currently include:

- `android_b866v2f02_bg_plus_15_digits` - `BG` plus exactly 15 digits.
- `android_dv9161_16_digits` - exactly 16 digits.
- `android_zxv_b700v5_12_digits` - exactly 12 digits.
- `xplore_zapper_mac12_hex_plain` - plain 12-hex MAC, no `:` or `-`.
- `dth_11_digits_prefix_00` - exactly 11 digits starting with `00`.
- `imei15_luhn` - 15 digits plus Luhn check.
- `gpon_16_alnum` - 16 alphanumeric characters for confirmed selected GPON devices.
- `router_13_alnum` - 13 alphanumeric characters for confirmed TP-Link/Deco/HX520 devices.
- `router_zte_h3601p_zte_prefix_15_alnum` - `ZTE` prefix and 15 total alphanumeric characters.

## SAP/Material Quick Buttons

### DOM Selectors and IDs

Constants:

- `SWAP_MATERIAL_ROOT_ID`: `_wflowSwapShopMaterial`
- `SWAP_MATERIAL_INPUT_ID`: `_wflowSwapShopMaterial_MaterialId`
- continue/save button lookup:
  - `_wflowSwapShopMaterial_save`
  - `root.querySelector("#_wflowSwapShopMaterial_save")`
  - `root.querySelector("button[name='save']")`
- panel class: `wifi-oss-swap-material-panel`
- category filter button attribute: `data-wifi-oss-cat`
- material button data:
  - `data-wifi-oss-swap-material-name`
  - `data-wifi-oss-swap-material-category`

### Input Locking and Value Setting

`injectSwapMaterialButtons`:

- locates root and material input.
- sets `input.readOnly = true`.
- sets `aria-readonly="true"`.
- changes visual style to a disabled-looking background/cursor.
- attaches rewrite/sanitize listeners with `attachSwapMaterialRewriteRule`.

`setSwapMaterialInputValue` uses the native input value setter when possible and dispatches `input` and `change` events.

`normalizeSwapMaterialId` strips all non-digits:

- `1-000-055-165` -> `1000055165`
- `BG108322` -> `108322`
- `118550_DISMANTLED` -> `118550`

Legacy SAP/material IDs that are known replacements are not shown as quick buttons in `SWAP_MATERIAL_MODELS_DEFAULT`. They remain only in `rewriteMap`, so OSS-prefilled legacy values are rewritten to the current SAP while operators select only current visible quick buttons.

### Existing SAP Value and Auto-Continue

`autoContinueSwapMaterialIfReady`:

- If material input has a non-empty normalized value, it normalizes the field and clicks the save/continue button once.
- This likely supports the case where OSS already found material history.
- This behavior is intentionally preserved for `cam_modules` when OSS has already populated `MaterialId`.

Debug/test toggle:

- `wifi_oss_debug_material_auto_continue_enabled` in `sessionStorage` controls a temporary test override.
- Missing key/default state means material auto-continue is `ON`.
- Value `"0"` means material auto-continue is `OFF` for the current tab/session.
- The small `Debug: Material auto-continue ON/OFF` control is injected through the existing SAP/material panel and through the recycle entry `Debug guards` tray, not through a separate global observer, footer control, or floating panel.
- When `OFF`, a prefilled `_wflowSwapShopMaterial_MaterialId` does not auto-click Continue, so the SAP/material page and filtered material grid can be inspected.
- This is a debug/test helper for validating material filters, not a primary operator workflow.
- `cam_modules` missing-material redirect flow is unchanged.

TBD to verify in real OSS:

- Whether auto-click is always desired when OSS pre-fills material.
- Whether extension-filled values and OSS-filled values can be distinguished reliably.
- Whether the target continue button is always `_wflowSwapShopMaterial_save`.

### CAM Modules Missing-Material Flow

For recycle category `cam_modules`, empty material history is handled differently from the normal quick-button flow:

- If `_wflowSwapShopMaterial_MaterialId` has a value, the existing material auto-continue behavior runs unchanged.
- If `_wflowSwapShopMaterial_MaterialId` is empty, the extension waits briefly, checks the field again, then clicks the breadcrumb link back to the main `Рециклиране на устройство` operation.
- The breadcrumb lookup uses the visible text `Рециклиране на устройство` and a `/wflow/<operationId>` URL pattern; the operation number is dynamic and must not be hardcoded.
- Before clicking the breadcrumb, the extension stores the operation id in `sessionStorage` so the next page can identify this specific CAM missing-material scenario.
- On the operation page, a red helper text is inserted next to `Служебно прекратяване`: `Не е открита история за този сериен номер в SAP. Опитайте с другия номер на CAM модула. При повторен неуспех предайте устройството на супервайзър.`
- The helper is shown only when the stored CAM missing-material operation id matches the current `/wflow/<operationId>` page.
- The extension does not click `Служебно прекратяване` and does not change the behavior of `Напред` or `Служебно прекратяване`.

### Models and Images

Model sources:

- `SWAP_MATERIAL_MODELS_DEFAULT` in `content.js` contains a built-in fallback list.
- Legacy SAP/material aliases are excluded from the visible fallback list; `rewriteMap` still handles OSS-prefilled old values.
- `ZTE G5B` uses confirmed SAP/material `124173`; `deviceId: "zte_g5b1"` and packaged image path are intentionally unchanged.
- Render dashboard polling is currently disabled by `SWAP_MATERIAL_REMOTE_DASHBOARD_ENABLED = false` because deployed Render data can still return stale material models and override the packaged fallback.
- While disabled, production material buttons rely on packaged/local fallback model data.
- The old Render dashboard polling path may be re-enabled only after its data source and override behavior are reviewed.

Images:

- Dashboard model `image` wins if present.
- Relative dashboard image paths are resolved against `https://oss-assistant.onrender.com`.
- Remote images are fetched through `background.js` as data URLs.
- If no dashboard image exists, `deviceImageForModel(m.name)` tries packaged `images/devices/*.webp`.
- If no packaged image matches, the button renders without image.

Dashboard categories:

- `internet`
- `tv`
- `other`

If a dashboard model does not have one of these categories, `content.js` derives a category from the model name via `categorizeSwapMaterial`.

### Recycle-Specific Material Filtering

The SAP/material quick-button grid can be scoped by the selected recycle category (`wifi_oss_recycle_entry_category`).
The scoped filters are explicit allowlists of normalized material IDs, not broad dashboard categories.

Mapped recycle categories:

- `xplore_zapper`
- `dth_kaon_nagra`
- `android_iptv`
- `netbox`
- `routers`
- `gpon`
- `austrian`

Behavior for mapped categories:

- Only allowlisted material buttons are rendered.
- The button order follows the allowlist order.
- After a valid recycle serial Continue, a per-flow material snapshot is saved in `sessionStorage`; the SAP/material step uses only a valid per-flow snapshot for selected-device material decisions, so another OSS tab changing the shared selected devices does not affect the current material step.
- If one or more recycle devices exist in the valid per-flow snapshot, the quick-button grid is restricted to only the selected devices/material IDs instead of merely prioritizing them first.
- `getRecycleMaterialFillCandidate(...)` calculates a controlled fill candidate from the snapshot and current material model list, returning `{ ok, materialId, reason }`.
- If the candidate is safe, the material exists in the current material model list, and `MaterialId` is empty, the extension fills `MaterialId`, shows a yellow warning that the value was filled automatically, and calls the existing material auto-continue logic again.
- If the candidate is safe and OSS prefilled a different `MaterialId`, the selected device catalog SAP/material wins: the extension replaces the OSS value, shows a yellow replacement warning, and only then calls the existing material auto-continue logic. This covers cases such as `Huawei B310s` where the catalog value is `111732` and OSS may prefill a different SAP.
- If selected devices exist in the valid snapshot but there is no single safe Material ID candidate, the extension does not auto-fill, does not auto-continue, and shows a yellow warning asking the operator to choose the device.
- Prefilled OSS `MaterialId` values are preserved only when there is no valid single selected-device snapshot or when the prefilled value already matches the selected device catalog SAP/material.
- If no selected devices exist in the valid snapshot, the current category-level material filtering behavior remains unchanged.
- The broad chips `all` / `internet` / `tv` / `other` are hidden.
- Search stays scoped to the rendered allowlisted devices.
- There is no fallback to all devices when a mapped category is active.
- For recycle-scoped grids, missing dashboard-provided models can be supplemented from built-in material models when the local catalog allowlist requires them.
- Known low-priority UI follow-up: after choosing a quick button in the ambiguous multi-select case, the warning can disappear and the layout can shift slightly.

Unmapped categories keep the older full-list behavior.

Current Austrian behavior:

- `austrian` has device cards for `ADB Modem 2220` and `Huawei HA35-22 HYBRID`.
- A selected Austrian device can controlled-fill empty `MaterialId` through the per-flow snapshot and follows the same selected-device material auto-continue behavior as other selected-device controlled fills.
- No selected Austrian device keeps the legacy preset fallback: `PI* -> 1200017460`, otherwise `1200017462`.
- Known UI polish: `Huawei HA35-22 HYBRID` quick material button/card can render through the fallback material model even if no dedicated quick-button image is available yet.
- `cam_modules` is a separate flow. With empty `MaterialId`, it redirects back to the operation page and does not use the quick-buttons grid.
- Controlled fill candidates still skip `cam_modules` and `modems`.

### Likely Future Change Points for Recycle-Based Material Filtering

Most likely code areas:

- Recycle category storage/constants around `RECYCLE_ENTRY_SELECTED_KEY`.
- `injectSwapMaterialButtons`, especially the initial `activeCategory`, model button creation, and `applyFilter`.
- `SWAP_MATERIAL_RECYCLE_FILTERS`, the explicit mapping between recycle categories and normalized material IDs.
- `SWAP_MATERIAL_MODELS_DEFAULT` and/or dashboard model schema if more precise grouping is needed than `internet`/`tv`/`other`.
- `applyRecycleCategoryMaterialPreset` if future category behavior should auto-fill, skip, or trigger another OSS action.

## Dashboard/API Dependency

Current dashboard status:

- The existing dashboard/API is useful for Swap Shop/SAP material models, but it should not be treated as the final architecture for recycle device catalog/config work.
- Future recycle config should follow the hybrid roadmap in `docs/RECYCLE_DEVICE_CONFIG_ARCHITECTURE.md`: local configurator/export first, GitHub or static hosted config as an MVP, optional validated remote overlay later, and a proper hosted admin panel only after schema/fallback/validation are stable.
- Remote config must stay optional and validated; invalid or missing remote data must not block local recycle behavior.
- Future GitHub/static config work should use a separate public config repository, not the full extension repo. A likely shape is `config/recycle-device-catalog.json`, `config/recycle-device-catalog.schema.json`, `config/assets-manifest.json`, `images/devices/16x9/`, `images/recycle-help/`, and a static GitHub Pages `configurator/`.
- The static configurator MVP should load JSON by URL or file upload, use `assets-manifest.json` for selectors, preview static image URLs, download candidate JSON for manual PR/upload, and avoid GitHub browser write access, tokens, OAuth, secrets, customer data, runtime JSON loading, and dependency on the old Render material-model polling mechanism.
- `node Extension/scripts/export-recycle-assets-manifest.js` is the dev-only no-write exporter for that future static asset manifest. It scans only packaged `Extension/images/devices/16x9/` and `Extension/images/recycle-help/` images and outputs extension-relative `images/...` paths to stdout.
- `node Extension/scripts/export-recycle-static-config-package.js --out path/to/output-dir` is the dev-only static package exporter. By default it writes only `config/recycle-device-catalog.json` and `config/assets-manifest.json` to the explicit output directory, validates the generated catalog, and refuses runtime/source output paths. Optional `--include-images` copies only assets referenced by `assets-manifest.json` into `images/devices/16x9/` and `images/recycle-help/`; optional `--include-configurator-ui` copies `configurator/index.html`, `configurator/app.js`, and `configurator/styles.css`, with copied `app.js` transformed to static mode while source `public/app.js` stays local mode.
- Smoke-tested full static package export command: `node Extension/scripts/export-recycle-static-config-package.js --out path/to/output-dir --include-images --include-configurator-ui`. The package should run without `/api/*` endpoints, show disabled/instructional static validation, keep exported JSON paths as `images/...`, and still avoid GitHub Pages files, `.nojekyll`, GitHub write/OAuth/tokens, runtime JSON loading, and runtime behavior changes. Use `validate-recycle-config-fixture.js --input` and `review-recycle-config-candidate.js --input` against the generated catalog before copying/uploading the package to a future separate config repo.
- Future `oss-assistant-config` operations should copy the generated package into a package-shaped public repo root, not an extension-shaped repo. Commit only `README.md`, `config/`, `images/`, and `configurator/`; do not include full `Extension/`, `Extension/content.js`, `manifest.json`, local Node server files, temp candidates/outputs/backups/zips, secrets/tokens/customer data, or GitHub OAuth/browser-write code. GitHub Pages should conceptually serve `/config/recycle-device-catalog.json`, `/config/assets-manifest.json`, `/images/...`, and `/configurator/`; validation stays local scripts first, with GitHub Action validation later.
- Live `oss-assistant-config` deployment: public repo `https://github.com/oss-assistant/oss-assistant-config`, GitHub Pages root `https://oss-assistant.github.io/oss-assistant-config/`, static configurator `https://oss-assistant.github.io/oss-assistant-config/configurator/`, config JSON `https://oss-assistant.github.io/oss-assistant-config/config/recycle-device-catalog.json`, and assets manifest `https://oss-assistant.github.io/oss-assistant-config/config/assets-manifest.json`. Pages is enabled from `main` branch root; the root URL showing README is expected. The browser configurator does not write to GitHub, and extension runtime still does not load remote config.
- Before implementing static mode, keep the package contract explicit: static configurator files should live under `configurator/`, load `config/recycle-device-catalog.json` and `config/assets-manifest.json`, never call `/api/*`, never store static preview URLs in exported JSON, and rely on local scripts or GitHub Actions for full validation.
- Future optional remote overlay design: add `storage` and likely `https://oss-assistant.github.io/*` manifest permissions only in an intentional runtime patch; use keys `wifi_oss_recycle_remote_config_lkg_v1`, `wifi_oss_recycle_remote_config_meta_v1`, `wifi_oss_recycle_remote_config_status_v1`, and `wifi_oss_recycle_remote_config_enabled_v1`; start with fetch/validate/cache without apply, then debug/manual refresh, then visual/help metadata overlay for existing devices only. Remote config must never control JS, regex, DOM selectors, OSS navigation, clipboard, labels/barcodes, CAM, auto-continue, `rewriteMap`, keyboard normalization, or dashboard polling.

Files:

- `Extension/dashboard/server.js`
- `Extension/dashboard/public/*.html`
- `Extension/dashboard/public/*.js`
- `Extension/dashboard/data/models.json`

API:

- `GET /api/models` public read-only endpoint consumed by the extension.
- Admin-only endpoints:
  - `POST /api/auth/check`
  - `POST /api/models/add`
  - `POST /api/models/setCategory`
  - `POST /api/models/setImageUrl`
  - `POST /api/models/uploadImage`
  - `POST /api/models/remove`

Risks:

- `ADMIN_TOKEN` defaults to `RC112900` if env var is missing. Treat as a security/configuration risk, not a runtime extension concern.
- `loadModels` contains mojibake Bulgarian category aliases (`Рё...`) rather than normal Cyrillic; verify whether this is accidental legacy encoding or harmless.
- Dashboard data can replace the built-in material list when polling is enabled. If remote dashboard data is stale or incomplete, wrong or missing quick buttons may appear.
- The local `models.json` may not exactly match the currently deployed dashboard data.

## Images and Assets

Important packaged assets:

- `Extension/images/icon16.png`, `icon48.png`, `icon128.png` - extension icons.
- `Extension/images/label.svg`, `label.png` - label template, SVG preferred.
- `Extension/images/devices/*.webp` - material button device images.
- `Extension/images/categories/*.webp` - recycle category card images.

Fallback behavior:

- Label printing falls back from `label.svg` to `label.png`.
- Material buttons fall back from dashboard remote image to `deviceImageForModel`.
- If no image match exists, the material button still renders as text/SAP ID.

## Storage Keys Summary

- `wifi_oss_auto_mode_enabled` - `localStorage`, clipboard auto mode.
- `wifi_oss_last_clipboard_text` - `localStorage`, clipboard baseline.
- `wifi_oss_recycle_entry_category` - `localStorage`, selected recycle category shared across OSS tabs/windows.
- `wifi_oss_recycle_entry_category_date` - `localStorage`, selected category date.
- `wifi_oss_recycle_entry_selected_devices` - `localStorage`, JSON array of selected recycle `deviceId` values shared across OSS tabs/windows.
- `wifi_oss_dailywork_auto_applied_date_v1` - `localStorage`, local workday marker for a successful production Dailywork auto-selection.
- `wifi_oss_dailywork_auto_suppressed_date_v1` - `localStorage`, local workday marker that blocks production Dailywork auto-selection after Reset.
- `wifi_oss_dailywork_manual_user_override_v1` - `localStorage`, selected fallback Dailywork user ID for explicit manual apply only.
- `wifi_oss_dailywork_noop_notice_date_v1` - `localStorage`, local workday marker so the non-blocking "Няма разпределение за рециклиране" notice shows at most once per workday.
- `wifi_oss_dailywork_assignment_v1` - `localStorage`, category/device applied by the dailywork distribution for the current workday (`{ workday, categoryId, deviceIds }`); baseline for the manual category/device/Reset change confirmations.
- `wifi_oss_recycle_processed_ledger_v1` - `localStorage`, local processed-serial ledger (`{ serial, action, categoryId, at, firstAt, workday }`) for the offline-proof double-process guard; pruned after ~30 days and size-capped.
- `wifi_oss_recycle_history_url_template` - `localStorage`, cached same-origin `sap-recycle-devices-by-technician` history URL template for duplicate validation.
- `wifi_oss_recycle_entry_last_serial` - `sessionStorage`, serial saved before material step.
- `wifi_oss_recycle_entry_pending_material` - `sessionStorage`, flag for material preset step.
- `wifi_oss_recycle_entry_material_snapshot` - `sessionStorage`, per-flow category/device/material/serial/date snapshot used for SAP/material button ordering and controlled auto-fill.
- `wifi_oss_dailywork_lkg_v1` - `chrome.storage.local`, background-owned Dailywork last-known-good normalized schedule cache.
- `wifi_oss_dailywork_meta_v1` - `chrome.storage.local`, background-owned Dailywork fetch/cache metadata.
- `wifi_oss_extension_reload_tab_id_v1` - `chrome.storage.local`, transient tab id consumed after `extension.reload` so the same OSS tab can be refreshed post-reload.
- `wifi_oss_recycle_remote_auto_session_state_v1` - `sessionStorage`, minimal same-tab projection for auto-accepted remote devices/material so `swap-material` navigation can rehydrate.
- `wifi_oss_recycle_remote_debug_session_state_v1` - `sessionStorage`, minimal same-tab debug projection for remote-added devices/material enablement; cleared by Remote config debug `Clear`.
- `wifi_oss_cam_modules_missing_material_operation_id` - `sessionStorage`, operation id for showing the CAM missing-material helper only on the redirected operation page.
- `wifi_oss_debug_material_auto_continue_enabled` - `sessionStorage`, temporary debug/test override for material auto-continue (`"0"` means off; missing key means on).
- `wifi_oss_debug_recycle_device_required_enabled` - `sessionStorage`, temporary debug/test override for the recycle entry selected-device-required guard (`"0"` means off; missing key means on).
- `wifi_oss_serial_keyboard_debug` - `sessionStorage`, opt-in serial keyboard diagnostic logging (`"1"` means on).
- `obb_admin_token` - dashboard `sessionStorage`, admin token in dashboard UI only.

## Known Risks and Uncertainties

- `content.js` is large and multi-purpose; broad edits can break unrelated flows.
- Recycle daily reset is injection-time only, not a live midnight timer.
- Recycle reset clears shared category/device selection, but intentionally does not clear transient last-serial/pending-material keys.
- Recycle guard may need stronger event blocking if OSS uses competing capture listeners.
- GPON validation comment and implementation disagree.
- SAP material auto-continue may be too aggressive if a value is present for reasons other than OSS history.
- Material auto-continue debug toggle is a test helper, not a primary user workflow; if it causes OSS issues, it can be removed without changing the core material filtering behavior.
- `austrian` is now partially device-based; keep the no-selected-device legacy preset fallback until it is explicitly retired.
- CAM modules intentionally bypass material quick buttons only when `MaterialId` is empty; do not make this behavior global for other categories.
- Dashboard data can replace built-in material models.
- Real OSS DOM can differ from assumptions; do not rely only on guessed selectors.
- Some dashboard strings/category aliases show mojibake; verify before changing encoding-related behavior.

## Recent Regression Test Notes

Latest confirmed real-OSS checks:

- HX520 Home clipboard autofill fills SSID1, SSID2 with `_5G`, PSK1/PSK2, ports, and WiFi test on recycle-state WiFi forms.
- Reload Extension reloads the extension and refreshes the current OSS tab after confirmation.
- SharePoint OSSRecycleSchedule date/time widget renders in Bulgarian and does not start OSS recycle runtime on that page.
- Clipboard SSID/password autofill works.
- Label generation works.
- Austrian label generation works.
- CAM modules flow works.
- Recycle-specific material filtering works for the mapped categories.
- Selected recycle devices restrict mapped SAP/material quick-button grids to the valid per-flow selected devices/material IDs. Safe single-candidate selections can controlled-fill empty `MaterialId` or replace a mismatched OSS-prefilled value with the selected device catalog SAP/material; debug auto-continue `ON` may continue forward after that enforcement, while debug auto-continue `OFF` keeps the page visible.
- Austrian ADB/Huawei device cards, selected-device validation, and selected-device material fill are implemented; no selected Austrian device keeps the legacy preset fallback.
- `Material auto-continue` debug toggle works and no longer freezes the page.

Dev-only catalog sanity check:

- Run `node Extension/scripts/validate-recycle-catalog.js` after changing recycle devices, material IDs, image/help paths, validation profile IDs, or category help mappings.
- The script reads `Extension/content.js` as text, extracts catalog/help literals, and does not load into extension runtime or change behavior.
- Expected healthy result: `Result: PASS`.

Dev-only config fixture export:

- Main readiness command: `node Extension/scripts/check-recycle-config.js`.
- The readiness chain runs catalog sanity, fixture compare, fixture validation, and fixture loader adapter checks.
- Run `node Extension/scripts/export-recycle-config-fixture.js` when checking readiness for future packaged JSON/config work.
- The script reads `Extension/content.js` as text and writes JSON to stdout; it does not create runtime config files and is not loaded by the extension.
- Reference fixture path: `Extension/config/recycle-device-catalog.fixture.json`.
- Generate/update command: `node Extension/scripts/export-recycle-config-fixture.js > Extension/config/recycle-device-catalog.fixture.json`.
- Compare command: `node Extension/scripts/export-recycle-config-fixture.js --compare-fixture`.
- A mismatch means recycle catalog/config metadata changed and the fixture should be reviewed and updated intentionally.
- Mismatch output reports the first semantic path, for example `Mismatch at generatedMaterialFilters.austrian[1]`, plus expected/actual values.
- Exported top-level keys: `schemaVersion`, `revision`, `devices`, `categoryHelp`, `validationProfiles`, `generatedMaterialFilters`.
- The exporter also guards expected top-level keys, `devices.length` versus catalog count, Austrian material filter order `1200017460, 1200017462`, and GPON material order `1200014928, 118560, 118563, 118564, 122933, 122944`.
- Source of truth remains `Extension/content.js`; the extension runtime does not load this fixture and `manifest.json` is not involved.
- Future runtime packaged JSON loading is blocked until validator and fixture compare pass, schema/merge/fallback are documented, `manifest.json` exposure is reviewed, and a manual regression plan covers recycle category panel, selected-device validation/help/material fill, Austrian, CAM, modems, clipboard, labels, and barcodes.
- `validate-recycle-config-fixture.js` validates the JSON fixture shape/data by default, using `Extension/config/recycle-device-catalog.fixture.json`.
- Candidate JSON exported by a future local configurator can be checked with `node Extension/scripts/validate-recycle-config-fixture.js --input path/to/candidate.json`.
- Candidate mode validates schema/shape/data but does not require exact parity with current `Extension/content.js`.
- `load-recycle-config-fixture.js` proves the fixture can be loaded and normalized into future in-memory adapter shape without creating runtime dependency.

## Working with Real OSS Pages / Missing DOM Context

The real OSS pages are reachable only through the corporate environment. If a live selector, field state, or workflow is uncertain, do not guess with high confidence. Ask the user for concrete evidence.

Useful evidence to request:

- Screenshot of the page.
- Screenshot before and after pressing a specific button.
- HTML/DOM snippet around the target field or button.
- Attributes for target elements: `id`, `name`, `class`, `type`, `value`, `disabled`, `readonly`, `data-*`.
- HTML of the parent container around the form/buttons.
- Visible button texts.
- Exact URL/path or visible title of the OSS step.
- What happens after pressing a button.
- Whether a field is empty, prefilled by OSS, filled by the extension, `readonly`, or `disabled`.
- DevTools console errors.

When the user sends a screenshot or DOM snippet, map it back to the likely code area: function, selector, event listener, storage key, and injection logic. Prefer stable selectors in this order when possible: explicit `id`, stable `name`, nearby label text + form structure, stable button text, then class/style-based selectors only as a last resort.

## Real OSS Verification Before Implementation

Before changing recycle/material behavior, verify:

- The recycle entry page root really is `_wflowEnterDeviceDataForRecycle`.
- The serial input really is `_wflowEnterDeviceDataForRecycle_SerialNo`.
- The continue/save control really is `_wflowEnterDeviceDataForRecycle_save`.
- Invalid category/serial cannot continue by click, Enter, or form submit.
- The reset button is visible in the target page and fully clears the visible selected state.
- The material step root/input/save selectors match the current OSS DOM.
- Whether prefilled material input always means OSS found history.
- Whether empty material input always means no SAP/material history.
- Whether material input should be `readonly` or `disabled` for the business process.
- Which exact material devices should be visible for each recycle category.
- `CAM Модули` should have no serial format validation, should return to the main operation when material history is missing, and must not automatically click service termination.
