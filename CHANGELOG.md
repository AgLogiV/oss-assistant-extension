# Changelog

## Unreleased

- Fixed HX520 Home clipboard WiFi autofill on recycle-state pages: `processText()` now routes HX520 through the TP-Link `parseForEX220` parser, accepts label password pattern `Wireless Password:` (in addition to `Wireless Password/PIN:`), and generates `Ssid2` with `_5G` suffix when the device is 5G-capable but only SSID1 was parsed.
- Added a `Reload Extension` button next to `RESET` in the injected OSS button row (`injectButton()`). It asks for confirmation, sends `extension.reload` to `background.js`, reloads the extension via `chrome.runtime.reload()`, stores the current tab id in `chrome.storage.local` (`wifi_oss_extension_reload_tab_id_v1`), and the background service worker reloads that tab after startup so operators keep the same OSS page after a code update.
- Added a SharePoint OSSRecycleSchedule date/time widget on `https://a1g.sharepoint.com/sites/o365RCR/Lists/OSSRecycleSchedule/*`. The widget shows Bulgarian date/time next to the list sync icon, refreshes every 30 seconds, and the page uses an early return so no OSS recycle/WiFi/material logic runs on SharePoint.
- Fixed Dailywork auto-selection for schedule device `DTH STB`: it now selects category `dth_kaon_nagra` plus concrete device `dth_kaon_kstb1001` (DTH STB KAON KSTB1001) instead of category-only. `SD STB` remains category-only.
- Added a MAC scanner shortcut guard for `KSTB5019 XploreTV` and `KSTB5020 XploreTV` when exactly one of those devices is selected in `xplore_zapper`. Barcode scanners often emit `Tab`, `Alt`, `Ctrl+Tab`, or `F`-keys as prefix/suffix; `attachRecycleXploreKaonMacScannerShortcutGuard` blocks those keys on the recycle entry serial input and recycle-state serial/MAC inputs so focus stays in the field and the browser tab is not switched during MAC scans. `Enter` (Continue) and manual `Ctrl+C/V/A/X/Z/Y` are not blocked. True OS-level `Alt+Tab` between applications cannot be blocked by the extension — if that persists, reprogram the scanner prefix/suffix.
- Added a confirmation prompt when the operator manually changes the recycle category or device away from the dailywork distribution assignment. The applied schedule target is recorded per workday (`wifi_oss_dailywork_assignment_v1`); selecting a different category, or toggling the device selection so it no longer matches the assigned device(s), shows a closable confirm dialog ("Смяна на категория" / "Смяна на устройство", buttons Да, смени / Отказ). It never blocks the change, only makes deviating deliberate; re-selecting the assigned category/device or acting when there is no assignment for today proceeds without a prompt. The Reset button uses the same confirmation ("Нулиране на избора") when an assignment exists for today and there is a current selection to clear.
- Extended the server recycle-history duplicate window from 3 to 7 days (`RECYCLE_HISTORY_DAYS_BACK`), so a device recycled/scrapped anytime in the past week is detected. The recycle entry gate now also performs a fast, bounded, one-shot wait per serial (up to `RECYCLE_HISTORY_CONTINUE_WAIT_MS` = 1500 ms) for the history to finish loading before deciding, then re-triggers Continue automatically; on timeout it fails open and the local ledger still blocks repeats, so the flow stays fast.
- Added a local processed-serial ledger (`wifi_oss_recycle_processed_ledger_v1`) as an independent, offline-proof guard against recycling/scrapping the same device more than once. The recycle entry gate now checks the local ledger together with the server recycle history, so a just-processed serial is blocked immediately even before the server history reflects it (fixes being able to scrap the same device twice before the 3rd attempt was stopped). Because the entry serial gate is shared, this enforces cross-action safety: an already recycled or scrapped device is blocked for both new recycle and new scrap. An explicit "Да" override remains for intentional re-processing, and a per-page-load guard prevents a single Continue gesture from self-blocking after recording.
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

- HX520 Home clipboard autofill fills `Ssid1`, `Ssid2` (`_5G` suffix), `Psk1`/`Psk2`, port count `2`, and WiFi test `Yes` from labels using `Wireless Password:`.
- `Reload Extension` reloads the extension and refreshes the current OSS tab after confirmation.
- SharePoint OSSRecycleSchedule shows the Bulgarian date/time widget and does not run OSS recycle logic on that page.
- Double-process guard: entering a serial that was already recycled/scrapped in the same browser is blocked at the recycle entry gate via the local ledger, independent of server history availability, and works across tabs and days within the retention window; the explicit "Да" override still allows intentional re-processing.
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
