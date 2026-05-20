# Changelog

## Unreleased

- Added local recycle device catalog cards with 16:9 device images, visual multi-select, shared cross-tab category/device selection state, and selected-device validation profiles.
- Added selected-device recycle help UI: invalid non-empty serials can show a floating preview, the yellow help button opens a separate manual help menu, and Android/IPTV currently has device-level help images.
- Selected-device validation now uses predefined local profiles only when device cards are selected; no selected devices keeps category-level validation, and selected devices without implemented profiles fall back safely.
- Tightened recycle serial validation: `android_iptv` now requires 12-17 characters while keeping the existing empty/Cyrillic/special-character/MAC-like/BG-prefix guards; `xplore_zapper` now accepts any valid 12-hex MAC case-insensitively, without requiring A-F letters or more than 2 A-F letters.
- Added recycle serial keyboard layout normalization for scanner input using trusted `KeyboardEvent.code`, with Cyrillic warning/block fallback and opt-in diagnostics.
- Added recycle-specific SAP/material quick-button filtering for `xplore_zapper`, `dth_kaon_nagra`, `android_iptv`, `netbox`, `routers`, and `gpon`.
- Material filtering uses normalized material ID allowlists; mapped categories hide the broad chips and keep search scoped to the allowed devices.
- Selected recycle devices are now prioritized first in category-scoped SAP/material quick-button grids; safe single-candidate selections can controlled-fill empty `MaterialId`, and the grid is not restricted to selected devices only.
- Added a per-flow SAP/material snapshot in `sessionStorage` so selected-device ordering can use the category/device/material/serial/date context from the valid recycle Continue step without changing auto-fill or auto-continue behavior.
- Added a recycle material fill-candidate helper that returns `{ ok, materialId, reason }` and is used by controlled auto-fill without changing auto-continue.
- Added controlled recycle SAP/material auto-fill: when a valid per-flow snapshot has one safe material candidate and the OSS `MaterialId` field is empty, the extension fills the value without triggering auto-continue or changing the category-scoped material grid.
- Added Austrian device-based recycle behavior for `ADB Modem 2220` and `Huawei HA35-22 HIBRID`, including device cards, selected-device validation, and selected-device material fill via the snapshot/controlled-fill flow.
- Added a session-based debug/test toggle for `Material auto-continue`, defaulting to `ON`.
- Kept `cam_modules` as a separate missing-material flow outside the quick-button grid.
- Known UI polish: the Huawei Austrian quick material button can render through the material fallback even if it does not yet have a dedicated quick-button image.

## Recent Validation

- Clipboard SSID/password autofill works.
- Label generation works, including Austrian labels.
- CAM Modules flow works.
- Category-specific material filtering works for the mapped recycle categories.
- Selected-device SAP/material button prioritization and controlled single-candidate auto-fill work without selected-only restriction.
- Per-flow SAP/material snapshot behavior preserves selected-device ordering without changing CAM or Austrian behavior.
- Controlled SAP/material auto-fill works for safe single-candidate recycle selections without overwriting prefilled OSS values or auto-continuing.
- Austrian ADB/Huawei selected-device validation and material fill work; no selected Austrian device keeps the legacy preset fallback.
- Shared recycle category/device selection works across tabs/windows.
- Selected-device validation profiles and multi-select OR validation work for the implemented profiles.
- Floating recycle help preview and the separate manual help menu work for Android/IPTV help images.
- `Material auto-continue` debug toggle works and does not freeze the OSS page.
