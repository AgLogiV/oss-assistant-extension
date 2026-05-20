# OSS Manual Test Checklist

Use this checklist in the real/demo OSS environment after loading the extension from `Extension/` with Chrome `Load unpacked`.

## Before Testing

- Confirm the extension is enabled and the current URL matches one of the manifest domains.
- Open DevTools Console so runtime errors are visible.
- Start from a clean tab/session when testing daily category behavior.
- If testing dashboard models, note whether `https://oss-assistant.onrender.com/api/models` is reachable from the network.
- For catalog/device/help-image changes, run the dev-only check `node Extension/scripts/validate-recycle-catalog.js`. Expected result: `Result: PASS`.

## Recycle Entry: Category and Serial Validation

- Open the recycle device entry step and confirm the category panel appears.
- Capture the page title/URL/path if visible.
- Confirm the serial input attributes: `id`, `name`, `class`, `value`, `readonly`, `disabled`.
- Without choosing a category, enter a serial and press Continue. Expected: blocked with an inline message.
- Test Continue by mouse click and by pressing Enter in the serial field.
- Scan barcode `ABCDEFGHIJKLMNOPQRSTUVWXYZ:` with ENG layout. Expected: input remains `ABCDEFGHIJKLMNOPQRSTUVWXYZ:`.
- Scan the same barcode with BG Phonetic/BGPT and BG/BDS layouts. Expected: input is normalized to `ABCDEFGHIJKLMNOPQRSTUVWXYZ:`.
- Paste Cyrillic into the serial input. Expected: warning is shown and Continue is blocked.
- Confirm `Backspace`, `Delete`, arrows, `Ctrl+A`, `Ctrl+C`, `Ctrl+V`, and `Enter` still behave normally in the serial input.
- Choose each category and confirm the selected visual state is obvious.
- Open the same recycle step in two OSS tabs/windows. Select a category in one tab and confirm the other tab updates to the same category.
- In a mapped category with device cards, select one or more device cards and confirm the selected cards are shared across tabs/windows.
- Change the category and confirm selected device cards are cleared.
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
- For mapped categories (`xplore_zapper`, `dth_kaon_nagra`, `android_iptv`, `netbox`, `routers`, `gpon`), confirm only the expected allowlisted material buttons appear.
- With one selected recycle device in a mapped category, confirm its material button is shown first when it exists in the current material model list.
- With multiple selected recycle devices in a mapped category, confirm their material buttons are shown first without duplicates, followed by the remaining category buttons.
- After valid Continue from the recycle serial step, confirm selected-device material ordering still uses the same per-flow selection even if another OSS tab changes the shared selected devices before the material step is inspected.
- Confirm selected recycle devices do not auto-fill `MaterialId` and do not restrict the grid to selected devices only.
- For mapped categories, confirm the broad chips (`Всички`, `Интернет`, `Телевизия`, `Други`) are hidden and search only matches the allowed buttons.
- For unmapped categories, confirm the older full-list behavior remains.
- For `austrian`, treat material filtering as TODO/unmapped until the missing/unclear device is added.
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
- Select one or more rows and confirm printing uses selected rows.
- With no selected rows, confirm printing uses all rows.
- Confirm barcode labels include expected name, serial, and SAP ID where available.

## Clipboard SSID/Password Autofill

- On a supported Wi-Fi OSS form, test manual `ПОПЪЛНИ` with a known clipboard sample.
- Test `АВТОМАТИЧНО` with a recognized sample and then with unrelated clipboard text.
- Confirm hidden/background tabs do not unexpectedly fill forms.
- Confirm fields for ports, Wi-Fi test, SSID1/SSID2, PSK1/PSK2, and custom request update correctly.

## Recent Regression Checks

- Confirm clipboard SSID/password autofill still works.
- Confirm label generation still works.
- Confirm Austrian label generation still works.
- Confirm CAM Modules flow still works.
- Confirm material filtering by recycle category still works for the mapped categories.
- Confirm selected device cards only prioritize matching SAP/material quick buttons first; they do not auto-fill `MaterialId` or hide other category buttons.
- Confirm the `Material auto-continue` debug toggle still works and does not freeze the OSS page.

## Evidence to Send Back to Codex

When something does not match expectations, send:

- screenshot before and after the action;
- DOM snippet around the target form/input/button;
- element attributes: `id`, `name`, `class`, `type`, `value`, `disabled`, `readonly`, `data-*`;
- visible button texts;
- observed click/Enter behavior;
- DevTools console errors.
