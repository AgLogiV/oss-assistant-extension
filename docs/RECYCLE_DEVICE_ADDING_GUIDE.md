# Recycle Device Adding Guide

**Status:** Practical guide  
**Scope:** Safe additions to the local recycle device catalog in `Extension/content.js`  
**Related docs:** `docs/RECYCLE_DEVICE_CATALOG_CONCEPT_EN.md`, `docs/RECYCLE_DEVICE_CATALOG_ARCHITECTURE_PLAN.md`

## 1. Purpose

This guide explains how to safely add a new recycle device to the local device catalog without breaking recycle UI, SAP/material filtering, validation, images, CAM Modules, or dashboard fallback behavior.

The current extension is local-first. New devices should be added to the local catalog first. Dashboard/config work can come later, after local behavior is stable.

## 2. Where the device catalog currently lives

The local recycle device catalog currently lives in `Extension/content.js`.

Look for:

```js
const RECYCLE_DEVICE_CATALOG_RAW = [
  // device entries
];

const RECYCLE_DEVICE_CATALOG = RECYCLE_DEVICE_CATALOG_RAW.map(normalizeRecycleDeviceCatalogEntry);
```

Add normal new devices to `RECYCLE_DEVICE_CATALOG_RAW`. Do not edit the normalized `RECYCLE_DEVICE_CATALOG` output directly.

`RECYCLE_DEVICE_CATALOG_RAW` is normalized through `normalizeRecycleDeviceCatalogEntry`, which fills default values for future contract fields and normalizes `materialId`.

## 3. Required fields

Every active normal device entry should include these fields.

### `deviceId`

Stable internal ID for the device.

```js
deviceId: "zte_g5b1"
```

This must not be a SAP/material number and must not be a free display name.

### `categoryId`

The recycle category this device belongs to.

```js
categoryId: "netbox"
```

Use only one of the current allowed category IDs listed below.

### `displayName`

Visible name used in the recycle device cards.

```js
displayName: "ZTE G5B1"
```

This may change later if business naming changes. Do not use it as identity.

### `materialId`

SAP/material ID used for SAP/material quick-button filtering and material filling.

```js
materialId: "123580"
```

This is business data, not identity.

## 4. Optional/future contract fields

These fields are supported by the normalized catalog contract. Add them only when useful and verified.

### `legacyMaterialIds`

Aliases or old SAP/material IDs. Keep as strings.

```js
legacyMaterialIds: ["BG123580"]
```

Current runtime material filtering uses `materialId`, not this field.

### `imagePath`

Explicit packaged image path for the recycle device card.

```js
imagePath: "images/devices/16x9/ZTE_G5B1_5G-removebg-preview.webp"
```

If omitted, the code derives a 16:9 image path from the existing packaged image fallback.

### `helpImagePath`

Optional help image for selected-device recycle help UI.

```js
helpImagePath: "images/recycle-help/netbox-zte-g5b1.webp"
```

Add only after the image exists and is available to the extension. When present, the image can be used by the floating help preview after an invalid non-empty serial and by the manual help menu opened from the yellow help button. Help UI is only visual guidance; it must not change serial values, SAP/material values, validation, or OSS navigation.

If selected devices have `helpImagePath`, help UI shows only the selected-device help images. If no devices are selected, or selected devices have no help images, the UI falls back to category-level help where available. Android/IPTV currently has device-level help images.

### `warningText`

Future warning text for similar devices, scan hints, or business notes.

```js
warningText: "Check the device label before scanning."
```

Do not use this to change validation behavior.

### `validationProfileId`

Future predefined validation profile ID.

```js
validationProfileId: "imei15_luhn"
```

This is currently contract metadata. Current validation behavior is still category-based in `validateRecycleSerial`.

### `enabled`

Controls whether a device participates in normal catalog consumers.

```js
enabled: false
```

Omitting `enabled` means the device is enabled.

## 5. Naming rules for `deviceId`

Use stable, lowercase, ASCII identifiers:

- use `snake_case`;
- include vendor/model when useful;
- keep it stable even if `displayName` changes;
- do not use spaces;
- do not use Cyrillic;
- do not use SAP/material ID as the ID;
- do not rename an existing `deviceId` unless there is a migration reason.

Good examples:

```js
deviceId: "zte_g5b1"
deviceId: "tp_link_ex220"
deviceId: "huawei_gpon_hg8145v5"
```

Avoid:

```js
deviceId: "123580"
deviceId: "ZTE G5B1"
deviceId: "нетбокс_zte"
```

## 6. Category rules / allowed current `categoryId` values

Use only these current category IDs:

```text
android_iptv
xplore_zapper
dth_kaon_nagra
austrian
netbox
routers
gpon
cam_modules
modems
```

Important notes:

- `austrian` is now partially device-based. Existing Austrian devices can use normal catalog fields and selected-device material fill, but the no-selected-device legacy preset fallback must be preserved until a separate migration removes it.
- `cam_modules` is special and has missing-material redirect behavior.
- `modems` is currently special/unmapped for material filtering unless explicit catalog/material behavior is designed.
- Adding a device to a mapped category can affect SAP/material filtering because filters are generated from catalog material IDs.

## 7. SAP/material ID rules

Use the canonical SAP/material number in `materialId`.

Rules:

- store as a string;
- prefer digits-only canonical value;
- do not include formatting dashes;
- do not include labels like `SAP`;
- do not use `BG...` as the canonical `materialId` unless the business process really requires it;
- put legacy or alias values in `legacyMaterialIds`;
- verify the ID exists in `SWAP_MATERIAL_MODELS_DEFAULT` or dashboard data if the device should appear as a quick button.

Example:

```js
materialId: "1000055165",
legacyMaterialIds: ["1-000-055-165"]
```

The current `normalizeSwapMaterialId` removes non-digits for matching, but the catalog should still be clean.

## 8. Image rules

### Old packaged image fallback

If `imagePath` is omitted, the recycle device card tries to derive a 16:9 path from the existing device image mapping through `deviceImageForModel(displayName)`.

This means the `displayName` should remain close enough to existing material model names when relying on fallback.

### 16:9 image location

Preferred recycle device card images live under:

```text
Extension/images/devices/16x9/
```

Catalog paths should use the extension-relative path:

```js
imagePath: "images/devices/16x9/Example_Device.webp"
```

### Filename consistency with existing device images

When adding new images later:

- keep filenames descriptive;
- prefer `.webp`, matching current assets;
- avoid duplicate near-identical filenames;
- keep device image aspect ratio suitable for 16:9 cards;
- verify the image is covered by `manifest.json` web-accessible resources before using it;
- do not change `manifest.json` casually just to test an image.

For this guide, do not add images. Add images only in a separate asset-focused patch.

## 9. Validation profile notes

`validationProfileId` points to a predefined local profile. It must not point to dashboard-provided arbitrary logic, arbitrary JavaScript, or arbitrary regex.

Current validation behavior is:

```js
no selected device -> validateRecycleSerial(categoryId, serialRaw)
selected device(s) -> implemented predefined validationProfileId profiles with OR logic
```

Do not add a new `validationProfileId` to a device unless the profile exists locally and the business rule is confirmed. Devices without an implemented profile safely fall back to category-level validation when selected.

Adding a device to `RECYCLE_DEVICE_CATALOG_RAW` does not automatically require device-level validation. Device-specific rules from `docs/RECYCLE_DEVICE_VALIDATION_RULES.md` are input for predefined local profiles; only profiles implemented in `Extension/content.js` are active.

Current common examples:

```text
imei15_luhn
android_b866v2f02_bg_plus_15_digits
android_dv9161_16_digits
android_zxv_b700v5_12_digits
xplore_zapper_mac12_hex_plain
dth_11_digits_prefix_00
gpon_16_alnum
router_13_alnum
router_zte_h3601p_zte_prefix_15_alnum
austrian_adb_vv2220
austrian_huawei_ha35_22_hibrid
category_android_iptv_current
category_xplore_zapper_mac12
category_dth_kaon_nagra_11_digits
category_austrian_min16_alnum
category_routers_current
category_gpon_current
category_cam_modules_non_empty
category_modems_current
```

For now, choose the category default unless there is a confirmed future requirement.

## 10. How to add a disabled/future device

Use `enabled: false` when the device should be documented in the catalog contract but not yet appear in normal UI or material filters.

Example use cases:

- waiting for SAP/material confirmation;
- image not ready;
- validation rules not confirmed;
- device exists in planning but should not be operator-visible yet.

Disabled devices should still include clear metadata so they can be safely enabled later.

## 11. What not to do

Do not:

- change dashboard files while adding a local catalog device;
- add storage keys;
- change `manifest.json` unless the image/resource change is deliberate and reviewed;
- add images in the same patch unless the task explicitly includes assets;
- change validation behavior in a catalog-only patch;
- change SAP/material filtering behavior unless the task explicitly asks for it;
- move dashboard config into the runtime path;
- add arbitrary regex or JavaScript validation from dashboard data;
- rename existing `deviceId` values casually;
- use SAP/material number as `deviceId`;
- add devices to `cam_modules` or `modems` without checking their special behavior;
- change or remove the Austrian no-selected-device legacy preset fallback in a catalog-only patch.

## 12. Test checklist after adding a device

Minimum local checks:

- `git diff --stat`
- `git diff --check`
- syntax parse check for `Extension/content.js`
- `node Extension/scripts/validate-recycle-catalog.js`
- `node Extension/scripts/check-recycle-config.js`
- `node Extension/scripts/export-recycle-config-fixture.js` if the change should be reflected in future config/export parity checks
- `node Extension/scripts/export-recycle-config-fixture.js --compare-fixture` to confirm the dev-only fixture still matches, or to detect that it needs an intentional update
- verify only intended files changed
- verify the new entry is in `RECYCLE_DEVICE_CATALOG_RAW`
- verify `deviceId` is unique
- verify `categoryId` is one of the allowed values
- verify `materialId` is normalized and correct
- verify material filter IDs/order for existing categories did not change unexpectedly

The catalog validator is dev-only. It is not loaded by the extension and does not change runtime behavior. Run it after changing recycle devices, help images, image paths, `validationProfileId`, or `materialId`. It checks catalog sanity, asset paths, validation profile IDs, generated material filter parity, and GPON material order. Expected healthy output: `Result: PASS`.

The config fixture exporter is also dev-only. `Extension/scripts/export-recycle-config-fixture.js` reads `Extension/content.js` as text and writes JSON to stdout with `schemaVersion`, `revision`, `devices`, `categoryHelp`, `validationProfiles`, and `generatedMaterialFilters`. The generated/reference fixture is `Extension/config/recycle-device-catalog.fixture.json`. Update it with `node Extension/scripts/export-recycle-config-fixture.js > Extension/config/recycle-device-catalog.fixture.json`, then compare with `node Extension/scripts/export-recycle-config-fixture.js --compare-fixture`. It checks expected top-level keys, `devices.length`, Austrian material filter `1200017460, 1200017462`, and GPON order `1200014928, 118560, 118563, 118564, 122933, 122944`. Mismatch diagnostics report the first semantic path, for example `Mismatch at generatedMaterialFilters.austrian[1]`, and print expected/actual values. It does not create runtime config files and is not loaded by the extension. Source of truth remains `Extension/content.js`; `manifest.json` is not involved.

For the full dev-only config readiness milestone, run `node Extension/scripts/check-recycle-config.js`. It runs the catalog validator, fixture compare, fixture validator, and fixture loader adapter. `validate-recycle-config-fixture.js` validates fixture shape/data, and `load-recycle-config-fixture.js` proves the fixture can be loaded and normalized into the future adapter shape without making it runtime source of truth.

Manual OSS checks when the device is enabled:

- selected category still renders;
- device card appears in the expected category;
- device card image or fallback renders acceptably;
- existing devices in the same category still appear;
- SAP/material quick buttons still render;
- mapped category material filtering contains the expected devices in the expected order;
- current category validation behavior is unchanged;
- CAM Modules flow is unchanged;
- Austrian no-selected-device legacy fallback is unchanged unless the task explicitly changes it;
- clipboard autofill and label/barcode generation are not regressed.

For Austrian devices, also verify selected-device validation, selected-device material fill, no auto-continue after extension-filled `MaterialId`, and acceptable quick material button/card rendering. A text/material fallback is acceptable when a dedicated quick-button image is not available yet.

## 13. Example entry for a normal device

```js
{
  deviceId: "zte_g5b1",
  categoryId: "netbox",
  displayName: "ZTE G5B1",
  materialId: "123580",
  legacyMaterialIds: ["BG123580"],
  imagePath: "images/devices/16x9/ZTE_G5B1_5G-removebg-preview.webp",
  helpImagePath: "",
  warningText: "",
  validationProfileId: "imei15_luhn",
  enabled: true
}
```

Shorter entries are acceptable when defaults are enough:

```js
{
  deviceId: "zte_g5b1",
  categoryId: "netbox",
  displayName: "ZTE G5B1",
  materialId: "123580"
}
```

## 14. Example entry for a future/disabled device

```js
{
  deviceId: "future_vendor_model",
  categoryId: "routers",
  displayName: "Future Vendor Model",
  materialId: "123456",
  legacyMaterialIds: [],
  imagePath: "",
  helpImagePath: "",
  warningText: "Pending SAP/material and image verification.",
  validationProfileId: "category_routers_current",
  enabled: false
}
```

This keeps the planned device documented without changing current UI, SAP/material filters, or operator workflow.
