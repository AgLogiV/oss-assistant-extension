# Recycle Configurator Skeleton

This is a dev-only local tool skeleton for future recycle device config editing/export.

Current status:

- serves a static fixture preview and in-memory existing-device editor page;
- uses built-in Node.js modules only;
- loads `Extension/config/recycle-device-catalog.fixture.json` through a read-only local endpoint;
- does not write files;
- does not expose save or export endpoints;
- is not imported by the extension runtime.

## Start Options

Command-line start from the repository root:

```bash
node Extension/tools/recycle-configurator/server.js
```

Double-click start on Windows:

```text
Extension/tools/recycle-configurator/start-configurator.cmd
```

The Windows launcher starts `server.js` from this directory, opens the local URL in the default browser, and keeps the terminal window open while the server is running.

Then open, or let the launcher open:

```text
http://127.0.0.1:5177/
```

The local server must remain running while the page is open. If the browser shows `ERR_CONNECTION_REFUSED`, the local server is not running or was stopped.

## Fixture View and In-memory Device Editing

The page calls this local endpoint:

```text
GET /api/fixture
```

The endpoint reads `Extension/config/recycle-device-catalog.fixture.json` and returns a safe summary plus candidate JSON for display and browser-memory edits:

- fixture loaded status;
- `schemaVersion` and `revision`;
- device count;
- enabled and disabled device count;
- category count/list;
- a compact device list with `deviceId`, `categoryId`, `displayName`, `materialId`, and `enabled`;
- a selected-device side editor for `displayName`, `materialId`, `legacyMaterialIds`, `imagePath`, `helpImagePath`, `warningText`, `validationProfileId`, and `enabled`.

Select a row in the list to edit that existing device in the side panel. `deviceId` and `categoryId` are read-only. There is no device creation, deletion, or category moving. `validationProfileId` is selected from the loaded candidate `validationProfiles` list. `legacyMaterialIds` is edited as comma/newline separated text and stored as an array of strings.

The device table can be filtered by search text across `deviceId`, `categoryId`, `displayName`, and `materialId`, plus a category dropdown based on the loaded candidate categories.

Use `Add Device` to switch the side editor into a browser-memory draft form for adding one new device to the current candidate. The draft supports only safe catalog metadata fields: `deviceId`, `categoryId`, `displayName`, `materialId`, `legacyMaterialIds`, `imagePath`, `helpImagePath`, `warningText`, `validationProfileId`, and `enabled`. It does not support `sortOrder`, delete, duplicate, category move, or runtime behavior changes. `categoryId` choices come from loaded normal device categories and exclude `cam_modules` and `modems`. `deviceId` must be unique lower snake-case, material IDs must be digits-only when present, and `validationProfileId` must come from the loaded profile list.

`imagePath` and `helpImagePath` keep their manual text inputs and also offer compact selectors populated from `GET /api/assets`. The selectors write only extension-relative paths into the browser-memory candidate, such as `images/devices/16x9/example.webp` or `images/recycle-help/example.webp`. Empty paths remain valid, and paths not present in the asset inventory remain visible in the manual field.

Recycle device `imagePath` values should use packaged `images/devices/16x9/...` paths. Current recycle devices all have explicit `imagePath` values. `helpImagePath` is separate from `imagePath` and is used for serial/help UI, normally with `images/recycle-help/...` paths. The configurator must not store absolute local filesystem paths in candidate JSON.

Edits are kept only in browser memory and are reflected by the dirty state indicator. Before candidate export or candidate validation, `generatedMaterialFilters` is regenerated from enabled devices with non-empty trimmed `materialId` values, grouped by `categoryId` in device order.

Use `Revert changes` to reset the browser-memory candidate back to the original loaded fixture data. This does not read or write project files.

There are still no save endpoints, no runtime imports, and no extension runtime dependency.

## Asset Inventory

The configurator exposes a read-only asset inventory for future path selectors:

```text
GET /api/assets
```

The endpoint returns extension-relative paths only. It does not return absolute local filesystem paths, drive letters, or filesystem roots. Config JSON should keep paths like `images/devices/16x9/example.webp` or `images/recycle-help/example.webp`.

Allowed asset directories:

- `Extension/images/devices/16x9/` as `deviceImages`
- `Extension/images/recycle-help/` as `helpImages`

Only `.webp`, `.png`, `.jpg`, and `.jpeg` files are included. Results include `path`, `fileName`, and `kind`, and are sorted by `path`.

Upload is not implemented. The inventory endpoint accepts no asset path input and performs no writes.

## Asset Preview

The UI shows small thumbnails for non-empty `imagePath` and `helpImagePath` values by calling:

```text
GET /api/asset-preview?path=<extension-relative-path>
```

The preview endpoint accepts only extension-relative paths covered by the asset policy, such as `images/devices/16x9/example.webp` or `images/recycle-help/example.webp`. It rejects absolute paths, backslashes, URL-like paths, `file://` paths, and any path containing `..`. It resolves the request server-side and verifies the file stays inside the matched allowed directory before serving it.

Preview URLs are UI-only. They are not written into the browser-memory candidate or exported JSON. Upload and save endpoints are still not implemented.

## Validation Panel

The page also has a dev-only validation button for the fixed fixture.

It calls this local endpoint:

```text
GET /api/validate-fixture
```

The endpoint runs the existing validator with the same Node executable that started the local server:

```bash
node Extension/scripts/validate-recycle-config-fixture.js --input Extension/config/recycle-device-catalog.fixture.json
```

The browser cannot provide command text or file paths. The endpoint validates only the fixed fixture path and returns structured `ok`, `pass`, `exitCode`, `stdout`, and `stderr` fields for display.

Validator execution has a 20 second timeout. Captured `stdout` and `stderr` are limited to 128 KB each; truncated output is marked in the returned text and with `stdoutTruncated` / `stderrTruncated`.

There are still no write endpoints, no edit/export logic, no runtime imports, and no extension runtime dependency.

## Candidate JSON Export

The page can export the currently loaded fixture data as a candidate JSON file from browser memory.

Use the `Export Candidate JSON` button. The browser downloads a file named like:

```text
recycle-device-catalog.candidate.dev-current.json
```

This uses `Blob` and `URL.createObjectURL` in the browser. The server does not write files, does not expose a save endpoint, and does not accept candidate paths.

## Candidate JSON Import

Use `Import Candidate JSON` to load an exported candidate file back into browser memory with the browser File API. The selected file must be a JSON file under 1 MB and must pass basic top-level shape checks for `schemaVersion`, `revision`, `devices`, `categoryHelp`, `validationProfiles`, and `generatedMaterialFilters`.

Imported candidates are not written to `Extension/config` or any project file. Basic shape checks are not full validation; use `Validate Candidate` after importing. `Revert changes` resets to the currently loaded baseline, which is the imported candidate after import. Use `Reload fixture` to discard the imported candidate and load the project fixture again; if browser-memory edits are dirty, the UI asks for confirmation first.

## Candidate Validation

The page can validate the currently loaded candidate JSON without saving it permanently.

It calls this local endpoint:

```text
POST /api/validate-candidate
```

The browser sends the candidate JSON body, not a file path or command. The server writes the JSON to a temporary file under the operating system temp directory, runs the existing validator with `--input <temp-file>` by using `process.execPath` and `spawn` with `shell: false`, then deletes the temp file where possible.

The endpoint has a 1 MB request body limit. It does not create permanent project files and does not accept arbitrary command input or arbitrary file paths.

Candidate validation uses the same 20 second validator timeout and 128 KB per-stream output capture limit as fixture validation.

The validation panel shows whether the latest result came from the fixed fixture or the browser-memory candidate. It uses PASS/FAIL badges plus short hints for fixture failures, candidate failures, and candidate edits made after the last candidate validation. Technical `stdout` and `stderr` output remain visible for debugging.

Future candidate JSON exports should be validated with:

```bash
node Extension/scripts/validate-recycle-config-fixture.js --input path/to/candidate.json
```

Before merging an exported candidate into runtime metadata, review it with:

```bash
node Extension/scripts/review-recycle-config-candidate.js --input path/to/candidate.json
```

The review script is dev-only and no-write. It compares the candidate with the current runtime-shaped export by stable `deviceId`, reports added/edited/missing/reordered devices, material filter changes, unknown fields, and manual-review-only sections, but it does not merge, write `Extension/content.js`, regenerate the fixture, or add runtime JSON loading.

If the review is acceptable, the intended merge path is: make a manual/Codex-assisted patch to `RECYCLE_DEVICE_CATALOG_RAW`, regenerate `Extension/config/recycle-device-catalog.fixture.json` from `Extension/content.js`, run `node Extension/scripts/check-recycle-config.js`, review the diff, and commit.

The extension runtime still uses `Extension/content.js` as the recycle source of truth and does not load JSON config.
