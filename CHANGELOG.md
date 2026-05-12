# Changelog

## Unreleased

- Added recycle-specific SAP/material quick-button filtering for `xplore_zapper`, `dth_kaon_nagra`, `android_iptv`, `netbox`, `routers`, and `gpon`.
- Material filtering uses normalized material ID allowlists; mapped categories hide the broad chips and keep search scoped to the allowed devices.
- Added a session-based debug/test toggle for `Material auto-continue`, defaulting to `ON`.
- Kept `cam_modules` as a separate missing-material flow outside the quick-button grid.
- Known gap: `austrian` material filtering is still TODO/unmapped pending the missing or unclear device/material.

## Recent Validation

- Clipboard SSID/password autofill works.
- Label generation works, including Austrian labels.
- CAM Modules flow works.
- Category-specific material filtering works for the mapped recycle categories.
- `Material auto-continue` debug toggle works and does not freeze the OSS page.
