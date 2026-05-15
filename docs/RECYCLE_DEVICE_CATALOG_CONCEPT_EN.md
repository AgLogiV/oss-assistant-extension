# Future Recycle Device Redesign Concept

**Status:** Concept / roadmap document  
**Scope:** Future recycle device redesign and device catalog model  
**Not current behavior:** This document describes the intended future direction. It does not mean all described features are already implemented.  
**Implementation rule:** Changes must be done step by step, with small patches, tests, `git diff` review, and separate commits.  
**Do not break:** Clipboard autofill, label/barcode generation, CAM Modules flow, SAP/material quick buttons, material auto-continue debug toggle, and current serial validation.

## Main Idea

The current recycle entry screen already has a good foundation: the user chooses a device category for the workday, and the extension then uses that category for serial validation and SAP/material quick button filtering.

The new idea is to take this screen one step further. After a category is selected, the smaller cards should no longer be used mainly for switching to another category. Instead, they should become a device selection area that shows the concrete devices belonging to the selected category.

The intended workflow is:

1. The user selects a device category.
2. The selected category remains visually large and highlighted on the left.
3. The right side shows the concrete devices that belong to that category.
4. The user can select one or more concrete devices.
5. This selection can later be used for SAP/material filtering, help images, and more precise validation rules.

## Proposed Logic

The new implementation should gradually move toward a device catalog model. In this model, both categories and devices have stable internal identifiers. Categories use a `categoryId`, for example `netbox`, `routers`, or `gpon`. Concrete devices use a `deviceId`, for example `huawei_b310`, `xplore_5019`, or `zte_g5b1`.

The `deviceId` must not be the SAP/material number and must not be a free display name. The SAP/material number is a business value used for filling the OSS material field, but it should not be the primary identity of the device. The display name may change, while the `deviceId` should remain stable.

Each device should be described as a profile containing its category, visible name, SAP/material number, image, help image, warning texts, and validation profile. This allows the recycle UI, SAP/material quick buttons, help menu, and future dashboard to use the same logical structure.

In the first phase, validation can remain category-level. Later, concrete devices can receive device-level validation through safe predefined validation profiles, not through arbitrary logic coming from the dashboard.

This approach is better than the current category-to-SAP allowlist model because it does not treat the SAP number as the identity of the device. Instead, the device is the main object, and the SAP number is only one of its properties. This allows better management of images, help menus, warning texts, legacy SAP numbers, and future dashboard settings.

This is the preferred architectural direction, but it must be implemented gradually: first a local device catalog in the extension, then the recycle UI should read from it, then SAP/material filtering should move through `deviceId`, and only after that should the dashboard start returning the same type of structure.

## Current Visual Model

The current screen has two main states.

When no category is selected, all categories are shown as evenly distributed cards. Each card has an image, a category name, and a dark bottom title bar. This state is good and should be preserved as the starting point.

When a category is selected, the selected card becomes large and moves to the left. The remaining categories become smaller and are arranged on the right. This looks good visually, but the logic should change: the right-side area should no longer show the other categories. It should show the concrete devices belonging to the selected category.

## New Visual Model

After a category is selected, the screen should be logically split into two parts.

The left side should contain the selected category. It should clearly show that it is active through a larger size, red border or red bottom bar, check indicator, and a strong selected state.

The right side should show the devices from that category. These cards should be smaller, but visually consistent with the category cards. Each device card should have a 16:9 image, device name, and selected/unselected state.

For example, if the user selects `Android TV & ZTE IPTV`, the right side should show the concrete devices from that group, such as Android TV models, ZTE IPTV models, and other related devices. If the user selects `GPON`, the right side should show the GPON devices. If the user selects `Рутери`, the right side should show the router models.

## Selecting More Than One Device

The new model should support multi-select. The user should be able to select one, two, or more devices from a category.

This matters because in real work, an operator may process several similar models from the same group during the day. For example, they may select several Netbox devices, several router models, or several GPON models.

In the first phase, this selection does not need to introduce separate validation rules for every device. For now, serial validation can continue to work at category level. Later, when there are reliable rules for each model, device-level validation can be added.

## Relation to SAP/Material Quick Buttons

The devices shown in the new recycle UI should be connected to the same logic used by the SAP/material quick buttons.

It is not good to have two separate device lists: one for the recycle entry screen and another for the SAP/material screen. A shared or compatible data structure is better, where each device has a category, name, SAP/material ID, image, and optional additional data.

This way, when the user selects a category and concrete devices, the next SAP/material step can show only the relevant devices or at least prioritize them.

The current behavior must not be broken. If OSS has already prefilled `MaterialId`, the existing auto-continue behavior should be preserved carefully unless a later decision changes it. If `MaterialId` is empty, the quick button grid should remain available and should be filtered according to the recycle context.

## Images

The new design needs suitable 16:9 images.

There is already logic for category images under `images/categories/16x9/`. For concrete devices, existing device images may be used temporarily for testing, and a separate folder for 16:9 device cards can be created later, for example `images/devices/16x9/`, because these images should have an aspect ratio similar to the other cards.

Images should be consistent: devices must not be distorted, the aspect ratio should be the same, contrast should be good, and there should be a clear visual connection to the real device.

If a new asset directory is added, `manifest.json` must also be checked so the images are available through `web_accessible_resources`.

## Help Menu for the Correct Barcode

After selecting a category and a concrete device, the user should be able to open a help hint.

This help menu must not perform any actions in OSS. It should only be visual assistance for the user.

Its main purpose is to show an image of the label on the relevant device and clearly show which barcode should be scanned and which should not.

Which barcode is correct or incorrect will be shown inside the image itself. Therefore, the key requirement here is the visualization method and the placement of this hint image, not dynamic barcode marking by the extension.

If multiple devices are selected, the help menu can later show multiple help cards, tabs, a carousel, or another convenient layout. The exact UX can be decided later. The important point is that the help menu must remain informational and must not automatically change the serial field, material field, or OSS navigation.

## Validation Logic

In the first phase, validation should remain category-level.

This means selecting a concrete device will not yet introduce separate rules for every model. Serial validation will continue to be determined by the selected recycle category.

Important current behaviors must be preserved:

Without a selected category, the user must not be able to continue. An empty serial must be blocked. An invalid serial must show a clear inline message. The serial number field must keep focus when there is an error. `CAM Модули` must block an empty serial but must not apply strict format validation.

Device-level validation can be added later, but only when there are reliable and verified requirements for the concrete models.

## Reset and Daily Reset

The current logic has a daily reset for the selected category. In the new model, this should also apply to the selected concrete devices.

If the user selected a category and devices today, that choice should not automatically carry over to the next workday.

The Reset button should clear not only the selected category, but also the selected devices, visual selected states, validation messages, and any pending material context, if that is safe for the current flow.

## CAM Modules Flow

`CAM Модули` must remain a special flow and must not be broken by the redesign.

Expected behavior: if OSS prefilled `MaterialId`, the current auto-continue behavior can continue to work. If `MaterialId` is empty, the extension should return the user to the main `Рециклиране на устройство` operation through the breadcrumb and show helper text next to the `Служебно прекратяване` button.

The extension must not automatically click `Служебно прекратяване`. This behavior must remain limited to `CAM Модули` and must not be applied to other categories.

## Dashboard Concept

The dashboard should be a remote configuration/admin layer, not a required runtime dependency.

The main principle should remain: local-first extension plus remote dashboard override.

The extension must be able to work reliably with local fallback data even when the dashboard is offline, slow, unreachable, or returns incomplete configuration.

Remote config must be validated before use. It is not a good idea for the remote list to directly replace the local list, because with incomplete dashboard config some devices may disappear from the UI.

In the future, the dashboard may manage categories, devices, SAP/material IDs, images, warning texts, help images, rewrite rules, simple validation rules, enabled/disabled statuses, and configuration version/revision.

However, risky runtime mechanisms should not be moved into the dashboard too early. This includes DOM selectors, OSS navigation behavior, CAM flow logic, auto-continue logic, clipboard parsers, keyboard normalization, and label/barcode generation. These parts should remain locally controlled in the extension.

## Render / Hosting Notes

The current dashboard idea is already connected to an external Render endpoint: `https://oss-assistant.onrender.com/`.

Render is a suitable option for a small internal tool, but care is needed around uploaded image persistence, environment variables, `ADMIN_TOKEN`, data backups, deploy config, cold start/free tier sleep, and rollback strategy.

Critical images should preferably be packaged in the extension or uploaded to a persistent storage solution. Important uploads should not rely only on temporary storage on the hosting platform.

## Possible Dashboard Hosting Options

The dashboard should be treated as a **remote admin/config layer**, not as a required dependency for the extension to work. The extension should always be able to work with its local fallback data, even if the dashboard is offline, unreachable, or temporarily broken.

### 1. Cloud Hosting, for Example Render

The dashboard can be hosted externally on a service such as **Render**. This provides a public HTTPS address, for example:

```text
https://oss-assistant.onrender.com
```

Advantages:

- easy to test from different machines;
- HTTPS is available without internal network setup;
- it does not depend on one specific company laptop;
- suitable for a prototype and early version.

Disadvantages:

- on a free tier, the service may go to sleep after a period without activity;
- the first request after sleep may be slow;
- local files/uploads may not be persistent on a free plan;
- `ADMIN_TOKEN`, environment variables, and backups must be handled carefully;
- it is not ideal if the dashboard must be accessible only from the internal network.

This option is good for testing and proof-of-concept, but for real usage, persistent storage, backups, and security must be decided.

### 2. Internal Laptop / Company Machine

The dashboard can be hosted on a company laptop or computer that stays powered on and is connected by LAN cable to the internal corporate network.

Example idea:

```text
company laptop / PC
↓
Node/Express dashboard server
↓
access from other workstations through internal IP/DNS
```

Advantages:

- the dashboard stays only inside the internal network;
- no cloud hosting;
- no Render sleep;
- it may be enough for a small internal tool.

Disadvantages:

- the machine must always remain powered on;
- Windows updates/restarts can stop the service;
- a static IP or internal DNS name is needed;
- firewall rules must allow the port;
- data and uploads need backups;
- if the machine is moved or turned off, the dashboard stops.

This option is possible, but it is not the most professional choice for long-term maintenance.

### 3. Raspberry Pi / Mini PC Inside the Internal Network

The dashboard can also run on a Raspberry Pi or small Mini PC connected to the internal network.

Advantages:

- cheap and compact solution;
- can stay powered on permanently;
- does not depend on a company laptop;
- suitable for a small Node/Express dashboard.

Disadvantages:

- stable storage is needed, preferably SSD, not only an SD card;
- backups are still required;
- auto-start after restart must be configured;
- IP/DNS/firewall setup is still needed;
- maintenance remains local to the team.

A Mini PC or Raspberry Pi can be a good internal option if no VM/server is available.

### 4. Internal VM or IT-Managed Server

The best corporate option is to host the dashboard on an internal VM/server managed by IT or stable infrastructure.

Advantages:

- more reliable than a laptop;
- easier backup;
- can use internal DNS;
- better access control and security;
- more suitable for real production usage;
- HTTPS can be configured with an internal certificate.

Disadvantages:

- requires IT cooperation;
- setup is slower;
- there may be internal procedures for access, deployment, and maintenance.

This is the best option if the dashboard becomes an important part of the workflow.

## Important Principle

No matter where the dashboard is hosted, the extension must remain **local-first**:

```text
extension local config → always works
remote dashboard config → optional override
```

The dashboard should be able to add, update, or override configuration, but it must not become a critical dependency. If the dashboard is offline, asleep, unreachable, or returns invalid data, the extension must continue to work with its local data.

## Implementation Approach

This change must not be made as one large patch. It is better to split it into small steps.

First, there should be a read-only analysis of the current recycle UI, SAP/material filtering, and asset structure. Then Codex should propose a plan for the data model and UI behavior. Only after that should implementation begin.

A good order of work would be:

1. Analyze the current code and risks.
2. Plan the new category → device model.
3. Make a small patch for showing devices after category selection.
4. Make a separate patch for multi-select state.
5. Make a separate patch for the SAP/material filtering connection.
6. Make a separate patch for the help menu and help images.
7. Test in the real/demo OSS environment.
8. Review `git diff`.
9. Commit only after the result is stable.

It is important not to break the existing functionality: clipboard SSID/password autofill, label/barcode generation, Austrian label generation, CAM Modules flow, SAP/material quick buttons, material auto-continue debug toggle, and serial keyboard normalization.

The overall idea is to make the recycle screen more useful and closer to the real work process without losing the stability of the already working features.
