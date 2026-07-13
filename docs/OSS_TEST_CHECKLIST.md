# OSS Manual Test Checklist

Use this checklist in the real/demo OSS environment after loading the extension from `Extension/` with Chrome `Load unpacked`.

## Before Testing

- Confirm the extension is enabled and the current URL matches one of the manifest domains.
- Open DevTools Console so runtime errors are visible.
- Start from a clean tab/session when testing daily category behavior.
- If testing dashboard models, note whether `https://oss-assistant.onrender.com/api/models` is reachable from the network.
- For catalog/device/help-image changes, run the dev-only check `node Extension/scripts/validate-recycle-catalog.js`. Expected result: `Result: PASS`.
- For the full dev-only recycle config readiness chain, run `node Extension/scripts/check-recycle-config.js`. Expected result: `Result: PASS`.
- Before future packaged JSON/config work, run `node Extension/scripts/export-recycle-config-fixture.js` as a dev-only config-readiness/export parity check. It should print JSON to stdout and must not create runtime config files. It guards expected top-level keys, `devices.length`, Austrian material filter `1200017460, 1200017462`, and GPON order `1200014928, 118560, 118563, 118564, 122933, 122944`.
- For future GitHub Pages/static config work, run `node Extension/scripts/export-recycle-assets-manifest.js` as a dev-only no-write asset manifest export check. It prints JSON to stdout for a future `config/assets-manifest.json`, scans only `Extension/images/devices/16x9/` and `Extension/images/recycle-help/`, outputs extension-relative `images/...` paths only, and does not create files, publish anything, or change runtime behavior.
- For a future static config package preview, run `node Extension/scripts/export-recycle-static-config-package.js --out path/to/output-dir` with optional `--dry-run`, `--force`, `--include-images`, or `--include-configurator-ui`. It is dev-only, writes only to the explicit output directory, outputs `config/recycle-device-catalog.json` and `config/assets-manifest.json` by default, validates the generated catalog, and refuses runtime/source folders. With `--include-images`, it copies only `assets-manifest.json` referenced package images into `images/devices/16x9/` and `images/recycle-help/`; with `--include-configurator-ui`, it copies `configurator/index.html`, `configurator/app.js`, and `configurator/styles.css`, transforming only the copied `app.js` to static mode while source `public/app.js` remains local mode.
- Practical full static package smoke check: run `node Extension/scripts/export-recycle-static-config-package.js --out path/to/output-dir --include-images --include-configurator-ui` outside the repo. Expected structure is `config/recycle-device-catalog.json`, `config/assets-manifest.json`, `images/devices/16x9/`, `images/recycle-help/`, `configurator/index.html`, `configurator/app.js`, and `configurator/styles.css`. The package should run without `/api/*` endpoints, static validation should be disabled/instructional, exported JSON should keep `images/...` paths, and the command still does not create GitHub Pages files, `.nojekyll`, GitHub write/OAuth/tokens, runtime JSON loading, or runtime behavior changes.
- For future `oss-assistant-config` publishing, copy the generated package into the separate public config repo root only after validation/review/smoke checks. Review the diff before commit or PR, and keep the repo package-shaped: `README.md`, `config/`, `images/`, and `configurator/`. Do not include full `Extension/`, `Extension/content.js`, `manifest.json`, local Node server files, temp outputs/backups/zips, secrets/tokens/customer data, or GitHub OAuth/browser-write code. Extension runtime still does not load remote config; future remote loading must be optional validated overlay with local fallback.
- Live static config deployment URLs: public repo `https://github.com/oss-assistant/oss-assistant-config`, GitHub Pages root `https://oss-assistant.github.io/oss-assistant-config/`, static configurator `https://oss-assistant.github.io/oss-assistant-config/configurator/`, config JSON `https://oss-assistant.github.io/oss-assistant-config/config/recycle-device-catalog.json`, and assets manifest `https://oss-assistant.github.io/oss-assistant-config/config/assets-manifest.json`. Pages is enabled from `main` branch root; root showing README is expected. The static configurator loads from GitHub Pages, but it does not write to GitHub. Extension runtime now has manual/debug remote fetch/cache and visual-only overlay support, not startup auto-apply.
- Minimum accepted Candidate JSON publish flow: keep the exported candidate outside both git repos, then from the private extension repo run `node Extension/scripts/validate-recycle-config-fixture.js --input <candidate.json>` and `node Extension/scripts/review-recycle-config-candidate.js --input <candidate.json>`. If accepted, copy only that JSON to `<oss-assistant-config>/config/recycle-device-catalog.json`; in `oss-assistant-config`, run `node .github/validate-static-package.js`, `git diff --stat`, `git diff --check`, and `git diff -- config/recycle-device-catalog.json`, then commit/push only `config/recycle-device-catalog.json`. If review reports `REVIEW_REQUIRED`, do human review before publishing. If the candidate references new images/assets, stop and split a separate asset publish task. Do not overwrite images, `config/assets-manifest.json`, configurator UI, or runtime files unless explicitly requested.
- Remote promotion from staging/demo to production: never copy `staging/recycle-device-catalog.demo.json` directly to production, and keep `staging/recycle-device-catalog.test.json` as the stable smoke/regression fixture. Production promotion means changing only `<oss-assistant-config>/config/recycle-device-catalog.json`. Full production remote device + SAP behavior requires explicit `remoteAdditionsAuto`, `remoteMaterialAuto`, and `remoteMaterialModelsAuto`. `REVIEW_REQUIRED` for `remoteMaterialModels` means human business approval is required, not validator failure; confirm correct SAP/materialId, `deviceId`, `categoryId`, safe/display name, no CAM/modem/special flow, and acceptable image/help paths. Run both private and public validators against the same candidate, smoke first through debug source, then after publish through production source. Rollback is a public repo revert commit, Pages refresh, then extension `Clear`, `Use production`, and `Refresh remote`. `generatedMaterialFilters` remains non-authority.
- Candidate publish preparation helper: `node Extension/scripts/prepare-recycle-config-candidate-publish.js --input <candidate.json> --config-repo <path/to/oss-assistant-config>`. The candidate must still live outside both repos. The helper validates/reviews it, copies only to `<oss-assistant-config>/config/recycle-device-catalog.json`, runs the public validator/diff checks, and refuses `REVIEW_REQUIRED` unless `--accept-review-required` is passed after human review. It does not commit, push, copy images, copy `assets-manifest.json`, copy configurator UI, or touch runtime files.
- Normal full-extension development uses the private repo `https://github.com/oss-assistant/oss-assistant-extension`: local patch, checks/tests, review, commit, then `git push origin main`. The public `oss-assistant-config` repo has GitHub Action validation for static package structure/path safety after static package publishes.
- Remote recycle config Stage 2/3/4 checks are manual/debug only. `background.js` owns GitHub Pages fetch, timeout, ETag/status, validation, and `chrome.storage.local` keys `wifi_oss_recycle_remote_config_lkg_v1`, `wifi_oss_recycle_remote_config_meta_v1`, `wifi_oss_recycle_remote_config_status_v1`, and `wifi_oss_recycle_remote_config_enabled_v1`; `content.js` stays local-first and exposes a CSP-safe `window.postMessage` debug bridge for refresh/status/clear/apply.
- The normal remote-config test surface is the collapsed `Remote config debug` tray inside the extension-owned recycle panel, under the category/device grid. Expand it and check `Source`, `Auto-refresh`, `Status`, `Refresh remote`, `Preview diff`, `Preview plan`, `Apply visual`, `Apply eligible`, `Enable material`, and `Clear`; the tray replaces the need to paste the page-console helper for ordinary manual tests. On branch `codex/external-recycle-catalog-runtime`, the approved external raw source is the default/non-debug source for newly added recycle devices, normal automatic refresh uses a 6-hour TTL, and `Refresh remote` remains manual force refresh that bypasses TTL. Debug source override still has priority for staging/demo/alternative URLs. `Preview diff`/`Preview plan` are debug/preview-only and expose compact counts/samples, not raw catalog data. Compatible explicit contracts may auto-apply eligible remote cards through `remoteAdditionsAuto`, auto-enable material through `remoteMaterialAuto`, and accept new remote-defined SAP/material models only through `remoteMaterialModelsAuto` plus validated `remoteMaterialModels`; manual `Apply eligible` and `Enable material` remain diagnostic/debug paths. `Clear` removes cache/LKG/meta/status plus in-memory visual, auto-added, debug-added, auto-material, debug-material, and persisted session state while preserving Auto-refresh ON/OFF. Remote `generatedMaterialFilters` is not runtime authority.
- Stable staging smoke: use `Source` -> `Use debug source` with `https://oss-assistant.github.io/oss-assistant-config/staging/recycle-device-catalog.test.json`, then `Refresh remote`; do not press `Apply eligible` or `Enable material` for the auto-flow check. Successful smoke for private `35c2031 Add automatic remote recycle device cards` and `c4852bf Add automatic remote recycle material enablement` plus public `3965ee8 Enable staging remote additions auto capability` and `3e1dd26 Enable staging remote material auto capability`: staging URL opened directly, refresh showed `source debug`, `contract v1 ok`, `auto remote applied 1`, `auto material 1`, `fresh`, and `LKG yes`; the router category showed `STAGING TEST REMOTE ROUTER / 123451`. Production `config/recycle-device-catalog.json` remains unchanged/default/fallback. Keep `staging/recycle-device-catalog.test.json` as the stable smoke/regression fixture; future visual demo work should use a separate demo fixture instead of mutating this smoke fixture.
- Remote material model/visual demo smoke: use `Source` -> `Use debug source` with `https://oss-assistant.github.io/oss-assistant-config/staging/recycle-device-catalog.demo.json`, then `Refresh remote`; do not press `Apply eligible` or `Enable material`. Successful smoke for private `86d7925 Add remote material model extension support`, `9e27760 Fix remote capability detection`, and `67276c4 Add packaged Austrian demo images`, plus public `e9684a9 Add remote material models demo fixture` and `31a58ca Add Austrian remote demo devices`: after extension reload, OSS refresh, `Clear`, debug source, and refresh, the tray showed `source debug`, `contract v1 ok`, `auto remote applied 7`, `auto material 7`, `fresh`, and `LKG yes`; `Австрийски` showed custom-image cards `DEMO Спирачни апарати / 222222`, `DEMO Алтернатори / 333333`, `DEMO Рейки / 444444`, `DEMO Австрийско 1 / 555555`, `DEMO Австрийско 2 / 666666`, and `DEMO Австрийско 3 / 777777`, while `DEMO Remote Router 111111 / 111111` remained available. The device-required guard worked, Austrian 16-character/digit demo serial validation passed, and the demo SAP/material was written into an empty SAP field. This demo proves debug-source remote JSON can add visible cards, remote-defined SAP/material IDs, and packaged/mirrored images. Keep `staging/recycle-device-catalog.demo.json` demo-only; keep `staging/recycle-device-catalog.test.json` as the stable regression fixture.
- External default-source smoke (`464b564 Add external recycle catalog runtime adapter`, `d168f73 Use external recycle catalog as default source` on branch `codex/external-recycle-catalog-runtime`): with no `Use debug source`, `Refresh remote` should fetch `https://raw.githubusercontent.com/AgLogiV/oss-assistant-extension/main/config/recycle-device-catalog.fixture.json`. Expected successful smoke is `source external`, `normal refresh 6h`, `contract v1 ok`, `auto remote applied 2`, `auto material 2`, `fresh`, `LKG yes`, visible `BOJIDAT NETBOX / 888888` and `BOJKATA RUTERA BRAT / 9191919191`, external images rendered, SAP/material `888888` filled for `BOJIDAT NETBOX`, selected remote-added device persists after page refresh, and local plus remote selected devices both persist after refresh. Repeated `Refresh remote`, page refresh, and page navigation should not break the flow. `Clear` removes remote/LKG state, and `Refresh remote` fetches/applies again. The file is simple `external_simple_v1`, not the full OSS schema; `background.js` normalizes only the approved external source internally and generates `remoteMaterialModels`. Same-source LKG protects the page if the source is stale/unavailable; first fetch without valid LKG falls back local-only if the external file is invalid. See `docs/EXTERNAL_RECYCLE_CATALOG_RUNTIME.md`.
- Runtime contract reporting is manual/debug status only for compatible sources. With the current public JSON, `Status`, `Refresh remote`, or `Preview plan` should show compact compatibility such as `contract legacy ok`; missing `runtimeContract` remains legacy-compatible. Private validators/review scripts and the public config tools now accept and validate optional `runtimeContract`, while invalid/unsafe shapes are rejected. The public static configurator preserves `runtimeContract` read-only on load/export if present, but does not add UI editing and does not emit it when absent. Production `config/recycle-device-catalog.json` still does not include `runtimeContract`, dashboards/configurators should not require or emit it yet, and incompatible contracts block only manual apply actions (`Apply eligible` / `Enable material`), not `Preview plan` or `Apply visual`.
- Manual visual overlay smoke flow: publish or temporarily serve a safe visual-only remote change, call the debug bridge refresh, then call `applyVisualOverlay` and confirm the recycle UI changes only existing-device visual/help metadata. Allowed fields are `displayName`, `imagePath`, `helpImagePath`, and `warningText`; forbidden/currently not applied fields are `materialId`, `legacyMaterialIds`, `validationProfileId`, `enabled`, `categoryId`, `generatedMaterialFilters`, additions, deletions, and category moves. The overlay is in-memory and disappears on page refresh by design. The temporary `zte_g5b1` display-name smoke test passed and was reverted in the public config repo.
- Controlled `Preview diff` public smoke passed and was reverted (`9822ef7` then `ea4afa8`): temporary changes made one visual display-name diff, one risky `validationProfileId` diff, and one unknown remote device. The tray reported `visual 1`, `risky 1`, `unknown 1`, `missing 0`; `Apply visual` changed only the existing visual label, did not add the unknown device, did not apply the risky field, and `Clear` returned local fallback.
- Remote JSON still cannot define JS, regex, selectors, OSS navigation, clipboard parsers, labels/barcodes, CAM flow, auto-continue, `rewriteMap`, keyboard normalization, dashboard polling, or new validation logic.
- Unknown remote devices remain report-only. `Preview diff` now shows preview-only eligible/blocked counts and capped reasons/warnings; eligible does not mean applied. The temporary eligibility smoke was pushed and reverted (`db12304` then `8f2de75`): `unknown 3`, `eligible 1`, `blocked 2`, `missing 0`; `Apply visual` ignored unknown devices and did not add runtime cards. Before any future runtime support, keep the packaged catalog as fallback, do not mutate `RECYCLE_DEVICE_CATALOG`, do not rebuild `SWAP_MATERIAL_RECYCLE_FILTERS`, block `cam_modules`/`modems` additions first, require locally implemented `validationProfileId`, check safe/known material behavior, handle missing image/help assets with fallback, and never create a runtime card for `enabled: false`.
- Manual `Apply eligible` UI-card-only smoke passed and was reverted (`dcb2584` then `a3ceee0`): `Preview diff` showed `unknown 3`, `eligible 1`, `blocked 2`, `missing 0`; `Apply eligible` showed `added 1`, `blocked 2`, `rendered 1`; only `Preview Test Eligible Device` appeared under `routers`; blocked CAM/disabled devices did not appear; the card had no SAP/material number; help opened; `Clear` removed the temporary card. Browser/accessibility warnings around help focus/`aria-hidden` were observed, but no functional console errors.
- Remote material eligibility preview smoke passed and was reverted (`d6a8ed5` then `4ff2376`): after `Apply eligible`, `Status` showed compact preview output like `remote material: eligible 1, blocked 0`; the remote-added card still had no SAP/material number; no functional console errors were observed. This preview is debug/status-only, uses diagnostic remote material, and does not enable SAP/material behavior.
- Debug material enablement smoke passed and was reverted (`463be5b` then `54ec86e`): `Preview diff` showed `unknown 3`, `eligible 1`, `blocked 2`; `Apply eligible` added `Preview Test Material Device`; before `Enable material`, the remote card had no SAP/material number; `Enable material` showed `material enabled 1`, `blocked 0`; the recycle card showed `123451`; after OSS navigation/full reload to `swap-material`, Material Id `123451` and quick card `ZTE MF296R / 123451` appeared. `Clear` must remove the remote card, material enablement, and persisted debug state; page refresh after Clear should return local fallback.
- Resolved apply-plan smoke passed and was reverted (`44f847a` then `c3434a4`): with the temporary public config, `Preview plan` showed `visual 0 | add 1 | material 1 | blocked 2`; `Apply eligible` added `Preview Test Material Device`; `Enable material` showed `material enabled 1`, `blocked 0`; the recycle card showed `123451`; `swap-material` showed Material Id `123451` and quick card `ZTE MF296R / 123451`; `Clear` removed the remote card/material debug state and returned fallback.
- Remote material support remains debug/manual-only. Keep the packaged catalog as base/fallback, do not mutate `RECYCLE_DEVICE_CATALOG`, do not mutate/rebuild `SWAP_MATERIAL_RECYCLE_FILTERS`, keep `getRecycleDeviceImagePathByMaterialId` local-only, and keep `cam_modules`, `modems`, disabled devices, unknown/non-digits material, non-local profiles, and legacy material behavior blocked until separate reviewed stages.
- When intentionally updating the dev-only reference fixture, use `node Extension/scripts/export-recycle-config-fixture.js > Extension/config/recycle-device-catalog.fixture.json`, then run `node Extension/scripts/export-recycle-config-fixture.js --compare-fixture`. A mismatch means catalog/config metadata changed and needs review; the output reports the first semantic path plus expected/actual values.
- For the dev-only local recycle configurator, use `Extension/tools/recycle-configurator/`. Start it with `Extension/tools/recycle-configurator/start-configurator.cmd` or `node Extension/tools/recycle-configurator/server.js`, load the fixture, use search/category filters, select a device in the compact list, edit only in the side editor, check `imagePath`/`helpImagePath` selectors and thumbnails, run Validate Candidate for PASS/FAIL UX, export candidate JSON, and confirm Revert changes restores browser-memory state.
- In the dev-only configurator, `Add Device` is browser-memory-only and appends only to `currentCandidate.devices`. It must not write to `Extension/content.js`, `Extension/config`, or any server-side save/write endpoint, and it does not affect extension runtime until a candidate JSON is separately reviewed/merged in a future workflow.
- For `Add Device`, verify draft fields `deviceId`, `categoryId`, `displayName`, `materialId`, `legacyMaterialIds`, `imagePath`, `helpImagePath`, `warningText`, `validationProfileId`, and `enabled`. Guardrails should block duplicate/unsafe lower snake-case `deviceId`, missing `displayName`, invalid `validationProfileId`, non-digit `materialId`, and non-digit `legacyMaterialIds`; `categoryId` must exclude `cam_modules` and `modems`. `gpon`/`austrian` are warning-only, and Validate Candidate remains the authority.
- Add a valid `netbox` or `routers` device, confirm Validate Candidate returns PASS, export candidate JSON and confirm the new device is present with no UI-only fields, then use Revert changes and confirm the added device disappears. Also confirm asset selectors/previews work in Add mode.
- Configurator exports must store extension-relative `images/...` paths only. The configurator has no server-side save/write endpoint, and the extension runtime still does not load JSON config.
- Before merging an exported candidate into runtime metadata, run `node Extension/scripts/review-recycle-config-candidate.js --input path/to/candidate.json`. It is dev-only/no-write and compares the candidate to the current runtime-shaped export by stable `deviceId`, reporting added/edited/missing/reordered devices, material filter changes, unknown fields, and manual-review-only sections. If acceptable, make a manual/Codex-assisted patch to `RECYCLE_DEVICE_CATALOG_RAW`, regenerate `Extension/config/recycle-device-catalog.fixture.json` from `Extension/content.js`, run `node Extension/scripts/check-recycle-config.js`, review the diff, then commit.
- `validationProfileId` choices are predefined local profiles only; JSON/config must not define arbitrary validation logic, regex, or JavaScript.
- Do not test or enable a runtime packaged JSON loader until validator/fixture checks pass, schema/merge/fallback are documented, `manifest.json` exposure is reviewed, and regression coverage includes category panel, selected-device validation/help/material fill, Austrian, CAM, modems, clipboard, labels, and barcodes.
- Do not promote remote recycle overlay beyond manual/debug visual-only apply until startup timing, production UI/status, refresh policy, rollback, and broader regression coverage are reviewed.

## Recycle Entry: Category and Serial Validation

- Open the recycle device entry step and confirm the category panel appears.
- Capture the page title/URL/path if visible.
- Confirm the serial input attributes: `id`, `name`, `class`, `value`, `readonly`, `disabled`.
- Without choosing a category, enter a serial and press Continue. Expected: blocked with an inline message.
- Test Continue by mouse click and by pressing Enter in the serial field.
- Choose a category that renders visible concrete device cards, do not select a concrete device, then press Continue. Expected: blocked with inline message `Избери поне едно устройство.`
- Select a concrete device after the new selected-device-required alert. Expected: the alert clears, and normal serial validation continues.
- With a selected concrete device and an invalid non-empty serial, confirm the normal selected-device validation still applies and the help image/preview behavior is unchanged.
- Confirm `cam_modules` and `modems` do not get the new selected-device-required block.
- Expand the recycle entry `Debug guards` tray and confirm it appears inside the recycle panel, not in the footer, and does not duplicate after normal interaction or reload.
- In `Debug guards`, toggle `Device required` ON and confirm a category with visible device cards but no selected device blocks with `Избери поне едно устройство.`
- In `Debug guards`, toggle `Device required` OFF and confirm only the selected-device-required guard is bypassed; no-category, serial validation, duplicate warning, SAP/material, and CAM behavior remain unchanged.
- Confirm the `Debug guards` material auto-continue toggle still controls only `wifi_oss_debug_material_auto_continue_enabled` for the current session.
- Confirm the `Remote config` tray remains visible and unchanged while `Debug guards` is present.
- On a recycle entry page without a direct `sap-recycle-devices-by-technician` link, but with a discoverable `sap-warehouse-cells-recycle` link/table, confirm history status becomes loaded/empty instead of `missing-url`; the built history URL should stay same-origin and use the detected technician and warehouse.
- On a recycle entry page with no history/cells links, confirm `Dailywork technician dry-run` can detect a visible header user such as `A1BG514837` plus the selected numeric warehouse dropdown, and history status becomes loaded/empty after retry.
- If history remains `missing-url`, confirm the compact history status includes the unavailable reason and run `Dailywork technician dry-run` to inspect `technicianId`, `warehouseId`, source URL, and reason.
- Test a recycle-history duplicate where `_recycleDevicesByTechnician` has `Успешно рециклиран = Да`. Expected: duplicate warning appears and the flow does not continue without explicit `Да`.
- Test a recycle-history duplicate where `_recycleDevicesByTechnician` has `Успешно рециклиран = Не`. Expected: duplicate warning appears and the flow does not continue without explicit `Да`.
- Test a duplicate serial that appears more than once in `_recycleDevicesByTechnician` with conflicting `Да`/`Не` values. Expected MVP safety behavior: duplicate warning appears and the flow does not continue without explicit `Да`.
- Note: the current MVP uses the first DOM row for the status message; a future improvement may prefer `Да` over `Не` when any successful recycle row exists.
- Manual category change confirmation: with a dailywork assignment applied for today, click a different category card. Expected: a "Смяна на категория" dialog appears; `Отказ`/Escape/backdrop keeps the assigned category, `Да, смени` switches. Re-selecting the assigned category shows no prompt.
- Manual device change confirmation: with a dailywork assignment that named a device, toggle a different device (or deselect the assigned one) in the assigned category. Expected: a "Смяна на устройство" dialog appears and behaves like above; selecting exactly the assigned device(s) shows no prompt.
- No-assignment case: on a day with no recycle assignment (`Друго`/config gap) confirm category/device selection is NOT guarded (no confirmation dialog).
- Reset confirmation: with a dailywork assignment applied and a category/device selected, click `RESET`. Expected: a "Нулиране на избора" dialog appears; `Отказ`/Escape keeps the selection, `Да, нулирай` clears it as before. With no assignment for today, or nothing selected, `RESET` clears immediately without a prompt.
- Recycle-history 7-day window: process a serial 4-6 days ago (present in the server history), then re-enter it. Expected: duplicate warning from the server history; a serial older than 7 days is no longer flagged by the server history (local ledger still covers up to ~30 days).
- Recycle-history bounded wait: on a fresh entry page, type a known duplicate serial and press Continue immediately while the history is still loading. Expected: a brief (<=1.5s) wait, then the duplicate warning appears (Continue is re-triggered automatically); the wait never hangs and does not repeat for the same serial.
- Double-process guard (core): recycle or scrap a device, then immediately start a new entry with the same serial. Expected: the duplicate warning appears from the local ledger even though the server history has not updated yet, and the flow does not continue without explicit `Да`.
- Double-process guard (cross-action): after recycling a serial, try to scrap the same serial (and vice versa). Expected: blocked with the duplicate warning.
- Double-process guard (offline/fail-open): with recycle history unavailable (`missing-url`/`fetch-failed`/`parse-failed`), re-enter a serial processed earlier in the same browser. Expected: the local ledger still blocks it.
- Double-process guard (same gesture): confirm a normal single Continue (click or Enter) is NOT self-blocked after the serial is recorded, i.e. the device proceeds on the first attempt.
- Double-process guard (override): on the duplicate warning, click `Да` and confirm the flow proceeds for that serial; click `Не` and confirm the serial input is cleared and focused.
- Double-process guard (cross-tab): process a serial in one tab, then enter the same serial in a second tab on a fresh entry page. Expected: blocked from the shared ledger.
- Scan barcode `ABCDEFGHIJKLMNOPQRSTUVWXYZ:` with ENG layout. Expected: input remains `ABCDEFGHIJKLMNOPQRSTUVWXYZ:`.
- Scan the same barcode with BG Phonetic/BGPT and BG/BDS layouts. Expected: input is normalized to `ABCDEFGHIJKLMNOPQRSTUVWXYZ:`.
- Paste Cyrillic into the serial input. Expected: warning is shown and Continue is blocked.
- Confirm `Backspace`, `Delete`, arrows, `Ctrl+A`, `Ctrl+C`, `Ctrl+V`, and `Enter` still behave normally in the serial input.
- Choose each category and confirm the selected visual state is obvious.
- Open the same recycle step in two OSS tabs/windows. Select a category in one tab and confirm the other tab updates to the same category.
- In a mapped category with device cards, select one or more device cards and confirm the selected cards are shared across tabs/windows.
- Change the category and confirm selected device cards are cleared.
- For Dailywork production auto-selection, start from a clean same-day recycle state and a schedule row for the current logged-in technician. Expected: `DTH STB` selects category `dth_kaon_nagra` plus device `dth_kaon_kstb1001`, `SD STB` selects category `dth_kaon_nagra` only, `TP-Link EX220` selects `routers` plus `tp_link_ex220`, `NETBOX 4G` selects category `netbox`, and `Друго`/`Отпуск`/`Болничен` do not auto-select.
- Confirm Dailywork production auto-selection does not overwrite an already selected manual category or selected devices.
- Confirm the same-day Dailywork applied marker blocks repeat production apply on reload/navigation after a successful production apply.
- Press Reset after a Dailywork production selection. Expected: category/devices clear, `wifi_oss_dailywork_auto_suppressed_date_v1` is set for the current workday, and production auto-selection does not immediately reapply.
- After Reset, click the explicit floating manual Dailywork apply button. Expected: manual apply still works because it is an operator action and ignores the production suppress marker.
- When the current technician has no schedule row, confirm production Dailywork auto-selection is a no-op. Save a fallback user in the floating `ДР` panel, then click `wifi-oss-dailywork-apply-btn`; expected: fallback is used only on that explicit manual click.
- If the schedule contains multiple rows for the same `User`, confirm production and manual matching skip with no category/device apply.
- Open the floating `ДР` panel and confirm it shows the schedule table, compact current technician status, saved fallback controls, and collapsed `Инфо` metadata/device summary. Confirm panel open/close and the barcode help floating button coexist visually.
- Dailywork retry hardening: open the recycle entry page with a valid mappable schedule row while the OSS DOM/header renders slowly or the first schedule fetch is momentarily slow. Expected: the category (and device where applicable) is still auto-selected within the retry window instead of being silently skipped.
- Dailywork persistence verification: confirm that after a successful production auto-selection the selected category actually persists in `localStorage` and the panel re-renders with the selected state; a re-render must not clear it.
- Dailywork no-recycle-assignment notice: with a schedule row for the current technician that is `Друго`/`Отпуск`/`Болничен` or an unmapped device name, confirm the closable "Няма разпределение за рециклиране" modal appears, shows the schedule device when present, does NOT block recycling, and can be closed via the button, `x`, backdrop click, and `Escape`.
- Confirm the no-recycle-assignment modal appears at most once per workday (`wifi_oss_dailywork_noop_notice_date_v1`) and does NOT appear on transient failures such as undetected technician or failed schedule fetch.
- Confirm the no-recycle-assignment modal does NOT appear when a valid category/device is auto-selected.
- For each category, test at least one valid and one invalid serial:
  - `android_iptv`
  - `xplore_zapper`
  - `dth_kaon_nagra`
  - `austrian`
  - `netbox`
  - `routers`
  - `gpon`
  - `cam_modules`
  - `modems`
- For `android_iptv`, confirm the existing guards still apply and length must be 12-17 characters: valid examples include `450056000451`, `2420011067008933`, and `BG460823040142009`; invalid examples include `12345`, `BG`, `BG123`, and `123456789012345678`.
- For `xplore_zapper`, confirm MAC validation accepts exactly 12 hex characters case-insensitively and does not require A-F letters: valid examples include `840112168CB1`, `001122334455`, `AABBCCDDEEFF`, and `aabbccddeeff`; invalid examples include `840112168CB`, `840112168CB12`, `840112168CG1`, `84:01:12:16:8C:B1`, `84-01-12-16-8C-B1`, and `123 456 789 012`.
- KSTB5019/KSTB5020 MAC scanner guard: with exactly `KSTB5019 XploreTV` or `KSTB5020 XploreTV` selected in `xplore_zapper`, scan a MAC into the recycle entry serial field. Expected: the MAC is entered, focus stays in the field/browser tab, and the browser does not switch tabs or activate chrome menus from a scanner `Tab`/`Alt` suffix. `Enter` still continues the flow. With `KSTB6106 Zapper` or no single 5019/5020 device selected, the guard is inactive.
- For `cam_modules`, confirm empty serial is blocked but non-empty values are not format-validated.
- With no selected device cards, confirm validation remains category-level for the selected category.
- Select one device card and confirm the selected-device validation profile applies.
- Select multiple device cards and confirm OR validation: a serial accepted by any selected device profile can continue.
- Select a device with no implemented profile, if available in that category, and confirm category-level fallback remains acceptable.
- For selected-device profiles, spot-check:
  - Android B866: `BG` plus exactly 15 digits.
  - Android DV9161: exactly 16 digits.
  - STB ZXV B700v5: exactly 12 digits.
  - Xplore/Zapper: plain 12-hex MAC, no `:` or `-`.
  - DTH: 11 digits starting with `00`.
  - Netbox: 15-digit IMEI with Luhn check.
  - GPON confirmed devices: 16 alphanumeric characters.
  - Routers: confirmed TP-Link/Deco/HX520 devices use 13 alphanumeric characters; ZTE H3601P uses `ZTE` prefix and 15 total characters.
  - Austrian ADB Modem 2220: starts with `PI` and is exactly 19 alphanumeric characters total.
  - Austrian Huawei HA35-22 HYBRID: exactly 16 alphanumeric characters.
- For invalid serials, confirm the page does not advance and the serial field keeps focus.
- For invalid non-empty serials with help content, confirm the floating help preview appears on the right side and hides after about 5 seconds.
- Click outside the floating help preview and confirm it hides without changing serial, category, selected devices, or OSS navigation.
- In `android_iptv` with one selected device, confirm the floating help preview shows only that device help image.
- In `android_iptv` with multiple selected devices, confirm the floating help preview shows only selected-device help images and can scroll when needed.
- In `android_iptv` with no selected devices, confirm help falls back to all available Android/IPTV category help images.
- Click the yellow help button and confirm the full manual help menu opens separately from the automatic floating preview.
- Close the full manual help menu with `X` and confirm the yellow help button remains usable.
- Confirm help UI does not fill serial, change SAP/material values, change validation outcome, or navigate OSS.
- Press `RESET` and confirm the selected category, selected devices, and validation message disappear in all open OSS tabs/windows.
- After reset, press Continue again. Expected: blocked until a category is selected.
- If possible, reload or reopen the page on the next workday and confirm the old category is not retained.
- If possible, reload or reopen the page on the next workday and confirm old selected devices are not retained.

## Recycle State: EX220 SSID Warning

- Select `TP-Link EX220` or `TP-Link EX220 Home`, continue to the recycle-state page, and confirm `Ssid1`/`Ssid2` values starting with `A1...` show no warning.
- With `TP-Link EX220` or `TP-Link EX220 Home` selected, enter a populated non-`A1` SSID in `_wflowRecycleState_Ssid1` or `_wflowRecycleState_Ssid2` and confirm the yellow warning appears.
- Correct the abnormal SSID back to `A1...` and confirm the warning disappears.
- Leave both `_wflowRecycleState_Ssid1` and `_wflowRecycleState_Ssid2` empty and confirm there is no warning and Continue/Save is not blocked.
- Select another router device and enter an abnormal SSID; confirm the EX220 warning does not appear.
- Use the clipboard autofill buttons and confirm SSID/PSK/Port fields still fill normally and the EX220 warning updates without conflicting with autofill.

## Recycle State: DTH Chip Id Autofill

- Select exactly `DTH STB KAON KSTB1001`, continue to the recycle-state page, and confirm `_wflowRecycleState_SerialNoDth` (visible `Chip Id:`) is auto-filled from `_wflowRecycleState_ChipIdDth` (visible `Сериен номер:`), remains editable, gets the yellow/red marker, and `_wflowRecycleState_CardNo` (visible `Карта No:`) receives focus.
- Select exactly `DTH Nagra DTS3460`, continue to the recycle-state page, and confirm `_wflowRecycleState_SerialNoDth` (visible `Chip Id:`) is auto-filled from `_wflowRecycleState_ChipIdDth` (visible `Сериен номер:`), remains editable, gets the yellow/red marker, and `_wflowRecycleState_CardNo` (visible `Карта No:`) receives focus.
- With category `dth_kaon_nagra` selected but no concrete device selected, continue to the recycle-state page and confirm the DTH helper does not fill or focus anything.
- Select multiple DTH devices, continue to the recycle-state page, and confirm the DTH helper does not activate.
- If `_wflowRecycleState_SerialNoDth` is already non-empty before extension interaction, confirm it is not overwritten and focus is not moved by the helper.
- Confirm Continue/Save on the recycle-state page is not blocked by the DTH helper.
- Regression smoke: confirm the EX220 SSID warning still works and existing clipboard SSID/password autofill buttons still fill supported recycle-state fields normally.

## Recycle State: KSTB5019 MAC + OTT Helper

- Select exactly `KSTB5019 XploreTV` (`deviceId` `kaon_kstb5019_xploretv`) in category `xplore_zapper`, continue to the recycle-state page, and confirm `_wflowRecycleState_Mac` is auto-filled from same-page disabled `_wflowRecycleState_SerialNo`.
- With source `_wflowRecycleState_SerialNo` value `840112DA0EDB`, confirm `_wflowRecycleState_Mac` receives formatted value `84:01:12:DA:0E:DB`.
- Confirm the MAC field receives the yellow/red auto-filled marker and remains editable.
- Confirm `_wflowRecycleState_StbProfile` is set to option `OTT`, the Chosen UI shows `OTT`, and the yellow inline notice `OTT е избрано по подразбиране.` appears inside the `Тип ОТТ` fieldset.
- If `_wflowRecycleState_SerialNo` is missing, empty, or not a valid 12-hex MAC, confirm the helper does not fill `_wflowRecycleState_Mac` and does not block Continue/Save.
- If `_wflowRecycleState_Mac` is already non-empty before extension interaction, confirm it is not overwritten.
- Edit the auto-filled MAC manually and confirm the yellow/red marker is removed and the helper does not re-fill the MAC again on the same page load.
- With `KSTB5019 XploreTV` or `KSTB5020 XploreTV` selected, scan into recycle-state `_wflowRecycleState_Mac` (if editable) or `_wflowRecycleState_SerialNo`; confirm the scanner shortcut guard prevents tab/window focus steal from `Tab`/`Alt` suffix (same behavior as entry serial field).
- Manually change the OTT dropdown away from `OTT` and confirm the UI allows the change and the helper does not repeatedly force it back to `OTT`.
- Continue with no concrete device selected, category-only `xplore_zapper`, multiple selected Xplore/Zapper devices, `KSTB5020 XploreTV`, and `KSTB6106 Zapper`; confirm the KSTB5019 helper does not activate.
- Regression smoke: confirm DTH KAON/Nagra Chip Id autofill, EX220 SSID warning, clipboard autofill, and SAP/material flow still work.

## SAP/Material Step

- Continue from a valid recycle entry to the material step.
- Record whether the material input is empty or prefilled before extension interaction, if observable.
- Confirm material input selector/attributes: `id`, `name`, `class`, `value`, `readonly`, `disabled`.
- If the material input is prefilled by OSS, confirm whether the extension auto-continues and whether that is business-correct.
- If the material input is empty, confirm the quick button panel appears and the input is locked for manual typing.
- Confirm the debug/test toggle defaults to `Debug: Material auto-continue ON`; with a prefilled `MaterialId`, the page should auto-continue.
- Set the toggle to `OFF` before entering the material step and confirm a prefilled `MaterialId` leaves the SAP/material page visible.
- With toggle `OFF` and a mapped recycle category, confirm the quick button grid is filtered to the selected recycle category.
- Set the toggle back to `ON` and confirm following material pages with prefilled `MaterialId` auto-continue again.
- For mapped categories (`xplore_zapper`, `dth_kaon_nagra`, `android_iptv`, `netbox`, `routers`, `gpon`, `austrian`), confirm only the expected allowlisted material buttons appear.
- Confirm known legacy SAP/material IDs are not visible as quick buttons, while OSS-prefilled legacy values still rewrite to the current SAP before continuing.
- With one selected recycle device in a mapped category, confirm the quick-button grid is restricted to that selected device/material ID when a valid per-flow snapshot exists.
- With multiple selected recycle devices in a mapped category, confirm the quick-button grid is restricted to only those selected devices/material IDs without duplicates.
- After valid Continue from the recycle serial step, confirm selected-device material filtering still uses the same per-flow selection even if another OSS tab changes the shared selected devices before the material step is inspected.
- With one selected recycle device, a valid per-flow snapshot, and an empty `MaterialId`, confirm controlled auto-fill writes the expected SAP/material value and shows the yellow warning `Това устройство няма Material ID, стойността е попълнена автоматично.`
- With one selected recycle device, a valid per-flow snapshot, and a prefilled `MaterialId` that differs from the selected device catalog SAP/material, confirm the extension replaces the value with the catalog SAP/material before auto-continue and shows the replacement warning.
- With debug auto-continue `ON`, confirm the existing material auto-continue logic may continue after extension auto-fill; with debug auto-continue `OFF`, confirm the page remains visible with the filled SAP/material value and warning.
- For `ZTE G5B`, confirm the quick-button card and `MaterialId` use `124173`, remain `124173` after waiting more than 30 seconds, and still show the ZTE G5B / ZTE MC888A similar-device warning.
- For `Huawei B310s`, confirm the quick-button card uses `111732`; if OSS prefills another MaterialId such as `111420`, confirm it is replaced with `111732` before continuing.
- With multiple selected recycle devices that have different SAP/material IDs, confirm there is no auto-fill, there is no auto-continue, and the yellow warning `Това устройство няма Material ID, моля изберете кое е устройството.` appears.
- With a prefilled OSS `MaterialId` and no valid single selected-device snapshot, confirm the extension does not overwrite the value.
- With no selected devices in the valid per-flow snapshot, confirm the current category-level material filtering remains unchanged.
- In the ambiguous multi-select case, note the known low-priority UI follow-up: after choosing a quick button manually, the warning may disappear and the layout may shift slightly.
- For mapped categories, confirm the broad chips (`Всички`, `Интернет`, `Телевизия`, `Други`) are hidden and search only matches the allowed buttons.
- For unmapped categories, confirm the older full-list behavior remains.
- For `austrian`, select `ADB Modem 2220` and confirm valid serial fills `1200017460`; debug auto-continue `ON` may continue, while debug auto-continue `OFF` keeps the page visible.
- For `austrian`, select `Huawei HA35-22 HYBRID` and confirm valid serial fills `1200017462`; debug auto-continue `ON` may continue, while debug auto-continue `OFF` keeps the page visible.
- For `austrian`, confirm invalid ADB/Huawei serial lengths or non-alphanumeric values are blocked.
- For `austrian` with no selected device, confirm the legacy preset fallback still applies.
- For `austrian`, note whether the Huawei quick material button/card has a dedicated image; text/material fallback is acceptable for now.
- For `cam_modules`, confirm a prefilled `MaterialId` still auto-continues.
- For `cam_modules`, confirm an empty `MaterialId` returns to the main `Рециклиране на устройство` operation through the breadcrumb instead of leaving the user in the quick-button flow.
- On the returned operation page, confirm the red CAM helper text appears next to `Служебно прекратяване` and that `Служебно прекратяване` is not clicked automatically.
- Open a normal `Рециклиране на устройство` operation manually and confirm the CAM helper text does not appear.
- Click a quick material button and confirm the input receives the numeric material ID and fires the expected OSS behavior.
- Check whether all devices are shown or only the expected group for the selected recycle category.
- Use the search box and category chips (`Всички`, `Интернет`, `Телевизия`, `Други`) and confirm filtering behavior.

## Labels and Barcodes

- Open a warehouse list with `_warehouseMaterialsCellList` and confirm the injected print button appears.
- Print/export labels with no selected rows and confirm serial numbers render.
- Open a recycle devices list with `_recycleDevicesByTechnician`.
- Select one or more rows and confirm printing uses exactly the selected rows, including any row with `Успешно рециклиран = Не`.
- With no selected rows, confirm printing uses only successful rows (`Успешно рециклиран = Да`) and excludes `Не` rows, for `Принтирай баркод`, `Принтирай Всичко`, and the injected printer icon.
- With no selected rows and no successful rows, confirm a clear alert is shown telling the operator to select rows manually, and nothing is printed.
- Confirm barcode labels include expected name, serial, and SAP ID where available.

## Clipboard SSID/Password Autofill

- On a supported Wi-Fi OSS form (recycle-state or correct-wifi-settings), test manual `ПОПЪЛНИ` with a known clipboard sample.
- Test `АВТОМАТИЧНО` with a recognized sample and then with unrelated clipboard text.
- Confirm hidden/background tabs do not unexpectedly fill forms.
- Confirm fields for ports, Wi-Fi test, SSID1/SSID2, PSK1/PSK2, and custom request update correctly.
- For **HX520 Home**, copy a label sample containing model `HX520`, `SSID:` with `A1_XXXX`, and `Wireless Password: <pass>`. Expected after `ПОПЪЛНИ` or `АВТОМАТИЧНО`:
  - port count `2`
  - `Тествай Wifi` = `Да`
  - `Ssid1` = normalized base SSID (for example `A1_1A77`)
  - `Ssid2` = same base with `_5G` suffix (for example `A1_1A77_5G`)
  - `Psk1` and `Psk2` = password from `Wireless Password:`
- For **TP-Link EX220/NX220**, confirm both `Wireless Password:` and `Wireless Password/PIN:` label variants parse the password.
- For **MF296R**, **MC801A**, **H3601P**, and other 5G models, confirm `Ssid2` gets `_5G` when the label exposes only one SSID.
- Regression: EX220 SSID warning and recycle-state helpers still behave normally after clipboard autofill.

## Reload Extension

- On an OSS page that shows the injected button row (`ПОПЪЛНИ`, `АВТОМАТИЧНО`, `RESET`, `Reload Extension`), click `Reload Extension`.
- Expected: confirmation dialog `Презареждане на extension` with `Да, презареди` / `Отказ`; cancel keeps the page unchanged.
- Confirm `Да, презареди` reloads the extension and refreshes the same tab back to the same OSS URL/step.
- After reload, confirm extension-owned UI reappears (recycle panel, clipboard buttons, material panel, etc.) without requiring a manual Chrome `Load unpacked` reload.
- If automatic reload fails, confirm the button re-enables and the alert points to `chrome://extensions/` or `edge://extensions/`.

## SharePoint OSSRecycleSchedule Widget

- Open `https://a1g.sharepoint.com/sites/o365RCR/Lists/OSSRecycleSchedule/` (or the equivalent list view URL matched by the manifest).
- Confirm a Bulgarian date/time widget appears in the list title row near the sync icon.
- Expected format examples: `10 юли 2026г.` and `Петък 9:26`.
- Wait at least 30 seconds and confirm the time updates.
- Confirm no OSS recycle category panel, clipboard autofill buttons, SAP/material panel, or recycle entry validation appears on SharePoint.
- Navigate within the list or refresh the page and confirm the widget reappears after SharePoint re-renders the header.

## Recent Regression Checks

- Confirm HX520 Home clipboard autofill fills `Ssid2` with `_5G` and reads password from `Wireless Password:`.
- Confirm `Reload Extension` reloads the extension and refreshes the current OSS tab after confirmation.
- Confirm SharePoint OSSRecycleSchedule shows the date/time widget and does not run OSS recycle runtime.
- Confirm clipboard SSID/password autofill still works.
- Confirm label generation still works.
- Confirm Austrian label generation still works.
- Confirm CAM Modules flow still works.
- Confirm material filtering by recycle category still works for the mapped categories.
- Confirm selected device cards restrict matching SAP/material quick buttons to the valid per-flow selected devices/material IDs; safe single-candidate selections can fill empty `MaterialId`, and the existing material auto-continue logic applies after extension fill.
- Confirm Austrian no-selected-device legacy fallback still works.
- Confirm `cam_modules` and `modems` remain unchanged during the next regression pass.
- Confirm the `Material auto-continue` debug toggle still works and does not freeze the OSS page.

## Evidence to Send Back to Codex

When something does not match expectations, send:

- screenshot before and after the action;
- DOM snippet around the target form/input/button;
- element attributes: `id`, `name`, `class`, `type`, `value`, `disabled`, `readonly`, `data-*`;
- visible button texts;
- observed click/Enter behavior;
- DevTools console errors.
