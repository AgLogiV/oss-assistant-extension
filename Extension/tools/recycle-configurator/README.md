# Recycle Configurator Skeleton

This is a dev-only local tool skeleton for future recycle device config editing/export.

Current status:

- serves a static read-only fixture preview page;
- uses built-in Node.js modules only;
- loads `Extension/config/recycle-device-catalog.fixture.json` through a read-only local endpoint;
- does not write files;
- does not expose edit or export endpoints;
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

## Read-only Fixture View

The page calls this local endpoint:

```text
GET /api/fixture
```

The endpoint reads `Extension/config/recycle-device-catalog.fixture.json` and returns a safe summary plus read-only device rows for display:

- fixture loaded status;
- `schemaVersion` and `revision`;
- device count;
- enabled and disabled device count;
- category count/list;
- device rows with `deviceId`, `categoryId`, `displayName`, `materialId`, `validationProfileId`, and `enabled`.

There are still no write endpoints, no edit/export logic, no runtime imports, and no extension runtime dependency.

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

## Candidate Validation

The page can validate the currently loaded candidate JSON without saving it permanently.

It calls this local endpoint:

```text
POST /api/validate-candidate
```

The browser sends the candidate JSON body, not a file path or command. The server writes the JSON to a temporary file under the operating system temp directory, runs the existing validator with `--input <temp-file>` by using `process.execPath` and `spawn` with `shell: false`, then deletes the temp file where possible.

The endpoint has a 1 MB request body limit. It does not create permanent project files and does not accept arbitrary command input or arbitrary file paths.

Candidate validation uses the same 20 second validator timeout and 128 KB per-stream output capture limit as fixture validation.

Future candidate JSON exports should be validated with:

```bash
node Extension/scripts/validate-recycle-config-fixture.js --input path/to/candidate.json
```

The extension runtime still uses `Extension/content.js` as the recycle source of truth and does not load JSON config.
