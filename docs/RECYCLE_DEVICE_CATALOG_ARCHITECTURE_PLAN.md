# Recycle Device Catalog Architecture Plan

**Status:** Architecture / implementation planning bridge  
**Related concept:** `docs/RECYCLE_DEVICE_CATALOG_CONCEPT_EN.md`  
**Scope:** Local-first recycle device catalog, validation profiles, multi-select direction, SAP/material mapping, help menu, and future dashboard config layer.  
**Implementation rule:** This document is a roadmap. It does not describe behavior that is already fully implemented unless stated explicitly.

## 1. Current state and invariants

`Extension/content.js` remains the main runtime file for the Chrome Manifest V3 extension. It currently owns recycle entry category selection, serial validation, SAP/material quick buttons, dashboard polling for material models, CAM Modules special handling, label/barcode generation, and clipboard SSID/password autofill.

The current recycle flow already has these important foundations:

- the user selects a recycle category for the workday;
- category selection is stored locally and is used for serial validation;
- after category selection, read-only device cards can be shown for categories that already have local catalog entries;
- SAP/material quick buttons can be filtered by selected recycle category;
- 16:9 images are available for recycle device cards;
- Netbox serials currently validate as IMEI: 15 digits plus Luhn check;
- `CAM Модули` block empty serials but do not apply strict serial format validation;
- Austrian behavior includes special material filling logic and must not be treated as an ordinary material button case.

Runtime invariants:

- the extension must remain local-first;
- local fallback behavior must work when the dashboard is offline, invalid, slow, missing, or not deployed;
- dashboard config must never be required for the recycle flow to work;
- risky OSS runtime mechanisms should remain controlled locally in the extension;
- existing behavior must not be broken: clipboard autofill, label/barcode generation, Austrian label generation, CAM Modules flow, SAP/material quick buttons, material auto-continue debug toggle, serial keyboard normalization, and current serial validation.

## 2. Local device catalog schema

The local device catalog should become the source of truth before dashboard work begins. It should describe business devices, not only SAP/material IDs.

Recommended future device shape:

```js
{
  deviceId: "zte_g5b1",
  categoryId: "netbox",
  displayName: "ZTE G5B",
  materialId: "124173",
  legacyMaterialIds: [],
  imagePath: "images/devices/16x9/ZTE_G5B1_5G-removebg-preview.webp",
  helpImagePath: "images/recycle-help/netbox-zte-g5b1.webp",
  warningText: "",
  validationProfileId: "imei15_luhn",
  enabled: true
}
```

Recommended category shape:

```js
{
  categoryId: "netbox",
  displayName: "Netbox",
  imagePath: "images/categories/16x9/netbox.webp",
  defaultValidationProfileId: "imei15_luhn",
  enabled: true
}
```

Schema rules:

- `deviceId` is the stable identity and must not be a SAP/material number or free display name.
- `categoryId` must match a known local category.
- `materialId` is a business value used for OSS material filling, not identity.
- `legacyMaterialIds` can support old SAP IDs, aliases, `BG...` formats, or renamed material IDs.
- `validationProfileId` should reference a predefined local validation profile.
- `enabled: false` should hide a device from normal selection without deleting its history from the catalog.
- Paths should point to packaged extension assets unless a validated dashboard override provides a remote image.

Local JSON/config may make sense later, but only after the schema is stable. In a Chrome MV3 extension, fetching a packaged JSON file from a content script is possible through `chrome.runtime.getURL()`, but the file may need to be declared in `web_accessible_resources`. That would be a deliberate manifest change and should not be done casually.

Dashboard data should not be written back to packaged local config files. A Chrome extension cannot safely treat its packaged files as mutable runtime storage. The safer model is local packaged config plus validated in-memory remote overrides.

## 3. Selected category/device state

Current state stores the selected recycle category locally for the current tab/session and uses a local date value to avoid carrying a category across workdays.

Future state should still be local-first and should avoid introducing storage keys until the behavior is designed and tested. When selection state is expanded, it should include:

- selected `categoryId`;
- selected `deviceId` values for that category;
- local workday date;
- last valid serial for the next material step;
- pending material context only when needed for the next OSS step.

Implemented state note:

- selected category is now shared across OSS tabs/windows through `localStorage`;
- selected device IDs are stored in `wifi_oss_recycle_entry_selected_devices` as a JSON array of `deviceId` strings;
- selected devices are cleared when the category changes, on Reset, and on daily reset;
- `sessionStorage` remains for transient flow state such as last valid serial and pending material context;
- clipboard SSID/password autofill storage is separate from recycle selection storage.

State rules:

- category selection remains required before Continue;
- selected devices should be cleared when the category changes;
- daily reset should clear selected category and selected devices;
- Reset should clear visible selection, validation messages, help menu state, and safe pending recycle context;
- shared state is intentionally scoped to OSS tabs/windows for the same browser origin.

## 4. Future multi-select behavior

After a category is selected, the right-side card area should represent concrete devices in that category. The user should be able to select one or more devices.

Implemented multi-select behavior is conservative:

- device cards can be visually multi-selected;
- selection is shared across OSS tabs/windows for the same browser origin;
- no selected devices keeps category-level validation active;
- selected devices activate predefined local validation profiles when implemented;
- SAP/material quick-button filtering and controlled fill use the valid per-flow material snapshot saved after recycle Continue;
- when the valid snapshot has selected devices, the SAP/material quick-button grid is restricted to those selected devices/material IDs;
- if exactly one safe selected-device Material ID candidate exists and OSS `MaterialId` is empty, the extension auto-fills it and then applies the existing material auto-continue behavior;
- if selected devices exist but there is no single safe Material ID candidate, the extension does not auto-fill or auto-continue and asks the operator to choose the device;
- no selected devices keeps category-level SAP/material filtering active;
- selected-device help images are preferred where available, with category-level help fallback;
- selecting no concrete device keeps category-level validation and SAP/material filtering behavior.

Recommended first rule:

```text
category selected, no devices selected -> category-level behavior
category selected, one or more devices selected -> selected-device validation profiles can apply; SAP/material uses the valid per-flow selected-device snapshot; help can use selected-device context where available
```

This keeps selected-device state useful while preserving category-level fallbacks where no concrete device was selected.

## 5. Validation profiles and OR logic

Validation should become declarative but remain locally controlled. The dashboard must not send arbitrary JavaScript, arbitrary regex, or unreviewed logic that can block operators unexpectedly.

`docs/RECYCLE_DEVICE_VALIDATION_RULES.md` is the human-authored source/input for validation profiles. It may mention devices that are not yet in `RECYCLE_DEVICE_CATALOG_RAW`; only predefined local profiles implemented in `Extension/content.js` are runtime behavior.

Recommended model:

```js
{
  validationProfileId: "netbox_imei",
  commonRules: ["required", "no_cyrillic", "keep_focus_on_invalid"],
  anyOf: [
    { rule: "imei15_luhn" }
  ]
}
```

OR logic should be explicit through `anyOf`:

```js
{
  validationProfileId: "modem_serial",
  commonRules: ["required", "no_cyrillic", "keep_focus_on_invalid"],
  anyOf: [
    { rule: "digits_prefix", prefix: "0099" },
    { rule: "saap_sapp_optional_dash" },
    { rule: "dash_at_position", position: 6 }
  ]
}
```

Common rules:

- serial must not be empty;
- Cyrillic must be blocked or warned;
- special characters should be rejected where applicable;
- serial input should keep focus when invalid;
- invalid values should block Continue by click, Enter, and form submit.

Current selected-device runtime behavior:

- no selected devices -> current category-level `validateRecycleSerial(...)` fallback;
- one selected device -> use the device's implemented predefined `validationProfileId`;
- multiple selected devices -> OR logic, where at least one selected device profile must pass;
- selected device with no implemented profile -> safe category-level fallback;
- empty serial and Cyrillic checks remain common guards and must not be bypassed.

Currently implemented predefined profiles include Android B866 `BG` + 15 digits, Android DV9161 16 digits, STB ZXV B700v5 12 digits, Xplore/Zapper plain 12-hex MAC, DTH 11 digits with `00` prefix, Netbox IMEI 15 + Luhn, selected GPON 16 alphanumeric, selected TP-Link/Deco/HX520 routers 13 alphanumeric, and ZTE H3601P `ZTE` prefix + 15 characters.

Specific rules:

- category-level profiles remain the first migration target;
- device-level profiles should be added only after reliable business rules are confirmed;
- Netbox remains `15 digits + Luhn` unless business rules change;
- `CAM Модули` keeps only the shared empty-field guard unless specific rules are confirmed.

Validation migration should include a parity checklist: every current category rule must map to a profile and produce the same pass/fail result before behavior changes are allowed.

## 6. SAP/material mapping strategy

SAP/material behavior should gradually move from scattered hardcoded category allowlists toward catalog-driven mapping.

Recommended progression:

1. Local device catalog owns `materialId` and `legacyMaterialIds`.
2. Category material filters are generated from local catalog devices.
3. When multi-select is active, material filters can prefer or restrict to selected `deviceId` values.
4. Dashboard may later override or extend non-dangerous device metadata, but must not replace the local catalog wholesale.

Important rules:

- `materialId` is not identity; `deviceId` is identity.
- Missing dashboard data must not remove local material buttons.
- Remote dashboard entries should merge into known local devices or add explicitly enabled external devices after validation.
- Prefilled OSS `MaterialId` auto-continue behavior should remain unchanged until there is evidence it is wrong.
- `cam_modules` missing-material behavior must stay separate from normal material quick buttons.

Current selected-device material behavior:

```text
OSS MaterialId prefilled -> preserve current auto-continue rules
MaterialId empty + selected devices exist + one safe candidate -> auto-fill, warn, then apply existing material auto-continue logic
MaterialId empty + selected devices exist + no single safe candidate -> selected-only quick buttons, warning, no auto-fill, no auto-continue
MaterialId empty + no selected devices -> category-level material filtering
Unknown/unmapped category -> keep existing full-list fallback
```

Prefilled OSS `MaterialId` values are not overwritten. `CAM Модули` missing-material behavior remains a separate breadcrumb redirect flow and must not be generalized to normal categories. Known low-priority UI follow-up: after choosing a quick button in the ambiguous multi-select case, the warning can disappear and the layout can shift slightly.

## 7. Austrian special behavior

Austrian devices need special handling in the catalog and material architecture. At least one Austrian ADB Modem case has an empty material field and the extension currently fills it.

Recommended model:

```js
{
  deviceId: "austrian_adb_modem",
  categoryId: "austrian",
  displayName: "Austrian ADB Modem",
  materialStrategyId: "austrian_serial_prefix",
  validationProfileId: "austrian_min16_alnum",
  enabled: true
}
```

The current Austrian material strategy can be represented locally as trusted logic:

```text
serial starts with PI -> material 1200017460
otherwise -> material 1200017462
```

Rules:

- this logic should remain local trusted code, not dashboard-defined script;
- dashboard may label/configure Austrian devices later, but should not define arbitrary material functions;
- Austrian devices should be documented separately from normal SAP/material quick-button devices;
- regression tests must include Austrian label generation and Austrian material filling.

## 8. CAM Modules invariants

`CAM Модули` must remain a special flow.

Invariants:

- empty serial is blocked;
- non-empty serial is not format-validated unless future business rules require it;
- if OSS prefilled `MaterialId`, current auto-continue behavior can remain;
- if `MaterialId` is empty, the extension redirects back to the main recycle operation through the breadcrumb;
- the helper text is shown only for the matching stored operation id;
- the extension must not click `Служебно прекратяване`;
- CAM missing-material behavior must not be generalized to other categories;
- CAM DOM/navigation behavior must remain local runtime logic, not dashboard config.

## 9. Help menu by selected device

The help UI now has two separate modes:

- automatic floating preview after invalid non-empty serial input;
- manual full help menu opened from the yellow help button.

Both modes are visual guidance only. They must not dynamically alter serial values, SAP/material values, validation behavior, or OSS navigation.

Implemented behavior:

- each device may have `helpImagePath`;
- Android/IPTV currently has device-level help images;
- selected devices with `helpImagePath` are preferred;
- when multiple selected devices have help images, show only those selected-device help images;
- if no device is selected, or selected devices have no help images, fall back to category-level help content;
- the floating preview auto-hides after about 5 seconds and hides on outside click;
- the manual full help menu stays separate and opens only from the help button.

Future work:

- add more `helpImagePath` entries as packaged help assets become available;
- preserve category fallback until device help coverage is complete;
- keep the UI as simple help cards unless a stronger reason appears for tabs or carousel behavior.

## 10. Dashboard as optional config layer

The dashboard should become a remote admin/config layer only after local recycle/device/validation behavior is stable.

Core principle:

```text
packaged local config -> always works
remote dashboard config -> optional validated override/extension
```

Dashboard config may later manage:

- display names;
- enabled/disabled status;
- material IDs and aliases;
- warning text;
- device images and help images;
- simple assignment of predefined validation profiles;
- config version/revision.

Dashboard config should not manage yet:

- DOM selectors;
- OSS navigation behavior;
- CAM flow logic;
- auto-continue logic;
- clipboard parsers;
- keyboard normalization;
- label/barcode generation;
- arbitrary JavaScript or arbitrary regex validation.

Recommended merge rules:

- validate remote payload shape and version before use;
- merge remote fields into known local devices by `deviceId`;
- allow remote-added devices only if they pass strict schema validation;
- never replace the entire local catalog with remote data;
- if remote config is invalid, keep local config and log a warning;
- consider `chrome.storage.local` cache later only after adding the `storage` permission intentionally.

## 11. Local dashboard testing and deployment options

Local dashboard testing should come before external deployment. The goal is to test the dashboard on a laptop without making the extension depend on it.

Local laptop testing:

- URL changes to `http://localhost:<port>` or `http://127.0.0.1:<port>`;
- port is usually `3000`, unless occupied;
- environment variables include `PORT` and `ADMIN_TOKEN`;
- persistent storage is local files under the dashboard data directory;
- uploaded images live under local uploads;
- extension access may require host permission or background fetch changes if used by the extension;
- local testing should be treated as development-only.

Render:

- URL becomes a public HTTPS URL;
- `PORT` is assigned by the platform;
- `ADMIN_TOKEN` must be configured as an environment variable;
- local file uploads may not be persistent on free/ephemeral storage;
- backups and persistent storage need an explicit plan;
- cold starts/free-tier sleep can slow first request;
- rollback depends on deploy history and data backup.

Company laptop/PC inside internal network:

- URL becomes internal IP or DNS name plus port;
- firewall must allow access;
- machine must stay powered on;
- Windows updates/restarts can stop the service;
- backups and auto-start need setup;
- useful for pilot testing but fragile as production infrastructure.

Raspberry Pi / Mini PC:

- URL becomes internal IP/DNS plus port;
- should use stable storage, preferably SSD;
- needs service auto-start, backups, and firewall configuration;
- avoids dependence on a personal laptop;
- viable for small internal tool if IT-managed infrastructure is unavailable.

Internal VM/server:

- best long-term corporate option;
- URL should use internal DNS and preferably HTTPS;
- environment variables and secrets should be managed by infrastructure;
- backups, monitoring, access control, and rollback are easier to formalize;
- requires IT cooperation and deployment process.

Deployment changes to document before real use:

- base URL;
- port;
- environment variables;
- persistent storage location;
- uploaded image storage;
- admin token handling;
- backup and restore process;
- extension access/host permissions;
- security model;
- rollback process.

## 12. Milestones

Recommended next milestones:

1. **Documentation and architecture lock-in**
   - Keep this plan and project map current.
   - Confirm catalog schema, validation profile model, and dashboard merge rules before implementation.

2. **Local catalog schema hardening**
   - Expand local catalog fields in a controlled patch.
   - Preserve current behavior.
   - Generate current category material filters from catalog data.

3. **Selected device state and multi-select UI**
   - Add selectable device cards.
   - Keep validation and SAP behavior category-level at first.
   - Add reset/daily reset handling for selected devices.

4. **Validation profile engine**
   - Convert existing category validation into predefined local profiles.
   - Add OR logic with parity tests/manual parity checklist.
   - Keep Netbox IMEI behavior unchanged.

5. **SAP/material mapping from selected devices**
   - Implemented current behavior: valid per-flow selected-device snapshots restrict quick buttons to selected devices/material IDs, safe single candidates auto-fill empty `MaterialId`, and ambiguous selected-device candidates warn without auto-fill or auto-continue.
   - Preserve prefilled `MaterialId`, no-selected category-level filtering, Austrian no-selected legacy fallback, and CAM behavior.
   - Keep dashboard optional.

6. **Help menu by selected device**
   - Add `helpImagePath` support.
   - Show help only for selected devices where available.
   - Preserve category fallback until device help coverage is complete.

7. **Dashboard config layer**
   - Rebuild only after local logic is stable.
   - Start with local dashboard testing.
   - Add remote config validation and in-memory merge.

## 13. Test gates

Before any recycle/material implementation patch is considered done:

- `git diff` is reviewed for scope creep;
- `Extension/content.js` changes are small and localized;
- no unrelated dashboard, image, manifest, or storage-key changes are included;
- current serial validation behavior is checked for every category;
- invalid serials block Continue by click, Enter, and form submit;
- invalid serial keeps focus in the serial input;
- Cyrillic warning/block behavior still works;
- Netbox IMEI Luhn validation still works;
- `CAM Модули` empty serial is blocked and non-empty serial is not format-validated;
- CAM missing-material redirect still uses breadcrumb and does not click `Служебно прекратяване`;
- Austrian material behavior and Austrian label generation still work;
- SAP/material quick buttons still render and fill the input;
- material auto-continue debug toggle still works;
- clipboard SSID/password autofill still works;
- warehouse/recycle label and barcode generation still works.

Manual OSS evidence is required when selector or behavior assumptions are uncertain:

- screenshot;
- DOM snippet;
- field/button `id`, `name`, `class`, `type`, `value`, `disabled`, `readonly`, `data-*`;
- parent container HTML;
- visible button text;
- URL/path/title of the OSS step;
- observed click/Enter behavior;
- DevTools console errors.

## 14. Open questions

- Should "no selected devices" after choosing a category mean "all category devices" or "must select at least one device"?
- Which exact Austrian devices exist and which material strategy applies to each?
- Are there Austrian devices that should never show normal material quick buttons?
- Is OSS-prefilled `MaterialId` always safe to auto-continue?
- Should local catalog eventually live as a packaged JSON file, or remain as JS constants until dashboard architecture is ready?
- If packaged JSON is used, when should `manifest.json` be updated for web-accessible resources?
- Should remote dashboard config be cached in `chrome.storage.local`, or only used for the current session?
- What is the acceptable fallback when dashboard disables a device that still exists locally?
- Which device-level validation rules are confirmed by business evidence rather than guessed from examples?
- How should legacy/alias SAP IDs be displayed in UI, if at all?
- What is the final admin role split between `admin` and `root`?
- Which deployment target is acceptable for real dashboard usage: Render, internal machine, Mini PC, or internal VM/server?

## 15. What not to implement yet

Do not implement yet:

- dashboard rebuild as the next step;
- remote-first config;
- dashboard writing back to local extension config files;
- arbitrary dashboard-defined validation logic, regex, or JavaScript;
- moving DOM selectors into dashboard config;
- moving OSS navigation behavior into dashboard config;
- moving CAM flow, auto-continue, clipboard parsers, keyboard normalization, or label/barcode generation into dashboard config;
- new storage keys without a dedicated state design;
- `manifest.json` changes for local JSON/assets until the schema and loading model are approved;
- broad SAP/material behavior changes beyond the current selected-device snapshot filtering/fill behavior;
- new device-level validation profiles before business rules are confirmed;
- broad refactors of `Extension/content.js`;
- dashboard deployment/security work before local extension behavior is stable.
