# OSS Assistant

Chrome Manifest V3 extension for internal A1 OSS portal workflows: recycle device entry (category, validation, SAP/material), clipboard WiFi autofill, label/barcode printing, Dailywork schedule auto-selection, and SharePoint OSSRecycleSchedule helpers.

## Load the extension

1. Open Chrome or Edge.
2. Go to `chrome://extensions/` or `edge://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `Extension/` folder in this repository.

The extension runs on the OSS domains and SharePoint list URL declared in `Extension/manifest.json`.

## Documentation

| Document | Purpose |
|---|---|
| [AGENTS.md](AGENTS.md) | Working rules for Codex/agents |
| [CHANGELOG.md](CHANGELOG.md) | Release notes and recent validation |
| [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) | Full runtime map: selectors, storage keys, flows |
| [docs/OSS_TEST_CHECKLIST.md](docs/OSS_TEST_CHECKLIST.md) | Manual test checklist for real OSS |
| [docs/RECYCLE_DEVICE_ADDING_GUIDE.md](docs/RECYCLE_DEVICE_ADDING_GUIDE.md) | How to add recycle catalog devices safely |
| [docs/RECYCLE_DEVICE_VALIDATION_RULES.md](docs/RECYCLE_DEVICE_VALIDATION_RULES.md) | Validation profile reference |
| [docs/RECYCLE_DEVICE_CATALOG_CONCEPT_EN.md](docs/RECYCLE_DEVICE_CATALOG_CONCEPT_EN.md) | Concept/roadmap (not implemented behavior) |
| [docs/RECYCLE_DEVICE_CATALOG_ARCHITECTURE_PLAN.md](docs/RECYCLE_DEVICE_CATALOG_ARCHITECTURE_PLAN.md) | Architecture bridge document |
| [docs/RECYCLE_DEVICE_CONFIG_ARCHITECTURE.md](docs/RECYCLE_DEVICE_CONFIG_ARCHITECTURE.md) | Config/export/dashboard architecture |
| [docs/EXTERNAL_RECYCLE_CATALOG_RUNTIME.md](docs/EXTERNAL_RECYCLE_CATALOG_RUNTIME.md) | External simple catalog runtime |
| [presentation/PRESENTATION_2026-07-08.md](presentation/PRESENTATION_2026-07-08.md) | Operator-facing change summary |
| [presentation/SLIDES.md](presentation/SLIDES.md) | Slide deck content map for agents |
| [presentation/HANDOFF.md](presentation/HANDOFF.md) | Presentation deck design handoff |
| [presentation/README.md](presentation/README.md) | How to build and update the slide deck |

## Dev checks

```bash
node Extension/scripts/validate-recycle-catalog.js
node Extension/scripts/check-recycle-config.js
```

## Main runtime files

- `Extension/content.js` — primary logic (recycle, clipboard, labels, material buttons)
- `Extension/background.js` — fetch bridge, Dailywork/remote config cache, extension reload
- `Extension/manifest.json` — permissions and content script matches
