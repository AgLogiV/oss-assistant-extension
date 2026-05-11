# OSS Manual Test Checklist

Use this checklist in the real/demo OSS environment after loading the extension from `Extension/` with Chrome `Load unpacked`.

## Before Testing

- Confirm the extension is enabled and the current URL matches one of the manifest domains.
- Open DevTools Console so runtime errors are visible.
- Start from a clean tab/session when testing daily category behavior.
- If testing dashboard models, note whether `https://oss-assistant.onrender.com/api/models` is reachable from the network.

## Recycle Entry: Category and Serial Validation

- Open the recycle device entry step and confirm the category panel appears.
- Capture the page title/URL/path if visible.
- Confirm the serial input attributes: `id`, `name`, `class`, `value`, `readonly`, `disabled`.
- Without choosing a category, enter a serial and press Continue. Expected: blocked with an inline message.
- Test Continue by mouse click and by pressing Enter in the serial field.
- Choose each category and confirm the selected visual state is obvious.
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
- For `cam_modules`, confirm empty serial is blocked but non-empty values are not format-validated.
- For invalid serials, confirm the page does not advance and the serial field keeps focus.
- Press `RESET` and confirm the selected category and validation message disappear.
- After reset, press Continue again. Expected: blocked until a category is selected.
- If possible, reload or reopen the page on the next workday and confirm the old category is not retained.

## SAP/Material Step

- Continue from a valid recycle entry to the material step.
- Record whether the material input is empty or prefilled before extension interaction, if observable.
- Confirm material input selector/attributes: `id`, `name`, `class`, `value`, `readonly`, `disabled`.
- If the material input is prefilled by OSS, confirm whether the extension auto-continues and whether that is business-correct.
- If the material input is empty, confirm the quick button panel appears and the input is locked for manual typing.
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

## Evidence to Send Back to Codex

When something does not match expectations, send:

- screenshot before and after the action;
- DOM snippet around the target form/input/button;
- element attributes: `id`, `name`, `class`, `type`, `value`, `disabled`, `readonly`, `data-*`;
- visible button texts;
- observed click/Enter behavior;
- DevTools console errors.
