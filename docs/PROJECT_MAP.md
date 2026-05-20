# OSS Assistant Project Map

## Overview

`OSS Assistant` is an internal Chrome Manifest V3 extension for A1 OSS portal workflows. It is loaded with Chrome `Load unpacked` from the `Extension/` directory and injects `content.js` into internal OSS pages. The current development focus is the recycle-device entry workflow: choosing a device category for the workday, validating the serial number, and guiding the next SAP/material step with quick-fill material buttons.

The project also contains older/secondary workflows for clipboard-based Wi-Fi autofill and label/barcode printing. They are not the current focus, but they are active runtime behavior and should be protected from regressions.

For future recycle redesign/device catalog work, read `docs/RECYCLE_DEVICE_CATALOG_CONCEPT_EN.md` before planning changes. It is a concept/roadmap document and must not be treated as current implemented behavior.

For future device catalog architecture, validation profiles, multi-select, SAP/material mapping, help menu, or dashboard config layer work, also read `docs/RECYCLE_DEVICE_CATALOG_ARCHITECTURE_PLAN.md`. It is the current bridge between the concept document and future implementation tasks.

For future work on moving hardcoded recycle metadata out of `content.js`, read `docs/RECYCLE_DEVICE_CONFIG_ARCHITECTURE.md`. It defines the local config, packaged JSON, dashboard override, cache, and blocked-runtime-behavior rules.

When adding new local recycle devices to the catalog, read `docs/RECYCLE_DEVICE_ADDING_GUIDE.md` first. It documents required fields, optional contract fields, naming rules, image rules, and test gates for safe catalog additions.

For device-level validation profile work, read `docs/RECYCLE_DEVICE_VALIDATION_RULES.md`. It is a human-authored input file for predefined local validation profiles; part of it is now implemented only when concrete recycle devices are selected.

## Project Structure

- `Extension/manifest.json` - Chrome MV3 manifest. Defines permissions, internal OSS matches, background service worker, content script, and web-accessible image assets.
- `Extension/background.js` - MV3 service worker. Handles toolbar-click injection and proxies dashboard fetches/image downloads for `content.js`.
- `Extension/content.js` - main extension runtime. It contains clipboard parsing/autofill, button injection, label/barcode printing, device-function UI, SAP/material quick buttons, dashboard polling, and recycle entry validation.
- `Extension/images/` - extension icons, label templates, and image assets.
- `Extension/images/devices/` - packaged device images used by SAP/material quick buttons.
- `Extension/images/categories/` - category card images used by the recycle entry category panel.
- `Extension/dashboard/` - Express dashboard/API for managing material models, categories, and uploaded/remote images.
- `Extension/dashboard/data/models.json` - local dashboard data store for material models.
- `Extension/scripts/` - dev-only helper scripts. `validate-recycle-catalog.js` validates the local recycle catalog and help image mappings without loading into extension runtime.
- `.gitignore` - ignores archives, dependencies, `.env` files, and OS files.

Old `.zip` backup/export files are not part of the extension runtime. Ignore them unless a future task explicitly asks to inspect an archive.

## Manifest and Domains

`Extension/manifest.json` declares:

- `manifest_version`: `3`
- `permissions`: `clipboardRead`, `scripting`
- content script: `content.js`, loaded at `document_idle`
- background service worker: `background.js`
- OSS matches/host permissions:
  - `https://oss.a1.bg/*`
  - `https://oss.mobiltel.bg/*`
  - `https://srvvm-webtst-0.mobiltel.bg/*`
- dashboard host permission:
  - `https://oss-assistant.onrender.com/*`
- web-accessible resources:
  - `images/*.svg`
  - `images/*.png`
  - `images/devices/*.webp`
  - `images/categories/*.webp`

Any new packaged images must be under these existing paths or `manifest.json` must be intentionally updated.

## Runtime Entry Points

### `background.js`

The background service worker does two things:

- On extension action click, injects `content.js` into the current tab via `chrome.scripting.executeScript`.
- Handles messages from `content.js`:
  - `swapMaterial.fetchModels` fetches dashboard JSON.
  - `swapMaterial.fetchImageDataUrl` fetches remote images and returns data URLs.

This bridge avoids mixed-content/CORS issues when OSS pages are HTTPS and dashboard resources are external.

### `content.js`

`content.js` is wrapped in an IIFE and guarded by `window.__wifiOssAssistantInjected` to avoid duplicate injection. At the bottom it starts all active behaviors:

- `loadLastClipboardText()`
- `injectButton()`
- `startLabelsObservers()`
- `startSwapMaterialObserver()`
- `startSwapMaterialDashboardPolling()`
- `startDeviceFunctionsObserver()`
- `startRecycleEntryObserver()`

Because this file is monolithic and powers multiple workflows, changes should be small and targeted.

## Functional Map

### Clipboard SSID/Password Autofill

Main functions/values:

- `AUTO_MODE_KEY`: `wifi_oss_auto_mode_enabled`
- `LAST_CLIPBOARD_KEY`: `wifi_oss_last_clipboard_text`
- `deviceConfig`
- `detectDeviceModel`
- model-specific parsers: `parseForH3601P`, `parseForMF296R`, `parseForMF283U`, `parseForMF293N`, `parseForEX220`, `parseForG5B`
- `genericParse`, `normalizeA1Base`, `normalizeZeros`
- `fillOssForm`
- `injectButton`, `setAutoMode`, `autoLoopTick`

Behavior:

- Adds `ПОПЪЛНИ`, `АВТОМАТИЧНО`, and `RESET` buttons near existing OSS `Запази`/`Продължи` buttons.
- Reads clipboard manually or in auto mode.
- Recognizes device text by model keywords and parses SSID/password/ports/5G details.
- Fills OSS fields by stable IDs first, then by label/table proximity fallback.
- Auto mode processes only recognized clipboard text and avoids processing hidden/unfocused tabs.

Important autofill selectors/IDs:

- `_wflowRecycleState_PortCount`, `_correctWifiSettings_PortCount`
- `_wflowRecycleState_CheckWifi`, `_correctWifiSettings_CheckWifi`
- `_wflowRecycleState_Ssid1`, `_correctWifiSettings_Ssid1`
- `_wflowRecycleState_Ssid2`, `_correctWifiSettings_Ssid2`
- `_wflowRecycleState_Psk1`, `_correctWifiSettings_Psk1`
- `_wflowRecycleState_Psk2`, `_correctWifiSettings_Psk2`
- `_correctWifiSettings_CustomRequest`
- `_correctWifiSettings_save`

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
- For recycle lists, selected checkbox rows are preferred; if none selected, it prints all.

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
- `xplore_zapper` - `XPLORE & Zapper`
- `dth_kaon_nagra` - `DTH Kaon & Nagra`
- `austrian` - `Австрийски`
- `netbox` - `Netbox`
- `routers` - `Рутери`
- `gpon` - `GPON`
- `cam_modules` - `CAM Модули`
- `modems` - `Модеми`

Each category has a card/button with an image from `images/categories/` except `modems`, which uses the Technicolor device image.
`cam_modules` uses `Extension/images/categories/CAM_modules.webp`.

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

After a category is selected, mapped categories render concrete device cards in the right-side area. Device cards use 16:9 packaged images where available, fall back safely, and can be visually multi-selected. Multi-select currently affects validation context, recycle help context, and SAP/material quick-button ordering. SAP/material filtering remains category-level.

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

### Storage Keys

Recycle entry storage:

- `wifi_oss_recycle_entry_category` in `localStorage`
- `wifi_oss_recycle_entry_category_date` in `localStorage`
- `wifi_oss_recycle_entry_selected_devices` in `localStorage`, JSON array of selected `deviceId` strings
- `wifi_oss_recycle_entry_last_serial` in `sessionStorage`
- `wifi_oss_recycle_entry_pending_material` in `sessionStorage`
- `wifi_oss_recycle_entry_material_snapshot` in `sessionStorage`, per-flow category/device/material/serial/date context for the next SAP/material step

The selected category and selected devices are shared across OSS tabs/windows for the same browser origin. `sessionStorage` remains for transient recycle flow state such as the last valid serial, pending material context, and the per-flow material snapshot. Clipboard SSID/password autofill has its own storage and is not part of this recycle selection flow.

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

Risk/TBD: this reset happens when the panel injects/renders. If an OSS tab stays open across midnight without reload/navigation/reinjection, the already-rendered panel may keep its old `panel.dataset.wifiOssRecycleSelected`.

### Reset Button

The `RESET` button is created by the generic `injectButton()` flow, not by `injectRecycleEntryCategoryPanel()`.

On click it:

- removes `wifi_oss_recycle_entry_category`
- removes `wifi_oss_recycle_entry_category_date`
- removes `wifi_oss_recycle_entry_selected_devices`
- removes the legacy category value from `sessionStorage`
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
- If the serial is invalid for the current category/device context, prevents continuing, shows the validation message, focuses/selects the serial input.
- If valid, stores `wifi_oss_recycle_entry_last_serial` and sets `wifi_oss_recycle_entry_pending_material` to `1` for the next material step.

Validation behavior:

- no selected devices -> current category-level `validateRecycleSerial(...)` fallback;
- one selected device -> implemented predefined local `validationProfileId` is used when available;
- multiple selected devices -> OR logic, where the serial is valid if at least one selected device profile accepts it;
- selected device with no implemented profile -> safe fallback to category-level validation;
- empty serial and Cyrillic checks are common guards and are not bypassed by OR logic.

### Serial Keyboard Layout Protection

- `_wflowEnterDeviceDataForRecycle_SerialNo` protects scanner input from active BG keyboard layouts.
- Trusted `keydown` events with a single Cyrillic `event.key` and known `KeyboardEvent.code` are normalized only for clear cases: `KeyA`..`KeyZ` -> `A`..`Z`, and `Semicolon` + `Shift` -> `:`.
- Normal Latin/digit input is left unchanged. Paste or unknown Cyrillic input is not auto-corrected; it keeps the warning/block fallback.
- Opt-in serial keyboard diagnostics use `sessionStorage.setItem("wifi_oss_serial_keyboard_debug", "1")` and expose `window.__wifiOssSerialDebugEvents` plus `wifi_oss_serial_keyboard_debug_events`.

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
  - Must be at least 16 alphanumeric characters.
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

### Existing SAP Value and Auto-Continue

`autoContinueSwapMaterialIfReady`:

- If material input has a non-empty normalized value, it normalizes the field and clicks the save/continue button once.
- This likely supports the case where OSS already found material history.
- This behavior is intentionally preserved for `cam_modules` when OSS has already populated `MaterialId`.

Debug/test toggle:

- `wifi_oss_debug_material_auto_continue_enabled` in `sessionStorage` controls a temporary test override.
- Missing key/default state means material auto-continue is `ON`.
- Value `"0"` means material auto-continue is `OFF` for the current tab/session.
- The small `Debug: Material auto-continue ON/OFF` control is injected through the existing recycle entry and SAP/material panels, not through a separate global observer or floating panel.
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
- `refreshSwapMaterialModelsFromDashboard` polls `https://oss-assistant.onrender.com/api/models`.
- If dashboard returns a valid non-empty model signature, it replaces `swapMaterialModels`.

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

Behavior for mapped categories:

- Only allowlisted material buttons are rendered.
- The button order follows the allowlist order.
- If one or more recycle devices are selected in the current category, their matching material buttons are shown first when present in the current material model list.
- After a valid recycle serial Continue, a per-flow material snapshot is saved in `sessionStorage`; the SAP/material grid uses a valid snapshot for selected-device ordering before falling back to live shared selected devices.
- `getRecycleMaterialFillCandidate(...)` can calculate a future controlled fill candidate from the snapshot and current material model list, returning `{ ok, materialId, reason }`; it does not fill `MaterialId` or change auto-continue behavior.
- Selected devices do not auto-fill `MaterialId`.
- Selected devices do not restrict the grid to selected devices only; all category-allowlisted buttons remain available.
- The broad chips `all` / `internet` / `tv` / `other` are hidden.
- Search stays scoped to the rendered allowlisted devices.
- There is no fallback to all devices when a mapped category is active; if a dashboard-provided model is missing, the matching button will be absent.

Unmapped categories keep the older full-list behavior.

Known gap:

- `austrian` is currently unmapped/TODO because the target material device still needs to be added or clarified.
- `cam_modules` is a separate flow. With empty `MaterialId`, it redirects back to the operation page and does not use the quick-buttons grid.
- Controlled fill candidates currently skip `cam_modules`, `modems`, and `austrian` while Austrian remains on the legacy preset behavior.

### Likely Future Change Points for Recycle-Based Material Filtering

Most likely code areas:

- Recycle category storage/constants around `RECYCLE_ENTRY_SELECTED_KEY`.
- `injectSwapMaterialButtons`, especially the initial `activeCategory`, model button creation, and `applyFilter`.
- `SWAP_MATERIAL_RECYCLE_FILTERS`, the explicit mapping between recycle categories and normalized material IDs.
- `SWAP_MATERIAL_MODELS_DEFAULT` and/or dashboard model schema if more precise grouping is needed than `internet`/`tv`/`other`.
- `applyRecycleCategoryMaterialPreset` if future category behavior should auto-fill, skip, or trigger another OSS action.

## Dashboard/API Dependency

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
- Dashboard data can replace the built-in material list. If remote dashboard data is incomplete, some default quick buttons may disappear.
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
- `wifi_oss_recycle_entry_last_serial` - `sessionStorage`, serial saved before material step.
- `wifi_oss_recycle_entry_pending_material` - `sessionStorage`, flag for material preset step.
- `wifi_oss_recycle_entry_material_snapshot` - `sessionStorage`, per-flow category/device/material/serial/date snapshot used for SAP/material button ordering and future controlled auto-fill.
- `wifi_oss_cam_modules_missing_material_operation_id` - `sessionStorage`, operation id for showing the CAM missing-material helper only on the redirected operation page.
- `wifi_oss_debug_material_auto_continue_enabled` - `sessionStorage`, temporary debug/test override for material auto-continue (`"0"` means off; missing key means on).
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
- `austrian` material filtering is still unmapped/TODO until the target device/material is clarified.
- CAM modules intentionally bypass material quick buttons only when `MaterialId` is empty; do not make this behavior global for other categories.
- Dashboard data can replace built-in material models.
- Real OSS DOM can differ from assumptions; do not rely only on guessed selectors.
- Some dashboard strings/category aliases show mojibake; verify before changing encoding-related behavior.

## Recent Regression Test Notes

Latest confirmed real-OSS checks:

- Clipboard SSID/password autofill works.
- Label generation works.
- Austrian label generation works.
- CAM modules flow works.
- Recycle-specific material filtering works for the mapped categories.
- Selected recycle devices are prioritized first in mapped SAP/material quick-button grids without auto-fill or selected-only restriction.
- `Material auto-continue` debug toggle works and no longer freezes the page.

Dev-only catalog sanity check:

- Run `node Extension/scripts/validate-recycle-catalog.js` after changing recycle devices, material IDs, image/help paths, validation profile IDs, or category help mappings.
- The script reads `Extension/content.js` as text, extracts catalog/help literals, and does not load into extension runtime or change behavior.
- Expected healthy result: `Result: PASS`.

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
