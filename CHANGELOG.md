# Changelog

## Unreleased

- Recycle label printing now defaults to successful devices only: `Принтирай баркод`, `Принтирай Всичко`, and the injected printer icon print only rows with `Успешно рециклиран = Да` when nothing is selected; manually checked rows still print exactly as selected, including `Не` rows.
- Hardened Dailywork production auto-selection with a bounded retry scheduler (backoff up to ~20s), post-write persistence verification, and transient-vs-terminal outcome classification so timing, DOM-not-ready, network, and last-known-good warm-up failures are retried instead of silently skipped. Intentional outcomes (absence/`Друго`, already applied, suppressed after Reset, existing manual selection) still stop cleanly and are never overridden.
- Added a non-blocking, closable "Няма разпределение за рециклиране" modal shown once per workday when the technician has a found schedule row that does not map to a recycle category/device (`Друго`/absence or an unmapped device name). It never blocks recycling and can be dismissed via the button, `x`, backdrop click, or `Escape`.
- Production patch: `ZTE G5B` now uses confirmed SAP/material `124173`; `deviceId: "zte_g5b1"` and image paths were intentionally kept unchanged.
- Enforced selected-device catalog SAP/material on the swap-material step: when a valid single selected-device snapshot has one catalog material, any different OSS-prefilled `MaterialId` is replaced before auto-continue.
- Temporarily disabled Render dashboard material-model override so production uses packaged/local fallback material models until the old dashboard data source and replacement behavior are reviewed.
- Removed legacy SAP/material quick buttons from the visible material grid while keeping old-to-new SAP rewrite active for OSS-prefilled legacy values.
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
- Added Austrian device-based recycle behavior for `ADB Modem 2220` and `Huawei HA35-22 HYBRID`, including device cards, selected-device validation, and selected-device material fill via the snapshot/controlled-fill flow.
- Added a dev-only recycle config fixture exporter that reads `Extension/content.js` as text and writes the current config-shaped JSON to stdout for future packaged JSON readiness checks, including top-level key, device count, Austrian filter, and GPON order parity guards.
- Added a dev-only generated/reference recycle config fixture at `Extension/config/recycle-device-catalog.fixture.json` plus `--compare-fixture` workflow for intentional metadata review before future packaged JSON work.
- Documented the readiness gate for any future runtime packaged JSON loader: validator and fixture compare must pass, schema/merge/fallback must be documented, `manifest.json` exposure must be reviewed, and dashboard override must remain optional.
- Improved dev-only `--compare-fixture` mismatch diagnostics to report the first semantic path and expected/actual values without changing PASS behavior or JSON stdout mode.
- Added dev-only recycle config readiness tooling: fixture validation, fixture loader adapter normalization, and the combined `node Extension/scripts/check-recycle-config.js` command.
- Added a session-based debug/test toggle for `Material auto-continue`, defaulting to `ON`.
- Kept `cam_modules` as a separate missing-material flow outside the quick-button grid.
- Known UI polish: the Huawei Austrian quick material button can render through the material fallback even if it does not yet have a dedicated quick-button image.

## Recent Validation

- Recycle label printing defaults to `Успешно рециклиран = Да` rows only, and manual checkbox selection still prints exactly the selected rows (including `Не`).
- Dailywork production auto-selection retry/verification works; transient failures are retried and intentional no-op/terminal outcomes are respected without overriding manual selections.
- The "Няма разпределение за рециклиране" notice appears once per workday only for a found-but-unmappable schedule row and never blocks recycling.
- Clipboard SSID/password autofill works.
- Label generation works, including Austrian labels.
- CAM Modules flow works.
- Category-specific material filtering works for the mapped recycle categories.
- Selected-device SAP/material button prioritization and controlled single-candidate auto-fill work without selected-only restriction.
- Per-flow SAP/material snapshot behavior preserves selected-device ordering without changing CAM or Austrian behavior.
- Controlled SAP/material enforcement works for safe single-candidate recycle selections, including replacing mismatched OSS-prefilled values with the selected device catalog SAP/material before auto-continue.
- Austrian ADB/Huawei selected-device validation and material fill work; no selected Austrian device keeps the legacy preset fallback.
- Shared recycle category/device selection works across tabs/windows.
- Selected-device validation profiles and multi-select OR validation work for the implemented profiles.
- Floating recycle help preview and the separate manual help menu work for Android/IPTV help images.
- `Material auto-continue` debug toggle works and does not freeze the OSS page.
