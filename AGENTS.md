# Codex Notes for OSS Assistant

This project is a Chrome Manifest V3 extension for the internal A1 OSS portal. It is loaded in Chrome with `Load unpacked` from `Extension/` and runs only on the internal OSS domains listed in `Extension/manifest.json`.

## Working Rules

- Answer the user in Bulgarian. Keep file names, function names, selectors, storage keys, and code snippets in their original form.
- The main runtime logic is in `Extension/content.js`. Treat it as sensitive: prefer small, controlled patches and avoid broad refactors unless the user explicitly asks for them.
- Current primary focus: `Recycle device entry: Category + validation` and `Swap Shop Material` / SAP material quick buttons.
- Secondary but important flows: clipboard SSID/password autofill and label/barcode generation. Do not break them while working on the primary flow.
- Do not change `Extension/manifest.json`, `Extension/background.js`, dashboard runtime logic, images, or large parts of `content.js` unless the user specifically asks.
- Ignore `.zip`/backup archives unless they are explicitly referenced by the project or the user asks to inspect them.
- Use local Git only. Do not create a new worktree, project folder, remote, or upload anything unless the user explicitly asks.

## Missing OSS DOM Context

The real OSS pages are internal and Codex may not see their live DOM/runtime state. If a selector, field behavior, or workflow is uncertain, ask the user for concrete evidence instead of guessing: screenshot, HTML/DOM snippet, field/button `id`, `name`, `class`, `type`, `value`, `disabled`, `readonly`, `data-*` attributes, parent container HTML, visible button texts, URL/path/title of the OSS step, observed click behavior, and DevTools console errors.

For the detailed project map, see `docs/PROJECT_MAP.md`. For manual validation in the real OSS environment, see `docs/OSS_TEST_CHECKLIST.md`.
