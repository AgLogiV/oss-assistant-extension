# External Recycle Catalog Runtime Adapter

Checkpoints on branch `codex/external-recycle-catalog-runtime`:

- `464b564 Add external recycle catalog runtime adapter`
- `d168f73 Use external recycle catalog as default source`

This document records runtime support for a colleague-provided simple recycle catalog file. The approved external raw source is now the default/non-debug remote source for newly added recycle devices on this branch.

## Source

Default external source:

```text
https://raw.githubusercontent.com/AgLogiV/oss-assistant-extension/main/config/recycle-device-catalog.fixture.json
```

This file is not the full OSS Assistant remote schema. It is a simple root object with a top-level `devices` array and no required `schemaVersion`, `revision`, or `runtimeContract`. The extension detects this approved source as `external_simple_v1` and normalizes it internally in `Extension/background.js` before the existing resolved plan/apply-safe flow sees it.

The existing full OSS remote schema path remains unchanged. GitHub Pages config JSON under `oss-assistant-config` still uses the normal schema/validation/runtime-contract path.

The adapter is source-gated to the approved external raw URL. It must not become broad acceptance for arbitrary simple JSON sources.

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

## Default Source, Cache, And Refresh

The existing source-scoped cache/LKG behavior remains required:

- local packaged catalog remains the immutable base/fallback;
- the approved external raw source is the default/non-debug remote source for newly added devices;
- debug source override still has priority and remains for staging/demo/alternative URLs;
- source URL is part of the cached metadata;
- LKG is ignored when the active source does not match the cached source URL;
- normal automatic refresh uses a 6-hour TTL for the default external source;
- manual `Refresh remote` is a force refresh and bypasses the TTL;
- failed refresh keeps same-source LKG when available, otherwise local-only fallback;
- first fetch with no valid LKG falls back local-only if the external file is invalid;
- `Clear` removes remote cache/LKG/meta/status and remote overlays;
- selected-device storage remains unchanged.

Only new/unknown external devices are auto-added. Existing local packaged devices from the external file are not auto-overridden.

## Browser Smoke

External adapter browser smoke passed with the raw GitHub source above as the default/non-debug source:

- no `Use debug source` was needed;
- tray showed `source external`;
- tray showed `normal refresh 6h`;
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
- repeated `Refresh remote` did not break the flow;
- page refresh and page navigation did not break the flow;
- `Clear` removed remote/LKG state, and `Refresh remote` fetched/applied again;
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

## Remaining Decisions

- approved HTTPS image host list and review process;
- whether local-device conflicts stay skipped or become review-only diagnostics;
- whether validator/tooling should also understand `external_simple_v1` outside runtime;
- final operational ownership/review process for the external file.

Rollback remains straightforward: revert the default-source patch or clear remote cache/LKG, then rely on local packaged fallback.
