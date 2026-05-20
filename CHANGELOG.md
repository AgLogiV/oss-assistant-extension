# Changelog

## Unreleased

- Added local recycle device catalog cards with 16:9 device images, visual multi-select, shared cross-tab category/device selection state, and selected-device validation profiles.
- Added selected-device recycle help UI: invalid non-empty serials can show a floating preview, the yellow help button opens a separate manual help menu, and Android/IPTV currently has device-level help images.
- Selected-device validation now uses predefined local profiles only when device cards are selected; no selected devices keeps category-level validation, and selected devices without implemented profiles fall back safely.
- Tightened recycle serial validation: `android_iptv` now requires 12-17 characters while keeping the existing empty/Cyrillic/special-character/MAC-like/BG-prefix guards; `xplore_zapper` now accepts any valid 12-hex MAC case-insensitively, without requiring A-F letters or more than 2 A-F letters.
- Added recycle serial keyboard layout normalization for scanner input using trusted `KeyboardEvent.code`, with Cyrillic warning/block fallback and opt-in diagnostics.
- Added recycle-specific SAP/material quick-button filtering for `xplore_zapper`, `dth_kaon_nagra`, `android_iptv`, `netbox`, `routers`, and `gpon`.
- Material filtering uses normalized material ID allowlists; mapped categories hide the broad chips and keep search scoped to the allowed devices.
- Selected recycle devices are now prioritized first in category-scoped SAP/material quick-button grids; this does not auto-fill `MaterialId` and does not restrict the grid to selected devices only.
- Added a session-based debug/test toggle for `Material auto-continue`, defaulting to `ON`.
- Kept `cam_modules` as a separate missing-material flow outside the quick-button grid.
- Known gap: `austrian` material filtering is still TODO/unmapped pending the missing or unclear device/material.

## Recent Validation

- Clipboard SSID/password autofill works.
- Label generation works, including Austrian labels.
- CAM Modules flow works.
- Category-specific material filtering works for the mapped recycle categories.
- Selected-device SAP/material button prioritization works without auto-fill or selected-only restriction.
- Shared recycle category/device selection works across tabs/windows.
- Selected-device validation profiles and multi-select OR validation work for the implemented profiles.
- Floating recycle help preview and the separate manual help menu work for Android/IPTV help images.
- `Material auto-continue` debug toggle works and does not freeze the OSS page.
