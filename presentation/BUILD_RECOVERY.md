# Presentation build recovery — `@oai/artifact-tool`

> **За следващ агент:** този файл обяснява как е генериран оригиналният `output.pptx` и как да се възстанови build-ът, когато `npm install` не работи.

---

## 1. Как е генериран оригиналният `output.pptx`

| Параметър | Стойност |
|-----------|----------|
| **Builder** | `presentation/build/build.mjs` |
| **Библиотека** | `@oai/artifact-tool` v2.6.9 (вътрешен Codex пакет, **не е в публичния npm**) |
| **Node** | Codex runtime node, не системният `node` |
| **Команда** | виж §3 |
| **Първоначална среда** | Codex/Cursor agent със `@oai/artifact-tool` в `node_modules` под `build/` |

Пакетът **никога не е бил в Git** — `node_modules/` е в `.gitignore`. След `git clone` трябва ръчно възстановяване (§4).

---

## 2. Защо `npm install` не работи

```
npm error 404 Not Found - GET https://registry.npmjs.org/@oai%2fartifact-tool
```

`@oai/artifact-tool` е **private** (`"private": true` в package.json). Зависи от `skia-canvas` и `@oai/walnut`.

---

## 3. Работеща build команда (Windows)

```powershell
# От root на repo-то:
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" `
  "presentation/build/build.mjs"
```

**Успех:** `DONE slides: N -> ...\presentation\output\output.pptx`

**Preview PNG:** `presentation/preview/slide-XX.png` (gitignored)

### За v2 review (когато `build.mjs` пише `output-v2.pptx`)

Същата команда — изходният файл се задава в края на `build.mjs`, не презаписва `output.pptx` ако е конфигурирано така.

---

## 4. Възстановяване на `node_modules` (ако липсва)

### Вариант A — копиране от Codex cache (препоръчително)

Източник (типичен на Windows):

```
%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\@oai\
```

Цел:

```
<prepo>\presentation\build\node_modules\@oai\
```

```powershell
$src = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\@oai"
$dst = "presentation\build\node_modules\@oai"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -Recurse -Force "$src\artifact-tool" "$dst\artifact-tool"
Copy-Item -Recurse -Force "$src\walnut" "$dst\walnut" -ErrorAction SilentlyContinue
```

### Вариант B — копиране от друг clone/машина

Ако друг колега вече има работещ build, копирай цялата папка:

```
presentation/build/node_modules/@oai/
```

(не commit-вай в git — твърде голяма)

### Проверка след копиране

```powershell
Set-Location presentation\build
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" -e `
  "import('@oai/artifact-tool').then(m=>console.log('OK',!!m.Presentation)).catch(e=>console.log('FAIL',e.message))"
```

Очаквано: `OK true`

---

## 5. API, използвано от `build.mjs` (за миграция, ако cache липсва)

```js
const { Presentation, PresentationFile } = await import("@oai/artifact-tool");

const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const s = presentation.slides.add();
s.background.fill = "#F5F6F8";
s.shapes.add({ geometry: "roundRect", position: {...}, fill, line, ... });
s.charts.add("bar");
const png = await presentation.export({ slide, format: "png", scale: 1 });
const pptx = await PresentationFile.exportPptx(presentation);
```

**Миграция към PptxGenJS:** възможна, но **висок риск** за layout (radii, charts, editable shapes). По-безопасно: възстанови `@oai/artifact-tool` от cache.

---

## 6. Checklist след успешен build на v2

- [ ] `DONE slides: 25` (или очакваният брой)
- [ ] `presentation/output/output-v2.pptx` съществува
- [ ] `output.pptx` непроменен (binary diff = 0)
- [ ] Преглед на променените слайдове: 4, 8, 9 (SAP), duplicate, clipboard, overview
- [ ] Preview PNG за проблемни слайдове в `presentation/preview/`
- [ ] Overflow / clipping / placeholder рамки

---

## 7. Ограничения (от handoff)

- Не commit/push без изрична заявка
- Не пипай `Extension/*`
- Не `git reset`, `rebase`, `pull --force`, `clean`

---

## 8. Версия на този документ

- Създаден: 2026-07-13
- Потвърден работещ build на машина с Codex cache + `presentation/build/node_modules/@oai/artifact-tool`
