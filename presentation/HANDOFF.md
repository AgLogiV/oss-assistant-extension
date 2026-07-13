# OSS Assistant Deck — Handoff за продължаване на презентацията

> **Цел на този документ:** да позволи на друг агент/нишка да надгражда презентацията **без да анализира или отгатва дизайна**. Следвай токените, шаблоните и рецептите по-долу.

---

## 1. Бърз старт (copy-paste за нова нишка)

```
Продължи OSS Assistant презентацията по същия дизайн.

Прочети ПЪРВО: presentation/HANDOFF.md
Редактирай САМО: presentation/build/build.mjs
Не измисляй нов дизайн — използвай съществуващите helper-и и токени (C, FONT, MARGIN, header, titleBlock, footer, card, bullets, checklistSlide, newsDualSlide, 2x2 panel pattern).

След промени rebuild:
& "$HOME\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "C:\Users\a1bg514837\Downloads\oss-assistant\tmp\slides\oss-assistant\build\build.mjs"

Изход: presentation/output/output.pptx (fallback: OSS-Assistant-prezentaciya.pptx или output-latest.pptx ако файлът е отворен в PowerPoint)
Прегледи: presentation/preview/slide-XX.png

Език на слайдовете: български. Кодови имена/идентификатори — на латиница.
```

---

## 2. Файлова карта

| Път | Роля |
|-----|------|
| `presentation/build/build.mjs` | **Единствен източник на истина** — целият deck се генерира от тук |
| `presentation/build/node_modules/@oai/artifact-tool` | Библиотека за editable `.pptx` (`Presentation`, shapes, charts, export) |
| `presentation/assets/slide-01.png` | Hero фон — cover |
| `presentation/assets/slide-05.png` | Фон за chart слайд |
| `presentation/assets/slide-12.png` | Фон за финално обобщение |
| `presentation/preview/slide-XX.png` | PNG preview на всеки слайд (генерира се автоматично при build) |
| `presentation/output/output.pptx` | Основен export |
| `presentation/narrative_plan.md` | Стар narrative plan (може да е остарял спрямо build.mjs) |
| `presentation/PRESENTATION_2026-07-08.md` | Съдържателни бележки за активна разработка (не дизайн) |

**Не променяй** `Extension/content.js`, `manifest.json` и т.н. — deck-ът е отделен артефакт.

---

## 3. Build команда

```powershell
& "$HOME\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" `
  "C:\Users\a1bg514837\Downloads\oss-assistant\presentation\build\build.mjs"
```

- Генерира **editable** PowerPoint (текст, форми, chart — не flatten-нат image).
- След build провери `DONE slides: N -> ...` и preview PNG-тата.
- Ако `.pptx` е отворен → `EBUSY` → builder записва в fallback файл (виж края на `build.mjs`).

---

## 4. Дизайн система (задължителни токени)

### 4.1 Canvas и grid

```js
const W = 1280, H = 720, MARGIN = 72;
// Полезна ширина за съдържание: W - 2*MARGIN = 1136
```

### 4.2 Цветова палитра (`C`)

| Token | Hex | Употреба |
|-------|-----|----------|
| `C.red` | `#E4032E` | A1 primary — акценти, заглавни ленти, chart серия «С Assistant» |
| `C.redDeep` | `#8E0018` | Ударен текст в розови callout-и |
| `C.coral` | `#FF4D5E` | Bullet dots на тъмен фон |
| `C.ink` | `#16181D` | Основен текст; фон на dark cards и section dividers |
| `C.grey` | `#2B2E36` | Body текст на светъл фон |
| `C.midGrey` | `#6B7280` | Subtitle под заглавие |
| `C.softGrey` | `#9AA0AA` | Footer на светли слайдове |
| `C.bg` | `#F5F6F8` | Фон на стандартен content slide |
| `C.cardBg` | `#FFFFFF` | Бели карти |
| `C.greenOk` | `#128A4B` | Секция «Вече работи», success панели |
| `C.white` | `#FFFFFF` | Текст/елементи на тъмен или червен фон |

**Семантични tint-ове (не добавяй нови без нужда):**

| Hex | Употреба |
|-----|----------|
| `#FBE6EA` | Warning / активна разработка callout |
| `#E4F5EC` | Success / «Решение» панел |
| `#F4F5F7` | План / неутрален панел |
| `#F7F8F8` / `#F7F8FA` | Chip фон (slide 3) |
| `#242730` | Вътрешен ред в dark card |
| `#FFFFFFCC`, `#FFFFFFEE`, `#FFFFFFB0`, `#FFFFFFA0` | Бял текст с прозрачност на hero/final |

### 4.3 Типография (`FONT`)

| Роля | Font | Типичен size |
|------|------|--------------|
| Заглавия, kickers, bold labels | **Poppins** (`FONT.title`) | 34 title · 19 card title · 12 kicker · 58 section divider |
| Body, bullets, footer | **Lato** (`FONT.body`) | 15 subtitle · 14–15 bullets · 10.5 footer |

**Правило:** заглавие на слайд = Poppins 34 bold `C.ink`; подзаглавие = Lato 15 `C.midGrey`.

### 4.4 Радиуси (`rr(formula)`)

| Стойност | Употреба |
|----------|----------|
| `6000` | Стандартна карта, top accent bar |
| `8000` | Callout banner, bottom note |
| `9000` | Малки chips |
| `20000–24000` | Кръгли икони (`roundIcon`) |
| `30000` | Pill underline / декоративна черта |

### 4.5 Вертикална анатомия — стандартен content slide

```
y=40   logoMark (A1 червен квадрат + "OSS Assistant")
y=50   kicker (дясно, червено, Poppins 12 bold) — напр. "ВЕЧЕ РАБОТИ · SAP"
y=78   малка червена линия под kicker (44×3)
y=112  червена черта пред заглавие (52×6)
y=128  slide title (34 bold)
y=190  subtitle (15 midGrey) — optional
y=246–252  начало на content area
y=680  footer ("OSS Assistant · A1 България" + номер на слайд)
```

**Background:** `s.background.fill = C.bg` за почти всички content slides.

---

## 5. Helper функции — използвай ги, не копирай raw coordinates на ново

| Helper | Какво прави |
|--------|-------------|
| `header(slide, kicker)` | Logo + kicker + червена линия |
| `titleBlock(slide, title, sub?)` | Червена черта + заглавие + subtitle |
| `footer(slide, dark=false)` | Footer; `dark=true` на hero/final/divider |
| `logoMark(slide, x, y, dark?)` | A1 mark + OSS Assistant label |
| `card(slide, opts)` | Бяла/цветна rounded rect |
| `rect(slide, opts)` | Rect или roundRect |
| `roundIcon(slide, x, y, size, fill)` | Почти кръгъл квадрат |
| `dot(slide, x, y, size, fill)` | Bullet dot |
| `txt(slide, str, opts)` | Editable text box (transparent fill) |
| `bullets(slide, items, opts)` | Списък с dots |
| `plate(slide, "slide-01.png")` | Full-bleed PNG фон (async) |
| `sectionDivider({ num, title, subtitle, accent })` | Тъмен divider между секции |
| `checklistSlide(...)` | 2 колони с tiles + икона |
| `improvementCardsSlide(...)` | 2×2 карти с ✓ и червена лента отляво |
| `newsDualSlide(kicker, title, subtitle, items)` | 2 високи карти: Какво/Защо/Ефект |
| `macScanSlide()` / `autoUpdateSlide()` / `kstb5019ContractPlanSlide()` / `contractRemoveButtonPlanSlide()` | **2×2 panel pattern** — виж §6.4 |

### Low-level правила

- **`line` при shapes:** подавай `line` **при създаване** на shape — не `shape.line = ...` след това (не се поддържа).
- **Първи slide:** `presentation.slides.add()` — не `getItem(0)`.
- **Кавички в JS strings:** избягвай typographic `"`/`„"` — ползвай `«»` или straight quotes.
- **Export blob:** `writeBlob()` поддържа `.save()`, `.bytes()`, `.arrayBuffer()`.

---

## 6. Шаблони за нови слайдове

### 6.1 Избор на шаблон

| Сценарий | Шаблон | Пример в deck |
|----------|--------|---------------|
| Нова секция | `sectionDivider()` | Slides 7, 13, 20 |
| Кратък списък (4–10 точки) | `checklistSlide()` | «Какво вече работи», «План за развитие» |
| Завършени подобрения (title + desc) | `improvementCardsSlide()` | «Предишни подобрения» |
| Feature с Какво/Защо/Ефект (2 теми) | `newsDualSlide()` | Потвърждения, дубликати |
| Feature с 4 аспекта (проблем/решение/цел/ефект) | **2×2 panel pattern** | MAC scan, auto-update, 5019 договори, бутон договор |
| 3 равни стълба | 3-column cards | Agenda, active dev overview |
| 4 равни стълба | 4-column cards | «Реална полза» |
| Ляво bullets + дясно dark guards | split card | Валидация серийни |
| Две равни колони feature | 2-col `cw=(W-2*MARGIN-gap)/2`, `ch=356` | SAP + SSID |
| Hero / финал | `plate()` + white text | Cover, Summary |
| Данни | `s.charts.add("bar")` в card | «По-малко кликвания» |

### 6.2 Section divider — accent по секция

| Секция | `accent` | Kicker prefix |
|--------|----------|---------------|
| 01 Вече работи | `C.greenOk` | `ВЕЧЕ РАБОТИ · ...` |
| 02 Активна разработка | `C.red` | `АКТИВНА РАЗРАБОТКА · ...` |
| 03 План за развитие | `C.midGrey` | `ПЛАН ЗА РАЗВИТИЕ · ...` |

### 6.3 Checklist slide — accent по секция

```js
// Секция 01 — зелено
checklistSlide(kicker, title, subtitle, items);
// default: icon "✓", iconBg "#E4F5EC", iconColor C.greenOk

// Секция 03 — сиво
checklistSlide(kicker, title, subtitle, items, {
  icon: "→",
  iconBg: "#F4F5F7",
  iconColor: C.midGrey,
});
```

**Layout:** `top=246`, `gap=18`, 2 колони, `rowH=78`. При **>8 items** намали `rowH` или раздели на 2 checklist слайда.

### 6.4 2×2 panel pattern (най-често за нов feature в §02/§03)

Копирай структурата от `autoUpdateSlide()` или `contractRemoveButtonPlanSlide()`:

```js
function myNewPlanSlide() {
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "ПЛАН ЗА РАЗВИТИЕ · ТЕМА");  // или АКТИВНА РАЗРАБОТКА
  titleBlock(s, "Заглавие", "Подзаглавие.");

  const top = 248, gap = 20, cw = (W - 2 * MARGIN - gap) / 2, ch = 168;
  const panels = [
    { label: "Днес", fill: "#F4F5F7", accent: C.midGrey, items: ["...", "..."] },
    { label: "Идея (план)", fill: "#E4F5EC", accent: C.greenOk, items: ["...", "..."] },
    { label: "Спестено време", fill: C.cardBg, accent: C.red, items: ["...", "..."] },
    { label: "Цел", fill: C.cardBg, accent: C.greenOk, items: ["...", "..."] },
  ];
  panels.forEach((p, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = MARGIN + col * (cw + gap), y = top + row * (ch + 16);
    card(s, { left: x, top: y, width: cw, height: ch, fill: p.fill });
    rect(s, { left: x, top: y, width: cw, height: 6, fill: p.accent, radius: 6000 });
    txt(s, p.label, { left: x + 24, top: y + 22, width: cw - 48, height: 26, size: 16, bold: true, color: C.ink, font: FONT.title });
    bullets(s, p.items, { left: x + 24, top: y + 56, width: cw - 48, size: 13.5, color: C.grey, gap: 10, lineH: 36, dotColor: p.accent });
  });

  const bY = top + 2 * (ch + 16) + 6;
  rect(s, { left: MARGIN, top: bY, width: W - 2 * MARGIN, height: 40, fill: "#F4F5F7", radius: 8000 });
  rect(s, { left: MARGIN, top: bY, width: 6, height: 40, fill: C.midGrey, radius: 8000 });
  txt(s, "План за разработка — ...", { left: MARGIN + 26, top: bY, width: W - 2 * MARGIN - 52, height: 40, size: 12.5, bold: true, color: C.grey, font: FONT.body, valign: "middle", line: 1.08 });
  footer(s);
  return s;
}
```

**Panel fill правило:**
- Проблем / днес → `#F4F5F7` или `#FBE6EA` (ако е по-сериозен)
- Решение / идея → `#E4F5EC`
- Неутрални → `C.cardBg`
- Bottom banner: §02 → `#FBE6EA` + `C.redDeep` text; §03 → `#F4F5F7` + `C.grey` text

### 6.5 Callout banner (под cards)

```js
rect(s, { left: MARGIN, top: bTop, width: W - 2 * MARGIN, height: 42–44, fill: "#FBE6EA", radius: 8000 });
rect(s, { left: MARGIN, top: bTop, width: 6, height: 42–44, fill: C.red, radius: 8000 });
txt(s, "...", { left: MARGIN + 26, top: bTop, width: W - 2 * MARGIN - 52, height: 42–44, size: 12.5–14.5, bold: true, color: C.redDeep, font: FONT.body, valign: "middle" });
```

За силно послание (не warning): `fill: C.red`, `color: C.white`, `size: 15`.

---

## 7. Структура на deck-а (24 слайда, към 13.07.2026)

| # | Секция | Слайд |
|---|--------|-------|
| 1 | Intro | Cover (plate slide-01) |
| 2 | Intro | Какво е OSS Assistant |
| 3 | Intro | Проблемът |
| 4 | Intro | Реална полза (4 pillars) |
| 5 | Intro | По-малко кликвания (chart + plate slide-05) |
| 6 | Intro | Agenda — 3 секции |
| 7 | **§01** | Section divider «Вече работи» |
| 8 | §01 | Валидация серийни |
| 9 | §01 | SAP + duplicate |
| 10 | §01 | SSID + етикети |
| 11 | §01 | Checklist «Какво вече работи» |
| 12 | §01 | Предишни подобрения (improvementCards) |
| 13 | **§02** | Section divider «Активна разработка» |
| 14 | §02 | 08.07 summary (6 numbered tiles) |
| 15–16 | §02 | newsDualSlide ×2 |
| 17 | §02 | MAC scan (2×2) |
| 18 | §02 | Auto-update (2×2) |
| 19 | §02 | Active dev mini summary (3 pillars) |
| 20 | **§03** | Section divider «План за развитие» |
| 21 | §03 | Plan checklist (8 items) |
| 22 | §03 | 5019/5020 невидими договори (2×2) |
| 23 | §03 | Бутон премахване от договор (2×2) |
| 24 | Final | Обобщение (plate slide-12) |

**Правило за ново съдържание:**
- Готово и работи → §01 (+ checklist item + optional detail slide)
- В тестване / не финално → §02 (+ 08.07 summary tile ако е part of batch)
- Идея / бъдеще → §03 checklist + optional 2×2 detail slide

---

## 8. Рецепта: добавяне на нова идея в «План за развитие»

1. **Добави кратък ред** в `checklistSlide(...)` масива (§03, ~ред 935 в `build.mjs`).
2. **Ако темата е важна** — създай функция по **§6.4 panel pattern** (копирай `contractRemoveButtonPlanSlide`).
3. **Извикай** функцията веднага след `checklistSlide` / след друг plan detail slide (преди FINAL summary).
4. **Обнови** bullet в final summary slide (масив `list` ~ред 900) — само ако е ключова тема.
5. **Rebuild** и провери preview на последните 2–3 слайда.
6. **Не променяй** slide order на intro/§01/§02 без изрична заявка.

---

## 9. Art plates (PNG фонове)

- **Text-free** — само градиент/форми; текстът е editable shapes отгоре.
- Не добавяй текст в PNG-тата.
- Нов hero фон → сложи в `presentation/assets/` и викни `await plate(s, "slide-XX.png")`.
- Cover/final използват **white text** върху plate; content slides — **light bg `C.bg`** без plate.

---

## 10. Do / Don't

### DO
- Ползвай същите `C`, `FONT`, `MARGIN`, `header`, `titleBlock`, `footer`.
- Държи kickers в формат `СЕКЦИЯ · ПОДТЕМА` (uppercase kicker segment).
- Ограничавай текста: **2 bullets на panel**, кратки изречения.
- Маркирай §02 като «не е финално» в banner/callout.
- Пиши на **български**; технически IDs (`KSTB5019`, `Load unpacked`) — латиница.

### DON'T
- Не въвеждай нови шрифтове, neon цветове или различен margin.
- Не прави full-slide screenshots като фон (освен plate PNG).
- Не flatten-вай текст в картинки.
- Не refactor-ирай целия `build.mjs` — **минимален diff**.
- Не мести FINAL summary slide — новите слайдове **преди** него.

---

## 11. Известни капани (от предишни сесии)

| Проблем | Решение |
|---------|---------|
| `Slide index out of range: 0` | `presentation.slides.add()` за първи slide |
| `shape.line = ...` not supported | `line` в options при `shapes.add` |
| `png.save is not a function` | ползвай `writeBlob()` |
| `EBUSY` при export | затвори PowerPoint или ползвай `output-latest.pptx` |
| SyntaxError от `„"` кавички | замени с `«»` |
| Checklist >8 items overflow | намали `rowH` или втори checklist slide |

---

## 12. Prompt шаблон за конкретна задача

```
Задача: [опиши новото съдържание]

Контекст: presentation/HANDOFF.md
Файл: presentation/build/build.mjs

Изисквания:
- Секция: [§01 / §02 / §03]
- Шаблон: [checklist / 2x2 panel / newsDual / ...]
- Kicker: "[...]"
- Заглавие: "[...]"
- Текст за panels/bullets: […]

След build потвърди броя слайдове и preview на новия slide-XX.png.
```

---

## 13. Какво НЕ е в scope на handoff-а

- Съдържание на OSS Assistant extension (`Extension/content.js`) — виж `docs/PROJECT_MAP.md`
- Жив DOM на OSS — при нужда screenshot/HTML от потребителя
- Auto-deploy на deck — само local build

---

## 14. Версия

- Handoff created: **2026-07-13**
- Deck version: **24 slides**
- Builder: `presentation/build/build.mjs`
- Primary output: `presentation/output/output.pptx`
