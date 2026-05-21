# Recycle Configurator Skeleton

This is a dev-only local tool skeleton for future recycle device config editing/export.

Current status:

- serves a static placeholder page;
- uses built-in Node.js modules only;
- does not load JSON config;
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

Future candidate JSON exports should be validated with:

```bash
node Extension/scripts/validate-recycle-config-fixture.js --input path/to/candidate.json
```

The extension runtime still uses `Extension/content.js` as the recycle source of truth and does not load JSON config.
