# Recycle Device Validation Rules

**Status:** Human-authored input for future validation profiles  
**Current runtime behavior:** Partially implemented through predefined local profiles when concrete devices are selected
**Scope:** Future category/device validation rules for recycle device entry

## Important Notes

- This file contains devices that may not be added to `RECYCLE_DEVICE_CATALOG_RAW` yet.
- This file does not describe every device currently present in the extension.
- Device names here come from labels/names visible in the interface.
- This file has no `austrian` devices yet.
- This file has no `modems` devices yet.
- Do not treat every rule in this file as current extension behavior; only profiles implemented in `Extension/content.js` are active.
- Do not add missing devices to the catalog only because they are mentioned here.
- Do not change `validateRecycleSerial(...)` only because a rule is described here.

## Future Validation Direction

In the future, every concrete device should be able to have its own `validationProfileId`.

The extension should use standardized predefined validation profiles so that new devices can be added safely and consistently. The dashboard or any future config layer may choose only from predefined profiles. It must not provide arbitrary JavaScript, arbitrary regex, or unreviewed validation logic.

Device-level validation profiles activate only when there is a selected device or selected devices.

If the user selected only a category and did not select a concrete device, the extension should keep falling back to the current category-level validation behavior.

OR logic should mainly be used for future multi-select:

```text
category selected, no selected devices -> current category-level validation fallback
one selected device -> serial must match that device profile
multiple selected devices -> serial must match at least one selected device profile
```

This keeps the first implementation safe: category behavior remains stable until the operator selects concrete device cards.

Currently implemented selected-device profiles include:

- `android_b866v2f02_bg_plus_15_digits`
- `android_dv9161_16_digits`
- `android_zxv_b700v5_12_digits`
- `xplore_zapper_mac12_hex_plain`
- `dth_11_digits_prefix_00`
- `imei15_luhn`
- `router_13_alnum`
- `router_zte_h3601p_zte_prefix_15_alnum`
- `gpon_16_alnum`

Future custom categories should be supported in the architecture. A custom category should be able to own devices in the same way as current categories. This is a future architecture goal, not a runtime task now.

---

## Android TV & ZTE IPTV

### B866V2F02 (AndroidTV) (121678)

Future device-level rule:

- serial starts with `BG`;
- after `BG` there are exactly 15 digits;
- total length is exactly 17 characters;
- no other letters are allowed.

Possible future profile:

```text
android_b866v2f02_bg_plus_15_digits
```

### DV9161 (AndroidTV) (121679)

Future device-level rule:

- serial must be exactly 16 digits.

Possible future profile:

```text
android_dv9161_16_digits
```

### STB ZXV B700v5 (114225)

Future device-level rule:

- serial must be exactly 12 digits.

Possible future profile:

```text
android_zxv_b700v5_12_digits
```

## GPON

The `16 alphanumeric` rule is a device-level rule only for the GPON models listed in this file. It must not automatically replace the whole current category-level GPON validation logic.

If no concrete GPON device is selected, the extension should keep using the current category-level GPON validation fallback.

### ZTE ZXHN F600

Future device-level rule:

- serial is exactly 16 characters;
- letters and digits are allowed.

Confirmed current catalog entry:

```js
{
  deviceId: "zte_zxhn_f600",
  categoryId: "gpon",
  displayName: "ZTE ZXHN F600",
  materialId: "118564",
  imagePath: "images/devices/16x9/ZTE_ZXHN_F600.webp"
}
```

Do not duplicate this entry in `Extension/content.js`; update it only in a dedicated catalog patch if business data changes.

### GPON CPE ZXHN F670V

Future device-level rule:

- serial is exactly 16 characters;
- letters and digits are allowed.

### Huawei GPON HG8145V5 (118560)

Future device-level rule:

- serial is exactly 16 characters;
- letters and digits are allowed.

### GPON CPE ZXHN F660OP / F6600P

Future device-level rule:

- serial is exactly 16 characters;
- letters and digits are allowed.

Confirmed display-name correction:

- older label/catalog text said `GPON CPE ZXHN F660OP`;
- current catalog text is `GPON CPE ZXHN F6600P`;
- the issue is an `O` versus `0` confusion.

Do not rename it again in a validation-only patch.

Possible future profile for the listed GPON devices:

```text
gpon_16_alnum
```

## XPLORE & ZAPPER (5019/5020 & Zapper)

In this document, "valid MAC" means the same format currently accepted by the extension:

- exactly 12 hexadecimal characters;
- no `:` separators;
- no `-` separators;
- no spaces;
- no other symbols.

### KSTB6106 Zapper

Future device-level rule:

- valid plain 12-hex MAC format.

### KSTB5019 XploreTV

Future device-level rule:

- valid plain 12-hex MAC format.

Runtime note (implemented): when exactly this device is selected in `xplore_zapper`, the extension also blocks barcode-scanner prefix/suffix keys (`Tab`, `Alt`, tab-switch shortcuts) on the recycle entry serial field and recycle-state serial/MAC fields so MAC scans do not steal browser focus. See `Serial Keyboard Layout Protection` in `PROJECT_MAP.md`.

### KSTB5020 XploreTV

Future device-level rule:

- valid plain 12-hex MAC format.

Runtime note (implemented): same MAC scanner shortcut guard as KSTB5019 when exactly this device is selected in `xplore_zapper`.

Possible future profile:

```text
xplore_zapper_mac12_hex_plain
```

## DTH Kaon & Nagra

The `00` prefix requirement applies only to these two described devices:

- `DTH STB KAON KSTB1001`;
- `DTH Nagra DTS3460`.

Both must be 11 digits long and start with `00`.

### DTH STB KAON KSTB1001

Future device-level rule:

- code starts with `00`;
- code is exactly 11 digits.

### DTH Nagra DTS3460

Future device-level rule:

- code starts with `00`;
- code is exactly 11 digits.

Possible future profile:

```text
dth_11_digits_prefix_00
```

## NETBOX

Future category/device rule:

- all devices in this category should validate as valid IMEI.

Current assumption remains:

```text
15 digits + Luhn check
```

Possible future profile:

```text
imei15_luhn
```

## Рутери

Common future notes for the described router devices:

- serial must not be a MAC address;
- serial must not be only 8 characters.

### TP-Link EX220

Future device-level rule:

- serial is exactly 13 characters;
- letters and digits are allowed.

### TP-Link EX220 Home

Future device-level rule:

- serial is exactly 13 characters;
- letters and digits are allowed.

### HX520 Home

Implemented device-level rule via profile `router_13_alnum`:

- serial is exactly 13 alphanumeric characters;
- letters and digits are allowed.

Clipboard WiFi label autofill (recycle-state / correct-wifi-settings):

- detected by model keyword `HX520` in clipboard text;
- uses TP-Link parser `parseForEX220` for `SSID:` blocks;
- password label pattern: `Wireless Password:` (also accepts `Wireless Password/PIN:`);
- port count `2`, 5G enabled;
- `Ssid2` is generated as `<Ssid1>_5G` when only one SSID is present on the label.

### Deco M4 AC1200

Future device-level rule:

- serial is exactly 13 characters;
- letters and digits are allowed.

Possible future profile for the listed non-ZTE routers:

```text
router_13_alnum
```

### ZTE ZXHN H3601P

Future device-level rule:

- serial starts with `ZTE`;
- serial is exactly 15 characters;
- letters and digits are allowed.

Possible future profile:

```text
router_zte_h3601p_zte_prefix_15_alnum
```
