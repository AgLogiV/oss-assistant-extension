# External Recycle Catalog Runtime Adapter

Checkpoint: `464b564 Add external recycle catalog runtime adapter` on branch `codex/external-recycle-catalog-runtime`.

This document records the first working runtime support for a colleague-provided simple recycle catalog file and the intended direction for making an approved external source the default source for newly added remote recycle devices.

## Source

Tested external source:

```text
https://raw.githubusercontent.com/AgLogiV/oss-assistant-extension/main/config/recycle-device-catalog.fixture.json
```

This file is not the full OSS Assistant remote schema. It is a simple root object with a top-level `devices` array and no required `schemaVersion`, `revision`, or `runtimeContract`. The extension detects this as `external_simple_v1` and normalizes it internally in `Extension/background.js` before the existing resolved plan/apply-safe flow sees it.

The existing full OSS remote schema path remains unchanged. GitHub Pages config JSON under `oss-assistant-config` still uses the normal schema/validation/runtime-contract path.

## Adapter Contract

For `external_simple_v1`, `background.js` synthesizes the internal remote contract fields needed by the existing runtime:

- `schemaVersion`
- stable hash-based `revision`
- `runtimeContract`
- `generatedMaterialFilters` as metadata only
- `remoteMaterialModels`

Device field normalization keeps the safe runtime fields already understood by the extension:

- `deviceId`
- `categoryId`
- `displayName`
- `materialId`
- `legacyMaterialIdsJson` -> `legacyMaterialIds`
- `imagePath`
- `helpImagePath`
- `warningText`
- `validationProfileId`
- `enabled`

Unsupported external-only fields such as `title` and `sortOrder` are dropped.

SAP/material IDs from the external file are accepted through generated `remoteMaterialModels`. They do not need to exist in the packaged local material model list, but they still go through the existing `remoteAdditionsAuto`, `remoteMaterialAuto`, and `remoteMaterialModelsAuto` gates plus content-side revalidation.

Only new/unknown external devices are auto-added for now. Existing local packaged devices from the external file are not auto-overridden, so the local catalog remains the base authority and fallback.

## Images

The adapter supports:

- extension-relative `images/...` paths;
- approved HTTPS image URLs from a small explicit host allowlist.

Unsafe protocols and URL forms are rejected:

- `http:`
- `data:`
- `file:`
- `javascript:`
- URLs with credentials
- unapproved HTTPS hosts

This HTTPS image allowance is for the external simple adapter path. It must not be generalized into arbitrary remote image authority without explicit review.

## Cache And Refresh

The existing source-scoped cache/LKG behavior remains required:

- source URL is part of the cached metadata;
- LKG is ignored when the active source does not match the cached source URL;
- failed refresh keeps the last known good source data or local fallback;
- `Clear` removes remote cache/LKG/meta/status and remote overlays;
- selected-device storage remains unchanged.

Future default-source direction:

- an approved external source may become the default remote source for newly added devices;
- refresh should remain based on last successful fetch age, with the current suggested TTL of 6 hours;
- manual `Refresh remote` should bypass the TTL for demo/testing;
- failed refresh must keep LKG/local fallback and must not block packaged local recycle behavior.

## Browser Smoke

External adapter browser smoke passed with the raw GitHub source above:

- tray showed `source external`;
- tray showed `contract v1 ok`;
- tray showed `auto remote applied 2`;
- tray showed `auto material 2`;
- tray showed `fresh`;
- tray showed `LKG yes`;
- external devices appeared:
  - `BOJIDAT NETBOX / 888888`
  - `BOJKATA RUTERA BRAT / 9191919191`
- external images rendered;
- `BOJIDAT NETBOX` SAP/material `888888` filled correctly into an empty Material Id field;
- selected remote-added devices persist after page refresh;
- local plus remote selected devices both persist after page refresh.

The initial `Extension context invalidated` after reloading the unpacked extension was treated as expected Chrome extension reload behavior; refreshing the OSS page, then `Clear`, `Use debug source`, and `Refresh remote` recovered the test flow.

## Protected Areas

The external simple adapter must not move runtime authority into remote JSON for:

- CAM Modules flow;
- modems special behavior;
- clipboard autofill;
- labels/barcodes;
- dashboard/API;
- OSS navigation;
- selected-device storage model;
- arbitrary JavaScript;
- arbitrary regex validation;
- DOM selectors;
- `rewriteMap`.

Validation profile implementations remain local code. Remote `validationProfileId` values may only reference implemented local profiles. `generatedMaterialFilters` remains metadata/non-authority.

## Next Direction

The next runtime direction is to decide whether the approved external source should replace the current GitHub Pages production source for newly added devices. That should be a separate guarded patch, not a schema-loosening change.

Required follow-up decisions before defaulting to the external source:

- final approved external source URL and ownership;
- exact host permission pattern acceptable for Chrome MV3;
- approved HTTPS image host list and review process;
- whether local-device conflicts stay skipped or become review-only diagnostics;
- whether validator/tooling should also understand `external_simple_v1` outside runtime;
- operator status text for default external source versus debug source.

Rollback remains straightforward: revert the default-source patch or clear the source override/cache, then rely on local packaged fallback.
