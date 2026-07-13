# Session handoff — presentation v2 (2026-07-13)

> Предай този файл на следващ работен чат за преглед и доработки.

## Какво е готово

| Артефакт | Път |
|----------|-----|
| Презентация v2 (25 слайда) | `presentation/output/output.pptx` |
| Изходен код | `presentation/build/build.mjs` |
| Реални скрийншоти | `presentation/assets/screenshots/` (6 PNG) |
| Build dependency (vendor) | `presentation/build/vendor/artifact-tool.zip` |
| Setup скрипт | `presentation/build/setup-deps.ps1` |

## Reproducible build (чист clone)

```powershell
git clone https://github.com/oss-assistant/oss-assistant-extension.git
cd oss-assistant-extension
git checkout main

powershell -File presentation/build/setup-deps.ps1

& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" `
  presentation/build/build.mjs
```

`setup-deps.ps1` ред на опити: **Codex cache** → **vendor zip** → fail с инструкции.

Ако няма Codex node, инсталирай Node 20+ и пусни `node presentation/build/build.mjs` след `setup-deps`.

**Изход:** `presentation/output/output.pptx` + `output-v2.pptx`  
**Preview:** `presentation/preview/slide-XX.png` (gitignored, генерира се при build)

## Ключови промени в v2

- §01 слайд 4: четири стълба (автоматизация, скорост, грешки, насоки)
- Слайд 8: **само** `slide08-invalid-serial-warning.png` (едно изображение, aspect ratio preserved)
- Слайдове 9–11: реални скрийншоти с `fit: contain` (без crop)
- 25 слайда общо (не 24)

## Документация за агенти

| Файл | За какво |
|------|----------|
| `presentation/SLIDES.md` | Карта на съдържанието — **трябва update 24→25** |
| `presentation/HANDOFF.md` | Дизайн система и helper-и |
| `presentation/BUILD_RECOVERY.md` | Build recovery + vendor |
| `presentation/README.md` | Кратък entry point |

## Задачи за следващия чат (преглед)

1. **Визуален QA** на слайдове 4, 8, 9, 10, 11 в `output.pptx`
2. **Потвърди rebuild** от чист `node_modules` чрез vendor zip + `build.mjs`
3. **Обнови `SLIDES.md`** за 25 слайда и screenshot секцията
4. **По желание:** махни неизползвания `slide08-category-device-serial.png` или го остави като резерв
5. **Не пипай** `Extension/content.js` без изрична заявка

## Git състояние

- Клон: `main`
- Remote: `https://github.com/oss-assistant/oss-assistant-extension`
- Presentation v2 + screenshots + vendor zip са merge-нати в `main`

## Известни ограничения

- `@oai/artifact-tool` е private — vendor zip е за вътрешно ползване в repo-то
- Затворен `output-v2.pptx` в PowerPoint → `EBUSY` при build (skip, `output.pptx` се записва)
- Не отваряй стари `output-v2-review.pptx` — вече не се генерира

## Prompt за copy-paste в нов чат

```
Прегледай OSS Assistant presentation v2 на main.

Прочети: presentation/SESSION_HANDOFF_2026-07-13.md
Отвори: presentation/output/output.pptx
Rebuild тест: setup-deps.ps1 + build.mjs (vendor zip)

Фокус: визуален QA слайдове 8–11, update SLIDES.md за 25 слайда.
```
