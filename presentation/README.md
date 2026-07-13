# OSS Assistant — презентация

Всичко за вътрешния slide deck на едно място.

## Структура

| Път | За какво е |
|-----|------------|
| `SLIDES.md` | **Карта на съдържанието** — 25 слайда, навигация за агенти (чети първо) |
| `build/build.mjs` | Изходен код на 25-те слайда (редактираш тук) |
| `build/package.json` | ES module marker за builder-а |
| `HANDOFF.md` | Дизайн система + шаблони за безшевно надграждане |
| `PRESENTATION_2026-07-08.md` | Съдържателни бележки за активна разработка (08.07) |
| `narrative_plan.md` | Ранен narrative plan (може да е остарял спрямо `build.mjs`) |
| `assets/` | A1 art plates (cover, chart, final) |
| `assets/screenshots/` | Реални OSS скрийншоти за слайдове 8–11 |
| `output/output.pptx` | Каноничен export за срещи (v2, 25 слайда) |
| `output/output-v2.pptx` | Същият export — дублирано име за яснота |
| `preview/` | PNG preview на слайдове (генерира се при build, не е в git) |
| `scripts/readdocx.mjs` | Помощен скрипт за извличане на текст от `.docx` |

## Build

```powershell
& "$HOME\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" `
  "presentation/build/build.mjs"
```

Пътищата в `build.mjs` са **относителни** — работи на всеки клонинг на repo-то.

**Изход:** `presentation/output/output.pptx` (и копие `output-v2.pptx`)  
**Preview:** `presentation/preview/slide-XX.png`

Не отваряй стари fallback файлове като `output-v2-review.pptx` — те не се обновяват при build.

За първи build на нова машина:

```powershell
powershell -File presentation/build/setup-deps.ps1
```

Скриптът ползва Codex cache **или** `presentation/build/vendor/artifact-tool.zip` (виж `BUILD_RECOVERY.md`).

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
