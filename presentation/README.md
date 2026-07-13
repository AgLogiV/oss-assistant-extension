# OSS Assistant — презентация

Всичко за вътрешния slide deck на едно място.

## Структура

| Път | За какво е |
|-----|------------|
| `build/build.mjs` | Изходен код на 24-те слайда (редактираш тук) |
| `build/package.json` | ES module marker за builder-а |
| `HANDOFF.md` | Дизайн система + шаблони за безшевно надграждане |
| `PRESENTATION_2026-07-08.md` | Съдържателни бележки за активна разработка (08.07) |
| `narrative_plan.md` | Ранен narrative plan (може да е остарял спрямо `build.mjs`) |
| `assets/` | A1 art plates (cover, chart, final) |
| `output/output.pptx` | Каноничен export за срещи |
| `preview/` | PNG preview на слайдове (генерира се при build, не е в git) |
| `scripts/readdocx.mjs` | Помощен скрипт за извличане на текст от `.docx` |

## Build

```powershell
& "$HOME\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" `
  "presentation/build/build.mjs"
```

Пътищата в `build.mjs` са **относителни** — работи на всеки клонинг на repo-то.

**Изход:** `presentation/output/output.pptx`  
**Preview:** `presentation/preview/slide-XX.png`

За първи build на нова машина: инсталирай `@oai/artifact-tool` в `presentation/build/` (виж `HANDOFF.md`).

## Работа от `main`

```powershell
git pull origin main
# редактирай presentation/build/build.mjs
# пусни build (горе)
git add presentation/
git commit -m "docs: update presentation ..."
git push origin main
```

Преди работа винаги `git pull` — двама колеги, един клон (`main`).
