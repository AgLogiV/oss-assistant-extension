import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Presentation, PresentationFile } = await import("@oai/artifact-tool");

const BUILD_DIR = path.dirname(fileURLToPath(import.meta.url));
const DECK_DIR = path.resolve(BUILD_DIR, "..");
const REF_DIR = path.join(DECK_DIR, "assets");
const SCREENSHOT_DIR = path.join(DECK_DIR, "assets", "screenshots");
const OUT_DIR = path.join(DECK_DIR, "output");
const PREVIEW_DIR = path.join(DECK_DIR, "preview");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(PREVIEW_DIR, { recursive: true });

const C = {
  red: "#E4032E",
  redDeep: "#8E0018",
  coral: "#FF4D5E",
  ink: "#16181D",
  grey: "#2B2E36",
  midGrey: "#6B7280",
  softGrey: "#9AA0AA",
  lightLine: "#E4E7EC",
  bg: "#F5F6F8",
  cardBg: "#FFFFFF",
  white: "#FFFFFF",
  greenOk: "#128A4B",
};
const FONT = { title: "Poppins", body: "Lato" };
const T = "#FFFFFF00"; // transparent

const W = 1280, H = 720, MARGIN = 72;

async function readImageBlob(imagePath) {
  const bytes = await fs.promises.readFile(imagePath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

const presentation = Presentation.create({ slideSize: { width: W, height: H } });

// ---------- helpers ----------
function rr(formula) {
  return { adjustmentList: [{ name: "adj", formula: `val ${formula}` }] };
}

function card(slide, { left, top, width, height, fill = C.cardBg, radius = 6000, line = null }) {
  const lineOpt = line ? { style: "solid", fill: line.fill, width: line.width ?? 1 } : { style: "solid", fill, width: 0.1 };
  const s = slide.shapes.add({ geometry: "roundRect", position: { left, top, width, height }, fill, line: lineOpt, ...rr(radius) });
  return s;
}

function rect(slide, { left, top, width, height, fill, radius = null }) {
  const opts = { geometry: radius != null ? "roundRect" : "rect", position: { left, top, width, height }, fill, line: { style: "solid", fill, width: 0.1 } };
  if (radius != null) Object.assign(opts, rr(radius));
  return slide.shapes.add(opts);
}

function roundIcon(slide, x, y, size, fill) {
  return slide.shapes.add({ geometry: "roundRect", position: { left: x, top: y, width: size, height: size }, fill, line: { style: "solid", fill, width: 0.1 }, ...rr(24000) });
}

function dot(slide, x, y, size, fill) {
  return slide.shapes.add({ geometry: "ellipse", position: { left: x, top: y, width: size, height: size }, fill, line: { style: "solid", fill, width: 0.1 } });
}

function txt(slide, str, opts) {
  const {
    left, top, width, height,
    size = 18, bold = false, color = C.ink, font = FONT.body,
    align = "left", valign = "top", line = 1.02, spaceAfter = 0, italic = false,
  } = opts;
  const s = slide.shapes.add({ geometry: "rect", position: { left, top, width, height }, fill: T, line: { style: "solid", fill: T, width: 0.1 } });
  s.text = str;
  s.text.typeface = font;
  s.text.fontSize = size;
  s.text.bold = bold;
  s.text.color = color;
  s.text.alignment = align;
  s.text.verticalAlignment = valign;
  try { if (italic) s.text.italic = italic; } catch {}
  s.text.insets = { left: 0, right: 0, top: 0, bottom: 0 };
  try { s.text.lineSpacing = line; } catch {}
  return s;
}

function logoMark(slide, x, y, dark = false) {
  slide.shapes.add({ geometry: "roundRect", position: { left: x, top: y, width: 40, height: 40 }, fill: C.red, line: { style: "solid", fill: C.red, width: 0.1 }, ...rr(20000) });
  txt(slide, "A1", { left: x, top: y + 5, width: 40, height: 30, size: 19, bold: true, color: C.white, font: FONT.title, align: "center", valign: "middle" });
  txt(slide, "OSS Assistant", { left: x + 50, top: y + 8, width: 260, height: 26, size: 15, bold: true, color: dark ? C.white : C.ink, font: FONT.title, valign: "middle" });
}

function footer(slide, dark = false) {
  const col = dark ? "#FFFFFFB0" : C.softGrey;
  const idx = presentation.slides.count;
  txt(slide, "OSS Assistant · A1 България", { left: MARGIN, top: H - 40, width: 500, height: 20, size: 10.5, color: col, font: FONT.body });
  txt(slide, String(idx).padStart(2, "0"), { left: W - MARGIN - 60, top: H - 40, width: 60, height: 20, size: 10.5, color: col, font: FONT.body, align: "right" });
}

function newsDualSlide(kicker, title, subtitle, items) {
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, kicker);
  titleBlock(s, title, subtitle);

  const top = 248, gap = 24, cw = (W - 2 * MARGIN - gap) / 2, ch = 356;
  items.forEach((it, i) => {
    const x = MARGIN + i * (cw + gap);
    card(s, { left: x, top, width: cw, height: ch });
    rect(s, { left: x, top, width: cw, height: 6, fill: C.red, radius: 6000 });
    txt(s, it.t, { left: x + 28, top: top + 28, width: cw - 56, height: 52, size: 18, bold: true, color: C.ink, font: FONT.title, line: 1.05 });
    bullets(s, [
      { t: `Какво: ${it.what}`, lines: 2, lineH: 22 },
      { t: `Защо: ${it.why}`, lines: 2, lineH: 22 },
      { t: `Ефект: ${it.effect}`, lines: 2, lineH: 22 },
    ], { left: x + 28, top: top + 88, width: cw - 56, size: 13.5, color: C.grey, gap: 10, lineH: 22, dotColor: C.red });
    if (it.note) {
      const ny = top + ch - 58;
      rect(s, { left: x + 28, top: ny, width: cw - 56, height: 42, fill: "#FBE6EA", radius: 8000 });
      txt(s, it.note, { left: x + 42, top: ny, width: cw - 84, height: 42, size: 11.5, bold: true, color: C.redDeep, font: FONT.body, valign: "middle", line: 1.08 });
    }
  });
  footer(s);
  return s;
}

function header(slide, kicker) {
  logoMark(slide, MARGIN, 40);
  txt(slide, kicker, { left: W - MARGIN - 380, top: 50, width: 380, height: 22, size: 12, bold: true, color: C.red, font: FONT.title, align: "right" });
  rect(slide, { left: W - MARGIN - 44, top: 78, width: 44, height: 3, fill: C.red });
}

function titleBlock(slide, title, sub) {
  rect(slide, { left: MARGIN, top: 112, width: 52, height: 6, fill: C.red, radius: 30000 });
  txt(slide, title, { left: MARGIN, top: 128, width: W - 2 * MARGIN, height: 62, size: 34, bold: true, color: C.ink, font: FONT.title });
  if (sub) txt(slide, sub, { left: MARGIN, top: 190, width: W - 2 * MARGIN, height: 30, size: 15, color: C.midGrey, font: FONT.body });
}

async function plate(slide, name) {
  const p = path.join(REF_DIR, name);
  const img = slide.images.add({ blob: await readImageBlob(p), fit: "cover", alt: "" });
  img.position = { left: 0, top: 0, width: W, height: H };
  return img;
}

function bullets(slide, items, { left, top, width, gap = 14, size = 15, color = C.grey, dotColor = C.red, lineH = 26 }) {
  let y = top;
  for (const it of items) {
    const isObj = typeof it === "object";
    const text = isObj ? it.t : it;
    const lines = isObj && it.lines ? it.lines : 1;
    const dc = isObj && it.dot ? it.dot : dotColor;
    dot(slide, left, y + 7, 8, dc);
    const s = txt(slide, text, { left: left + 20, top: y, width: width - 20, height: lineH * lines + 6, size, color, font: FONT.body, line: 1.12 });
    y += lineH * lines + gap;
  }
  return y;
}

async function readPngSize(imagePath) {
  const buf = await fs.promises.readFile(imagePath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function fitSize(maxWidth, maxHeight, imgWidth, imgHeight) {
  const ratio = imgWidth / imgHeight;
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

async function screenshotImage(slide, { left, top, maxWidth, maxHeight, file }) {
  const imagePath = path.join(SCREENSHOT_DIR, file);
  const { width: imgW, height: imgH } = await readPngSize(imagePath);
  const accent = 6;
  const innerMaxW = maxWidth - accent;
  const { width: fitW, height: fitH } = fitSize(innerMaxW, maxHeight, imgW, imgH);
  const frameW = fitW + accent;
  const frameH = fitH;
  const frameLeft = left + Math.round((maxWidth - frameW) / 2);
  const frameTop = top + Math.round((maxHeight - frameH) / 2);

  card(slide, { left: frameLeft, top: frameTop, width: frameW, height: frameH, fill: C.cardBg, line: { fill: C.lightLine, width: 1 } });
  rect(slide, { left: frameLeft, top: frameTop, width: accent, height: frameH, fill: C.red, radius: 6000 });
  const img = slide.images.add({ blob: await readImageBlob(imagePath), fit: "contain", alt: "" });
  img.position = { left: frameLeft + accent, top: frameTop, width: fitW, height: fitH };
  return { left: frameLeft, top: frameTop, width: frameW, height: frameH };
}

async function sectionDivider({ num, title, subtitle, accent = C.red }) {
  const s = presentation.slides.add();
  s.background.fill = C.ink;
  roundIcon(s, MARGIN, 58, 44, C.white);
  txt(s, "A1", { left: MARGIN, top: 64, width: 44, height: 32, size: 20, bold: true, color: C.red, font: FONT.title, align: "center", valign: "middle" });
  txt(s, "OSS Assistant", { left: MARGIN + 56, top: 68, width: 300, height: 28, size: 15, bold: true, color: C.white, font: FONT.title, valign: "middle" });

  txt(s, `СЕКЦИЯ ${num}`, { left: MARGIN, top: 210, width: 200, height: 28, size: 14, bold: true, color: accent, font: FONT.title });
  txt(s, title, { left: MARGIN, top: 248, width: 820, height: 110, size: 58, bold: true, color: C.white, font: FONT.title, line: 1.02 });
  rect(s, { left: MARGIN + 4, top: 362, width: 72, height: 8, fill: accent, radius: 30000 });
  txt(s, subtitle, { left: MARGIN, top: 386, width: 760, height: 36, size: 18, color: "#FFFFFFCC", font: FONT.body });
  footer(s, true);
  return s;
}

function checklistSlide(kicker, title, subtitle, items, { icon = "✓", iconBg = "#E4F5EC", iconColor = C.greenOk } = {}) {
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, kicker);
  titleBlock(s, title, subtitle);
  const top = 246, gap = 18, cw = (W - 2 * MARGIN - gap) / 2, rowH = 78;
  items.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = MARGIN + col * (cw + gap), y = top + row * (rowH + 14);
    card(s, { left: x, top: y, width: cw, height: rowH });
    roundIcon(s, x + 20, y + 21, 36, iconBg);
    txt(s, icon, { left: x + 20, top: y + 21, width: 36, height: 36, size: icon === "…" ? 22 : 18, bold: true, color: iconColor, font: FONT.title, align: "center", valign: "middle" });
    txt(s, it, { left: x + 68, top: y, width: cw - 88, height: rowH, size: 14, color: C.grey, font: FONT.body, valign: "middle", line: 1.12 });
  });
  footer(s);
  return s;
}

function improvementCardsSlide(kicker, title, subtitle, items) {
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, kicker);
  titleBlock(s, title, subtitle);
  const top = 250, gap = 22, cw = (W - 2 * MARGIN - gap) / 2, ch = 168;
  items.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = MARGIN + col * (cw + gap), y = top + row * (ch + 18);
    card(s, { left: x, top: y, width: cw, height: ch });
    rect(s, { left: x, top: y, width: 6, height: ch, fill: C.red, radius: 6000 });
    roundIcon(s, x + 26, y + 26, 40, C.red);
    txt(s, "✓", { left: x + 26, top: y + 26, width: 40, height: 40, size: 20, bold: true, color: C.white, font: FONT.title, align: "center", valign: "middle" });
    txt(s, it.t, { left: x + 80, top: y + 24, width: cw - 108, height: 46, size: 16.5, bold: true, color: C.ink, font: FONT.title, line: 1.05 });
    txt(s, it.d, { left: x + 80, top: y + 74, width: cw - 108, height: 78, size: 13.5, color: C.midGrey, font: FONT.body, line: 1.2 });
  });
  footer(s);
  return s;
}

function macScanSlide() {
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "АКТИВНА РАЗРАБОТКА · MAC СКАНИРАНЕ");
  titleBlock(s, "Сканиране на MAC без «скачане» на прозорец", "KSTB5019 / KSTB5020 — защита при barcode четец като клавиатура.");

  const top = 248, gap = 20, cw = (W - 2 * MARGIN - gap) / 2, ch = 168;
  const panels = [
    {
      label: "Проблем",
      fill: "#FBE6EA",
      accent: C.red,
      items: [
        "При KSTB5019 и KSTB5020 четецът понякога «скачаше» таб / прозорец след MAC",
        "Четецът изпраща Tab, Alt или други клавиши след баркода",
      ],
    },
    {
      label: "Решение",
      fill: "#E4F5EC",
      accent: C.greenOk,
      items: [
        "Assistant блокира тези клавиши само за KSTB5019 и KSTB5020",
        "MAC се въвежда нормално; focus остава в полето; Enter работи както преди",
      ],
    },
    {
      label: "Кога е активно",
      fill: C.cardBg,
      accent: C.red,
      items: [
        "Категория: 5019/5020 & Zapper",
        "Избрано е точно едно устройство: KSTB5019 или KSTB5020",
      ],
    },
    {
      label: "За техниците",
      fill: C.cardBg,
      accent: C.greenOk,
      items: [
        "Сканирайте MAC както досега — без допълнителни стъпки",
        "Няма забавяне и няма блокиране на работата",
      ],
    },
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
  rect(s, { left: MARGIN, top: bY, width: W - 2 * MARGIN, height: 40, fill: "#FFF4E5", radius: 8000 });
  rect(s, { left: MARGIN, top: bY, width: 6, height: 40, fill: "#D28A1D", radius: 8000 });
  txt(s, "Ако проблемът остане: скачане между приложения (Alt+Tab) — reprogramming на четец (suffix само Enter, без Alt/Tab prefix).", { left: MARGIN + 26, top: bY, width: W - 2 * MARGIN - 52, height: 40, size: 12.5, bold: true, color: "#8A4B00", font: FONT.body, valign: "middle", line: 1.08 });
  footer(s);
  return s;
}

function autoUpdateSlide() {
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "АКТИВНА РАЗРАБОТКА · ОБНОВЯВАНЕ");
  titleBlock(s, "Автоматично ъпдейтване на Extension", "Качим нов ъпдейт — обновява се сам на всеки компютър, без ръчна намеса.");

  const top = 248, gap = 20, cw = (W - 2 * MARGIN - gap) / 2, ch = 168;
  const panels = [
    {
      label: "Днес",
      fill: "#FBE6EA",
      accent: C.red,
      items: [
        "При всеки нов ъпдейт трябва ръчно да се качи на всеки компютър",
        "Обход на колегите с флашка — отнема по 30–40 минути",
      ],
    },
    {
      label: "Как ще работи (в разработка)",
      fill: "#E4F5EC",
      accent: C.greenOk,
      items: [
        "Качим или пуснем нов ъпдейт — Extension се обновява автоматично навсякъде",
        "Без обход на компютри и без ръчна намеса от колегите",
      ],
    },
    {
      label: "Резултат",
      fill: C.cardBg,
      accent: C.red,
      items: [
        "Всички винаги работят с последната версия",
        "Един ъпдейт от нас — разгръщане на всички машини наведнъж",
      ],
    },
    {
      label: "Спестено време",
      fill: C.cardBg,
      accent: C.greenOk,
      items: [
        "~30–40 минути при всеки нов ъпдейт",
        "Време, което досега отиваше за обход с флашка",
      ],
    },
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
  rect(s, { left: MARGIN, top: bY, width: W - 2 * MARGIN, height: 40, fill: "#FBE6EA", radius: 8000 });
  rect(s, { left: MARGIN, top: bY, width: 6, height: 40, fill: C.red, radius: 8000 });
  txt(s, "Активна разработка — не е финално. Цел: качим ъпдейт веднъж → автоматично на всеки компютър, без 30–40 мин обход с флашка.", { left: MARGIN + 26, top: bY, width: W - 2 * MARGIN - 52, height: 40, size: 12.5, bold: true, color: C.redDeep, font: FONT.body, valign: "middle", line: 1.08 });
  footer(s);
  return s;
}

function kstb5019ContractPlanSlide() {
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "ПЛАН ЗА РАЗВИТИЕ · 5019/5020");
  titleBlock(s, "KSTB5019 / KSTB5020 и «невидими» договори", "Устройства, закачени към договор, който не се намира и не може да се освободи.");

  const top = 248, gap = 20, cw = (W - 2 * MARGIN - gap) / 2, ch = 168;
  const panels = [
    {
      label: "Проблем",
      fill: "#F4F5F7",
      accent: C.midGrey,
      items: [
        "Някои 5019/5020 не се намират в договорите, но остават закачени към договор",
        "Договорът не се вижда — устройството не може да се изтрие, откачи или нормално тества",
      ],
    },
    {
      label: "Ефект за работата",
      fill: "#FBE6EA",
      accent: C.red,
      items: [
        "Техникът не може да завърши рециклиране или проверка на устройството",
        "Случаят «зависва» — особено при по-стари или по-рядко срещани устройства",
      ],
    },
    {
      label: "План (идея)",
      fill: C.cardBg,
      accent: C.midGrey,
      items: [
        "Проверка/предупреждение когато устройството изглежда закачено без видим договор",
        "Помощ за откриване на договора или път за освобождаване на устройството",
      ],
    },
    {
      label: "Цел",
      fill: "#E4F5EC",
      accent: C.greenOk,
      items: [
        "5019/5020 да могат да се тестват и рециклират без блокиране",
        "По-малко ръчни обходи и ескалации към други екипи",
      ],
    },
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
  txt(s, "План за разработка — изисква анализ в OSS и координация с екипа. Цел: да няма «закачени» 5019/5020 без видим начин за освобождаване.", { left: MARGIN + 26, top: bY, width: W - 2 * MARGIN - 52, height: 40, size: 12.5, bold: true, color: C.grey, font: FONT.body, valign: "middle", line: 1.08 });
  footer(s);
  return s;
}

function contractRemoveButtonPlanSlide() {
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "ПЛАН ЗА РАЗВИТИЕ · ДОГОВОРИ");
  titleBlock(s, "Премахване от договор с един бутон", "Без ръчен вход в договорите — директно от процеса в OSS.");

  const top = 248, gap = 20, cw = (W - 2 * MARGIN - gap) / 2, ch = 168;
  const panels = [
    {
      label: "Днес",
      fill: "#F4F5F7",
      accent: C.midGrey,
      items: [
        "За да се освободи устройство, трябва ръчно да се влезе в договорите",
        "Търсене на договора, намиране на устройството, изтриване — много стъпки и време",
      ],
    },
    {
      label: "Идея (план)",
      fill: "#E4F5EC",
      accent: C.greenOk,
      items: [
        "Един бутон в OSS — премахва устройството от договора на място",
        "Без да се напуска текущият процес и без отделен обход в договорите",
      ],
    },
    {
      label: "Спестено време",
      fill: C.cardBg,
      accent: C.red,
      items: [
        "Значително по-малко време при всеки такъв случай",
        "По-малко прескачане между екрани и менюта в OSS",
      ],
    },
    {
      label: "Цел",
      fill: C.cardBg,
      accent: C.greenOk,
      items: [
        "Техникът завършва по-бързо — един клик вместо ръчен обход",
        "По-малко блокирани устройства и по-малко ескалации",
      ],
    },
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
  txt(s, "План за разработка — идея за бъдеща реализация. Цел: премахване от договор с един бутон, без ръчен обход.", { left: MARGIN + 26, top: bY, width: W - 2 * MARGIN - 52, height: 40, size: 12.5, bold: true, color: C.grey, font: FONT.body, valign: "middle", line: 1.08 });
  footer(s);
  return s;
}

// ============================================================
// SLIDE 1 — Cover
// ============================================================
{
  const s = presentation.slides.add();
  await plate(s, "slide-01.png");
  // logo
  roundIcon(s, MARGIN, 70, 52, C.white);
  txt(s, "A1", { left: MARGIN, top: 78, width: 52, height: 38, size: 24, bold: true, color: C.red, font: FONT.title, align: "center", valign: "middle" });
  txt(s, "A1 БЪЛГАРИЯ", { left: MARGIN + 66, top: 82, width: 300, height: 30, size: 15, bold: true, color: "#FFFFFFCC", font: FONT.title, valign: "middle" });

  txt(s, "OSS Assistant", { left: MARGIN, top: 250, width: 760, height: 96, size: 76, bold: true, color: C.white, font: FONT.title });
  rect(s, { left: MARGIN + 4, top: 356, width: 90, height: 8, fill: C.white, radius: 30000 });
  txt(s, "По-малко ръчна работа. По-малко грешки. По-бърз процес.", { left: MARGIN, top: 386, width: 720, height: 40, size: 22, color: "#FFFFFFEE", font: FONT.body });
  txt(s, "Chrome разширение, което подпомага оператора директно в OSS", { left: MARGIN, top: 430, width: 700, height: 30, size: 15, color: "#FFFFFFB0", font: FONT.body });

  txt(s, "Вътрешна демонстрация · тестова среда", { left: MARGIN, top: H - 58, width: 600, height: 24, size: 12.5, color: "#FFFFFFA0", font: FONT.body });
}

// ============================================================
// SLIDE 2 — What is it
// ============================================================
{
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "ПРЕДСТАВЯНЕ");
  titleBlock(s, "Какво е OSS Assistant", "Инструмент, който допълва OSS — без да променя основната система.");

  const cardTop = 250, cardH = 300, gap = 24;
  const cw = (W - 2 * MARGIN - 2 * gap) / 3;
  const data = [
    { n: "01", t: "Работи вътре в OSS", d: "Chrome разширение, което се зарежда върху вътрешния OSS портал и помага в реалния екран на оператора." },
    { n: "02", t: "Допълва, не заменя", d: "Не променя логиката на OSS. Добавя защита и автоматизация там, където процесът е ръчен и бавен." },
    { n: "03", t: "Помага в реално време", d: "Валидира въведеното, предлага правилни стойности и намалява местата, където операторът може да сгреши." },
  ];
  data.forEach((d, i) => {
    const x = MARGIN + i * (cw + gap);
    card(s, { left: x, top: cardTop, width: cw, height: cardH });
    rect(s, { left: x, top: cardTop, width: cw, height: 6, fill: C.red, radius: 6000 });
    txt(s, d.n, { left: x + 28, top: cardTop + 34, width: cw - 56, height: 54, size: 44, bold: true, color: "#F0C4CC", font: FONT.title });
    txt(s, d.t, { left: x + 28, top: cardTop + 104, width: cw - 56, height: 60, size: 21, bold: true, color: C.ink, font: FONT.title, line: 1.05 });
    txt(s, d.d, { left: x + 28, top: cardTop + 168, width: cw - 56, height: 120, size: 14.5, color: C.midGrey, font: FONT.body, line: 1.2 });
  });

  const bTop = cardTop + cardH + 22;
  rect(s, { left: MARGIN, top: bTop, width: W - 2 * MARGIN, height: 44, fill: "#FBE6EA", radius: 8000 });
  rect(s, { left: MARGIN, top: bTop, width: 6, height: 44, fill: C.red, radius: 8000 });
  txt(s, "Целта не е да добавим бутони върху OSS, а да намалим местата, където операторът може да сгреши при ръчна работа.", { left: MARGIN + 26, top: bTop, width: W - 2 * MARGIN - 52, height: 44, size: 14.5, bold: true, color: C.redDeep, font: FONT.body, valign: "middle" });
  footer(s);
}

// ============================================================
// SLIDE 3 — The problem
// ============================================================
{
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "ПРОБЛЕМЪТ");
  titleBlock(s, "Ръчната работа носи риск от грешки", "Голяма част от действията в OSS се правят ръчно — а всяка ръчна стъпка е възможна грешка.");

  // left: error examples
  const lx = MARGIN, lw = 600, top = 250;
  card(s, { left: lx, top, width: lw, height: 356 });
  txt(s, "Типични грешки при ръчна работа", { left: lx + 28, top: top + 24, width: lw - 56, height: 30, size: 17, bold: true, color: C.ink, font: FONT.title });
  const errs = [
    "Грешен сериен номер", "Кирилица вместо латиница",
    "Сканиран грешен баркод", "Грешна категория устройство",
    "Грешен SAP / материал", "Повторно бракуване / рециклиране",
    "Ръчно търсене в Excel", "Преписване на SSID и парола на ръка",
  ];
  const colW = (lw - 56) / 2;
  errs.forEach((e, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = lx + 28 + col * colW, y = top + 70 + row * 62;
    slide3chip(s, x, y, colW - 16, e);
  });

  function slide3chip(sl, x, y, w, label) {
    const h = 48;
    rect(sl, { left: x, top: y, width: w, height: h, fill: "#F7F8FA", radius: 9000 });
    slSq(sl, x + 12, y + 15);
    txt(sl, label, { left: x + 40, top: y, width: w - 48, height: h, size: 13.5, color: C.grey, font: FONT.body, valign: "middle", line: 1.0 });
  }
  function slSq(sl, x, y) {
    roundIcon(sl, x, y, 18, "#FBDCE2");
    txt(sl, "!", { left: x, top: y - 1, width: 18, height: 18, size: 12, bold: true, color: C.red, font: FONT.title, align: "center", valign: "middle" });
  }

  // right: consequences
  const rx = lx + lw + 24, rw = W - MARGIN - rx;
  card(s, { left: rx, top, width: rw, height: 356, fill: C.ink });
  txt(s, "Докъде води грешката", { left: rx + 26, top: top + 24, width: rw - 52, height: 28, size: 17, bold: true, color: C.white, font: FONT.title });
  bullets(s, [
    "Неправилно заведено устройство",
    "Проблеми с провизионирането",
    "Допълнителни корекции и загубено време",
    "Объркване в отчетността",
  ], { left: rx + 26, top: top + 72, width: rw - 52, size: 15, color: "#E7E9EE", dotColor: C.coral, gap: 16, lineH: 42 });
  footer(s);
}

// ============================================================
// SLIDE 4 — Real value (pillars)
// ============================================================
{
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "РЕАЛНАТА ПОЛЗА");
  titleBlock(s, "С какво реално помага на оператора", "Четири ясни ползи, които се усещат в ежедневната работа.");

  const top = 252, gap = 22, cw = (W - 2 * MARGIN - 3 * gap) / 4, ch = 292;
  const pillars = [
    { i: "↺", t: "Автоматизация", d: "Попълва и предлага стойности в контекст, вместо техникът да ги търси ръчно." },
    { i: "⚡", t: "По-бърз процес", d: "Намалява Excel lookup, copy/paste, въвеждане и прескачане между прозорци." },
    { i: "✓", t: "Предотвратяване на грешки", d: "Хваща грешен serial, категория или material преди те да стигнат надолу по процеса." },
    { i: "?", t: "Насоки за техника", d: "Показва подходящо устройство, help image или следваща безопасна стъпка." },
  ];
  pillars.forEach((p, i) => {
    const x = MARGIN + i * (cw + gap);
    card(s, { left: x, top, width: cw, height: ch });
    roundIcon(s, x + 26, top + 28, 52, "#FBE6EA");
    txt(s, p.i, { left: x + 26, top: top + 30, width: 52, height: 50, size: 26, bold: true, color: C.red, font: FONT.title, align: "center", valign: "middle" });
    txt(s, p.t, { left: x + 26, top: top + 100, width: cw - 52, height: 60, size: 19, bold: true, color: C.ink, font: FONT.title, line: 1.05 });
    txt(s, p.d, { left: x + 26, top: top + 164, width: cw - 52, height: 110, size: 14, color: C.midGrey, font: FONT.body, line: 1.22 });
  });

  const bTop = top + ch + 20;
  rect(s, { left: MARGIN, top: bTop, width: W - 2 * MARGIN, height: 42, fill: C.red, radius: 8000 });
  txt(s, "Резултат: помощен слой между техника и OSS - по-бърз процес, по-малко ръчно въвеждане и по-малко грешки.", { left: MARGIN + 24, top: bTop, width: W - 2 * MARGIN - 48, height: 42, size: 14.5, bold: true, color: C.white, font: FONT.title, valign: "middle" });
  footer(s);
}

// ============================================================
// SLIDE 5 — Clicks reduction chart
// ============================================================
{
  const s = presentation.slides.add();
  await plate(s, "slide-05.png");
  header(s, "ПО-МАЛКО КЛИКВАНИЯ");
  titleBlock(s, "Колко действия спестяваме", "Приблизителна оценка на кликванията/действията на оператора за типична задача.");

  // left panel: chart
  const px = MARGIN, pw = 760, ptop = 246, ph = 360;
  card(s, { left: px, top: ptop, width: pw, height: ph });
  const chart = s.charts.add("bar");
  chart.position = { left: px + 22, top: ptop + 20, width: pw - 44, height: ph - 46 };
  chart.categories = ["SSID / парола", "SAP / материал", "Етикети (10 бр.)", "Категория / модел", "Валидация с/н"];
  const s1 = chart.series.add("Без Assistant");
  s1.values = [14, 9, 22, 7, 6];
  s1.categories = chart.categories;
  s1.fill = C.softGrey;
  const s2 = chart.series.add("С Assistant");
  s2.values = [2, 1, 3, 1, 1];
  s2.categories = chart.categories;
  s2.fill = C.red;
  const T2 = (fn) => { try { fn(); } catch (e) { console.log("chart-cfg skip:", e.message); } };
  T2(() => { chart.barOptions.direction = "column"; });
  T2(() => { chart.barOptions.grouping = "clustered"; });
  T2(() => { chart.hasLegend = true; });
  T2(() => { chart.legend.position = "top"; });
  T2(() => { chart.legend.textStyle.typeface = FONT.body; });
  T2(() => { chart.legend.textStyle.fontSize = 12; });
  T2(() => { chart.dataLabels.showValue = true; });
  T2(() => { chart.dataLabels.position = "outEnd"; });
  T2(() => { chart.dataLabels.textStyle.typeface = FONT.body; });
  T2(() => { chart.dataLabels.textStyle.fontSize = 10; });
  T2(() => { chart.xAxis.textStyle.typeface = FONT.body; });
  T2(() => { chart.xAxis.textStyle.fontSize = 11; });
  T2(() => { chart.yAxis.textStyle.typeface = FONT.body; });
  T2(() => { chart.yAxis.textStyle.fontSize = 10; });
  T2(() => { chart.plotAreaFill = C.white; });

  // right: big stat
  const rx = px + pw + 24, rw = W - MARGIN - rx;
  card(s, { left: rx, top: ptop, width: rw, height: 168, fill: C.red });
  txt(s, "до ~85%", { left: rx + 24, top: ptop + 30, width: rw - 48, height: 70, size: 56, bold: true, color: C.white, font: FONT.title });
  txt(s, "по-малко кликвания за типична операция", { left: rx + 24, top: ptop + 104, width: rw - 48, height: 50, size: 14.5, color: "#FFFFFFE6", font: FONT.body, line: 1.15 });

  card(s, { left: rx, top: ptop + 192, width: rw, height: 168, fill: C.ink });
  txt(s, "~58  →  ~8", { left: rx + 24, top: ptop + 216, width: rw - 48, height: 54, size: 36, bold: true, color: C.white, font: FONT.title });
  txt(s, "средно действия на цикъл: преди и с OSS Assistant", { left: rx + 24, top: ptop + 276, width: rw - 48, height: 60, size: 14, color: "#E7E9EE", font: FONT.body, line: 1.18 });
  rect(s, { left: MARGIN, top: 620, width: W - 2 * MARGIN, height: 34, fill: "#FFFFFFE6", radius: 8000 });
  txt(s, "Стойностите са ориентировъчни и показват средния брой ръчни действия за един цялостен цикъл по обработване на едно устройство.", { left: MARGIN + 20, top: 620, width: W - 2 * MARGIN - 40, height: 34, size: 11.5, bold: true, color: C.grey, font: FONT.body, valign: "middle" });
  footer(s);
}

// ============================================================
// AGENDA — Three sections
// ============================================================
{
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "СТРУКТУРА");
  titleBlock(s, "Три секции в презентацията", "Ясно разделение: готови функции · активна разработка · план.");

  const top = 252, gap = 24, cw = (W - 2 * MARGIN - 2 * gap) / 3, ch = 280;
  const sections = [
    { n: "01", t: "Вече работи", d: "Функции, които подпомагат оператора днес — валидирани в тестова среда.", c: C.greenOk, bg: "#E4F5EC" },
    { n: "02", t: "Активна разработка", d: "Подобрения в тестване — не 100% финални, но вече се пробват.", c: C.red, bg: "#FBE6EA" },
    { n: "03", t: "План за развитие", d: "Посока и идеи за бъдещи реализации в OSS.", c: C.midGrey, bg: "#F4F5F7" },
  ];
  sections.forEach((sec, i) => {
    const x = MARGIN + i * (cw + gap);
    card(s, { left: x, top, width: cw, height: ch });
    rect(s, { left: x, top, width: cw, height: 8, fill: sec.c, radius: 6000 });
    roundIcon(s, x + 26, top + 36, 52, sec.bg);
    txt(s, sec.n, { left: x + 26, top: top + 38, width: 52, height: 48, size: 24, bold: true, color: sec.c, font: FONT.title, align: "center", valign: "middle" });
    txt(s, sec.t, { left: x + 26, top: top + 108, width: cw - 52, height: 52, size: 22, bold: true, color: C.ink, font: FONT.title, line: 1.05 });
    txt(s, sec.d, { left: x + 26, top: top + 168, width: cw - 52, height: 90, size: 14, color: C.midGrey, font: FONT.body, line: 1.22 });
  });
  footer(s);
}

await sectionDivider({
  num: "01",
  title: "Вече работи",
  subtitle: "Функции, които подпомагат оператора днес.",
  accent: C.greenOk,
});

// ============================================================
// SLIDE 8 — Guided recycle entry and serial validation
// ============================================================
{
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "ВЕЧЕ РАБОТИ · ВАЛИДАЦИЯ");
  titleBlock(s, "Насочено въвеждане и serial validation", "Изборът на категория и устройство задава контекст за целия работен ден.");

  const top = 246, lw = 420, gap = 24;
  card(s, { left: MARGIN, top, width: lw, height: 356 });
  txt(s, "Контекстът води процеса", { left: MARGIN + 26, top: top + 22, width: lw - 52, height: 28, size: 17, bold: true, color: C.ink, font: FONT.title });
  const flow = ["Избор на категория", "Избор на устройство", "Валидация на serial", "Филтриране на SAP/material"];
  flow.forEach((label, i) => {
    const y = top + 64 + i * 48;
    rect(s, { left: MARGIN + 26, top: y, width: lw - 52, height: 36, fill: i === 2 ? "#FBE6EA" : "#F4F5F7", radius: 9000 });
    txt(s, String(i + 1), { left: MARGIN + 40, top: y, width: 22, height: 36, size: 13, bold: true, color: i === 2 ? C.redDeep : C.midGrey, font: FONT.title, valign: "middle", align: "center" });
    txt(s, label, { left: MARGIN + 74, top: y, width: lw - 116, height: 36, size: 13.5, bold: true, color: C.grey, font: FONT.body, valign: "middle" });
  });
  rect(s, { left: MARGIN + 26, top: top + 274, width: lw - 52, height: 58, fill: C.ink, radius: 8000 });
  txt(s, "Невалиден формат, кирилица или грешен идентификатор се хващат преди да доведат до provisioning проблем.", { left: MARGIN + 42, top: top + 282, width: lw - 84, height: 42, size: 12.5, bold: true, color: C.white, font: FONT.body, valign: "middle", line: 1.12 });

  const rx = MARGIN + lw + gap, rw = W - MARGIN - rx;
  await screenshotImage(s, { left: rx, top, maxWidth: rw, maxHeight: 356, file: "slide08-invalid-serial-warning.png" });
  footer(s);
}

// ============================================================
// SLIDE 9A — SAP/material selection and filtering
// ============================================================
{
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "ВЕЧЕ РАБОТИ · SAP / MATERIAL");
  titleBlock(s, "SAP/material според избрания контекст", "От търсене в Excel и copy/paste към ограничен избор и безопасно auto-fill.");

  const top = 246, lw = 430, gap = 24, rw = W - 2 * MARGIN - lw - gap;
  const blocks = [
    { label: "Проблем в OSS", fill: "#FBE6EA", accent: C.red, text: "Търсене в Excel, смяна на прозорец, copy/paste и ръчно въвеждане на material." },
    { label: "Как помага на техника", fill: "#E4F5EC", accent: C.greenOk, text: "Показва бързи бутони само за избраната category/device; при един безопасен кандидат попълва стойността." },
    { label: "Спестени действия", fill: C.cardBg, accent: C.red, text: "Намалява търсене, смяна на прозорец, copy/paste и typing. При двусмислен избор не избира автоматично." },
  ];
  blocks.forEach((b, i) => {
    const y = top + i * 118;
    card(s, { left: MARGIN, top: y, width: lw, height: 104, fill: b.fill });
    rect(s, { left: MARGIN, top: y, width: 6, height: 104, fill: b.accent, radius: 6000 });
    txt(s, b.label, { left: MARGIN + 24, top: y + 18, width: lw - 48, height: 20, size: 14.5, bold: true, color: C.ink, font: FONT.title });
    txt(s, b.text, { left: MARGIN + 24, top: y + 46, width: lw - 48, height: 48, size: 12.5, color: C.grey, font: FONT.body, line: 1.12 });
  });
  await screenshotImage(s, { left: MARGIN + lw + gap, top, maxWidth: rw, maxHeight: 356, file: "slide09-sap-material-buttons.png" });
  footer(s);
}

// ============================================================
// SLIDE 9B — Duplicate/history protection
// ============================================================
{
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "ВЕЧЕ РАБОТИ · ПОВТОРНА ОБРАБОТКА");
  titleBlock(s, "Защита от повторна обработка", "История и локална защита предупреждават преди устройство да се обработи отново.");

  const top = 246, lw = 430, gap = 24, rw = W - 2 * MARGIN - lw - gap;
  const blocks = [
    { label: "Проблем в OSS", fill: "#FBE6EA", accent: C.red, text: "Едно физическо устройство може да се въведе повторно или с различен идентификатор." },
    { label: "Как помага на техника", fill: "#E4F5EC", accent: C.greenOk, text: "Проверява OSS history и локална защита; предупреждава преди Продължи." },
    { label: "Намален риск", fill: C.cardBg, accent: C.red, text: "По-малко грешни количества, несъответствия, повторно handling и ръчни корекции." },
  ];
  blocks.forEach((b, i) => {
    const y = top + i * 118;
    card(s, { left: MARGIN, top: y, width: lw, height: 104, fill: b.fill });
    rect(s, { left: MARGIN, top: y, width: 6, height: 104, fill: b.accent, radius: 6000 });
    txt(s, b.label, { left: MARGIN + 24, top: y + 18, width: lw - 48, height: 20, size: 14.5, bold: true, color: C.ink, font: FONT.title });
    txt(s, b.text, { left: MARGIN + 24, top: y + 46, width: lw - 48, height: 48, size: 12.5, color: C.grey, font: FONT.body, line: 1.12 });
  });
  const shotTop = top;
  const shotMaxH = 300;
  const shot = await screenshotImage(s, { left: MARGIN + lw + gap, top: shotTop, maxWidth: rw, maxHeight: shotMaxH, file: "slide10-duplicate-warning.png" });
  const noteTop = shot.top + shot.height + 10;
  rect(s, { left: MARGIN + lw + gap, top: noteTop, width: rw, height: 48, fill: "#FBE6EA", radius: 8000 });
  txt(s, "Покритието е ценна защита, но специфични edge cases продължават да се тестват.", { left: MARGIN + lw + gap + 18, top: noteTop + 6, width: rw - 36, height: 36, size: 11.5, bold: true, color: C.redDeep, font: FONT.body, valign: "middle", line: 1.08 });
  footer(s);
}

// ============================================================
// SLIDE 10 — Clipboard autofill and labels
// ============================================================
{
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "ВЕЧЕ РАБОТИ · УСКОРЯВАНЕ");
  titleBlock(s, "Clipboard autofill и labels/barcodes", "По-малко преписване и подготвен print output, без показване на чувствителни данни.");

  const top = 246, gap = 24, cw = (W - 2 * MARGIN - gap) / 2;
  const zones = [
    {
      x: MARGIN,
      title: "SSID / PSK от clipboard",
      text: "Попълва разпознати SSID, PSK и портове. Google Lens е незадължителен начин за text capture към clipboard, не Extension integration.",
      screenshot: "slide11-ssid-autofill.png",
      fill: C.ink,
      titleColor: C.white,
      textColor: "#E7E9EE",
    },
    {
      x: MARGIN + cw + gap,
      title: "Labels и barcode sheets",
      text: "Подготвя печат от подходящите редове и намалява повторяемата подготовка. Използвай само синтетични данни в demo.",
      screenshot: "slide11-label-barcode-preview.png",
      fill: C.cardBg,
      titleColor: C.ink,
      textColor: C.grey,
    },
  ];
  const shotTop = top + 148;
  const shotMaxH = 200;
  for (const z of zones) {
    card(s, { left: z.x, top, width: cw, height: 356, fill: z.fill });
    if (z.fill === C.cardBg) rect(s, { left: z.x, top, width: cw, height: 6, fill: C.red, radius: 6000 });
    txt(s, z.title, { left: z.x + 26, top: top + 22, width: cw - 52, height: 28, size: 18, bold: true, color: z.titleColor, font: FONT.title });
    txt(s, z.text, { left: z.x + 26, top: top + 58, width: cw - 52, height: 72, size: 12.5, color: z.textColor, font: FONT.body, line: 1.14 });
    await screenshotImage(s, { left: z.x + 26, top: shotTop, maxWidth: cw - 52, maxHeight: shotMaxH, file: z.screenshot });
  }
  rect(s, { left: MARGIN, top: 618, width: W - 2 * MARGIN, height: 36, fill: "#FBE6EA", radius: 8000 });
  txt(s, "Ръчна грешка в SSID/PSK може да остави test-а да чака timeout - наблюдавано около 10 минути.", { left: MARGIN + 20, top: 618, width: W - 2 * MARGIN - 40, height: 36, size: 11.5, bold: true, color: C.redDeep, font: FONT.body, valign: "middle" });
  footer(s);
}

// ============================================================
// SLIDE 11 — Working and testing overview
// ============================================================
{
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "ВЕЧЕ РАБОТИ · ОБЗОР");
  titleBlock(s, "Работи, тества се, развива се", "Ясно разграничение между текущата оперативна помощ и следващите подобрения.");

  const top = 246, gap = 20, cw = (W - 2 * MARGIN - 2 * gap) / 3, ch = 320;
  const columns = [
    { label: "Работи", fill: "#E4F5EC", accent: C.greenOk, items: ["Serial validation и keyboard protection", "SAP/material filtering и quick buttons", "Clipboard autofill, labels и CAM насоки"] },
    { label: "Работи и се тества", fill: "#FBE6EA", accent: C.red, items: ["Dailywork panel и auto-selection", "Recycle/scrap counters и title badge", "Защита от duplicate processing"] },
    { label: "В разработка", fill: "#F4F5F7", accent: C.midGrey, items: ["Auto-update rollout", "KSTB5019/5020 contract cases", "Remove-from-contract workflow"] },
  ];
  columns.forEach((col, i) => {
    const x = MARGIN + i * (cw + gap);
    card(s, { left: x, top, width: cw, height: ch, fill: col.fill });
    rect(s, { left: x, top, width: cw, height: 6, fill: col.accent, radius: 6000 });
    txt(s, col.label, { left: x + 24, top: top + 24, width: cw - 48, height: 28, size: 18, bold: true, color: C.ink, font: FONT.title });
    bullets(s, col.items, { left: x + 24, top: top + 76, width: cw - 48, size: 13.2, color: C.grey, gap: 16, lineH: 52, dotColor: col.accent });
  });
  rect(s, { left: MARGIN, top: 586, width: W - 2 * MARGIN, height: 52, fill: "#FBE6EA", radius: 8000 });
  rect(s, { left: MARGIN, top: 586, width: 6, height: 52, fill: C.red, radius: 8000 });
  txt(s, "Dailywork и counters: Работи и се тества с конкретни колеги, но все още не е напълно стабилно.", { left: MARGIN + 24, top: 594, width: W - 2 * MARGIN - 48, height: 36, size: 13, bold: true, color: C.redDeep, font: FONT.body, valign: "middle" });
  footer(s);
}

improvementCardsSlide(
  "ВЕЧЕ РАБОТИ · ПОДОБРЕНИЯ",
  "Завършени подобрения",
  "От предишни итерации — вече работят в тестова среда.",
  [
    { t: "Коригирана обратна връзка за хардкоднати SAP ID", d: "Обработен е проблемът, докладван от колеги — хардкоднатите SAP ID вече се управляват коректно." },
    { t: "Защита при печат на defected устройства", d: "Defected устройства са спрени от печат на етикети, освен ако не са изрично селектирани." },
    { t: "Автоматична категория и модел — завършено", d: "Автоматичното задаване на категория и модел от разпределението вече е напълно готово." },
    { t: "Оптимизиран процес — една стъпка по-малко", d: "Премахната е една стъпка → OSS Assistant реагира с ~1.3 сек по-бързо от преди." },
  ],
);

await sectionDivider({
  num: "02",
  title: "Активна разработка",
  subtitle: "Подобрения в тестване — не 100% финални.",
  accent: C.red,
});

// ============================================================
// NEWS 08.07.2026 — summary
// ============================================================
{
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "АКТИВНА РАЗРАБОТКА · 08.07.2026");
  titleBlock(s, "По-сигурно рециклиране", "Кратко резюме на подобренията от 08.07.2026.");

  const top = 246, gap = 18, cw = (W - 2 * MARGIN - gap) / 2, ch = 108;
  const news = [
    { n: "01", t: "7-дневна защита", d: "Срещу повторно рециклиране / бракуване (беше 3 дни)." },
    { n: "02", t: "Изчакване на историята", d: "Преди «Продължи» — до ~1.5 сек, върху реални данни." },
    { n: "03", t: "Потвърждение при смяна", d: "Ръчна смяна на категория / устройство извън разпределението." },
    { n: "04", t: "Потвърждение при RESET", d: "За да не се изтрие по невнимание изборът от разпределението." },
    { n: "05", t: "MAC без «скачане»", d: "KSTB5019 / KSTB5020 — блокиране на Tab/Alt след barcode scan." },
    { n: "06", t: "Авто-ъпдейт", d: "Нов ъпдейт се разгръща автоматично на всеки компютър — спестява ~30–40 мин с флашка." },
  ];
  news.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = MARGIN + col * (cw + gap), y = top + row * (ch + 14);
    card(s, { left: x, top: y, width: cw, height: ch });
    rect(s, { left: x, top: y, width: 6, height: ch, fill: C.red, radius: 6000 });
    txt(s, it.n, { left: x + 20, top: y + 16, width: 36, height: 32, size: 24, bold: true, color: "#F0C4CC", font: FONT.title });
    txt(s, it.t, { left: x + 58, top: y + 18, width: cw - 82, height: 28, size: 15.5, bold: true, color: C.ink, font: FONT.title, valign: "middle" });
    txt(s, it.d, { left: x + 58, top: y + 48, width: cw - 82, height: 48, size: 12.5, color: C.midGrey, font: FONT.body, line: 1.12 });
  });

  const bY = top + 3 * (ch + 14) + 4;
  rect(s, { left: MARGIN, top: bY, width: W - 2 * MARGIN, height: 40, fill: "#FBE6EA", radius: 8000 });
  rect(s, { left: MARGIN, top: bY, width: 6, height: 40, fill: C.red, radius: 8000 });
  txt(s, "Всички предупреждения са затворими с един клик — не спират работата, само предотвратяват случайни грешки.", { left: MARGIN + 26, top: bY, width: W - 2 * MARGIN - 52, height: 40, size: 13, bold: true, color: C.redDeep, font: FONT.body, valign: "middle" });
  footer(s);
}

newsDualSlide(
  "АКТИВНА РАЗРАБОТКА · 08.07",
  "Защита срещу дубликати и надеждна история",
  "По-дълъг прозорец и по-умно изчакване преди «Продължи».",
  [
    {
      t: "7-дневна защита срещу дубликати",
      what: "Проверката на историята обхваща последните 7 дни (беше 3).",
      why: "Ако устройството вече е рециклирано или бракувано през седмицата, системата предупреждава.",
      effect: "По-малко двойно бракуване / рециклиране; кръстосана защита между двата процеса.",
    },
    {
      t: "Изчакване на историята преди «Продължи»",
      what: "При клик «Продължи», ако историята още се зарежда — изчаква до ~1.5 сек и продължава.",
      why: "Решението се взима върху реални данни, не преди историята да е готова.",
      effect: "В нормалния случай изчакване не се усеща; при timeout работата не се блокира.",
      note: "Локалната защита продължава да пази от дубликати.",
    },
  ],
);

newsDualSlide(
  "АКТИВНА РАЗРАБОТКА · 08.07",
  "Потвърждения при ръчна намеса",
  "Защита на избора от дневното разпределение — без блокиране на работата.",
  [
    {
      t: "Смяна на категория / устройство",
      what: "При ръчна смяна към различно от зададеното — прозорец «Смяна на категория» / «Смяна на устройство».",
      why: "За да не се смени случайно спрямо дневното разпределение.",
      effect: "Не блокира — «Да, смени» / «Отказ». Връщане към зададеното — без прозорец.",
      note: "Ако няма разпределение за деня (напр. «Друго») — няма предупреждения.",
    },
    {
      t: "Потвърждение при RESET",
      what: "RESET иска потвърждение («Нулиране на избора»), когато има зададено разпределение.",
      why: "За да не се изтрие по невнимание изборът от разпределението.",
      effect: "Искате да нулирате — потвърждавате; грешка — отказвате и изборът остава.",
    },
  ],
);

macScanSlide();
autoUpdateSlide();

// ============================================================
// ACTIVE DEV — mini summary
// ============================================================
{
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  header(s, "АКТИВНА РАЗРАБОТКА · ОБЗОР");
  titleBlock(s, "Обобщение на активната разработка", "Фокус върху сигурност — без утежняване на работата.");

  const top = 252, gap = 22, cw = (W - 2 * MARGIN - 2 * gap) / 3, ch = 200;
  const pillars = [
    { i: "🛡", t: "Сигурност", d: "По-дълга история, потвърждения и защита от случайни промени." },
    { i: "⚡", t: "Бързина", d: "Изчакване до ~1.5 сек — в нормалния случай изобщо не се усеща." },
    { i: "✓", t: "Свобода", d: "Предупрежденията се затварят с един клик — не спират рециклирането." },
  ];
  pillars.forEach((p, i) => {
    const x = MARGIN + i * (cw + gap);
    card(s, { left: x, top, width: cw, height: ch });
    roundIcon(s, x + 26, top + 28, 52, "#FBE6EA");
    txt(s, p.i, { left: x + 26, top: top + 30, width: 52, height: 50, size: 26, bold: true, color: C.red, font: FONT.title, align: "center", valign: "middle" });
    txt(s, p.t, { left: x + 26, top: top + 96, width: cw - 52, height: 40, size: 19, bold: true, color: C.ink, font: FONT.title });
    txt(s, p.d, { left: x + 26, top: top + 140, width: cw - 52, height: 48, size: 14, color: C.midGrey, font: FONT.body, line: 1.2 });
  });

  const bTop = top + ch + 22;
  rect(s, { left: MARGIN, top: bTop, width: W - 2 * MARGIN, height: 42, fill: C.red, radius: 8000 });
  txt(s, "Активна доработка · 08.07.2026 — тестване в ход, не представяме като 100% финален продукт.", { left: MARGIN + 24, top: bTop, width: W - 2 * MARGIN - 48, height: 42, size: 14.5, bold: true, color: C.white, font: FONT.title, valign: "middle" });
  footer(s);
}

await sectionDivider({
  num: "03",
  title: "План за развитие",
  subtitle: "Посока и идеи за бъдещи реализации в OSS.",
  accent: C.midGrey,
});

checklistSlide(
  "ПЛАН ЗА РАЗВИТИЕ",
  "Какво планираме напред",
  "Не финален продукт — показваме посоката на развитие.",
  [
    "Дневно разписание вътре в OSS + бутон за прилагане",
    "Автоматично разпознаване на потребителя",
    "Брояч за обработени устройства",
    "Dashboard / SharePoint конфигурация за нови устройства и изображения",
    "По-лесно добавяне на нови устройства",
    "Новият Netbox — доизчистване",
    "KSTB5019/5020 — план за «невидими» договори и освобождаване на устройството",
    "Бутон в OSS за премахване от договор — без ръчен вход в договорите",
  ],
  { icon: "→", iconBg: "#F4F5F7", iconColor: C.midGrey },
);

kstb5019ContractPlanSlide();
contractRemoveButtonPlanSlide();

// ============================================================
// FINAL — Summary
// ============================================================
{
  const s = presentation.slides.add();
  await plate(s, "slide-12.png");
  roundIcon(s, MARGIN, 70, 44, C.white);
  txt(s, "A1", { left: MARGIN, top: 76, width: 44, height: 32, size: 20, bold: true, color: C.red, font: FONT.title, align: "center", valign: "middle" });
  txt(s, "OSS Assistant", { left: MARGIN + 56, top: 80, width: 300, height: 28, size: 15, bold: true, color: C.white, font: FONT.title, valign: "middle" });

  txt(s, "Обобщение", { left: MARGIN, top: 216, width: 700, height: 44, size: 20, bold: true, color: "#FFFFFFCC", font: FONT.title });
  txt(s, "По-защитен, по-бърз и\nпо-малко ръчен процес.", { left: MARGIN, top: 256, width: 720, height: 130, size: 46, bold: true, color: C.white, font: FONT.title, line: 1.04 });

  const list = [
    "Три ясни секции: вече работи · активна разработка · план",
    "Не заменя OSS — допълва го там, където е ръчно и рисково",
    "Валидира, автоматизира SAP/SSID/етикети — по-малко грешки",
    "7-дневна история, потвърждения и MAC защита (в тестване)",
    "Предупрежденията не спират работата — само предотвратяват грешки",
    "Ясна посока: разписание, брояч, бутон за договор, 5019/5020, нови устройства",
  ];
  let y = 400;
  for (const it of list) {
    dot(s, MARGIN + 2, y + 6, 9, C.white);
    txt(s, it, { left: MARGIN + 24, top: y, width: 760, height: 28, size: 15, color: "#FFFFFFEC", font: FONT.body });
    y += 34;
  }
  txt(s, "Благодаря! Въпроси?", { left: W - MARGIN - 420, top: H - 74, width: 420, height: 34, size: 20, bold: true, color: C.white, font: FONT.title, align: "right" });
}

async function writeBlob(out, dest) {
  if (out && typeof out.save === "function") { await out.save(dest); return; }
  if (out && typeof out.bytes === "function") { fs.writeFileSync(dest, Buffer.from(await out.bytes())); return; }
  if (out && typeof out.arrayBuffer === "function") { fs.writeFileSync(dest, Buffer.from(await out.arrayBuffer())); return; }
  if (out instanceof Uint8Array || Buffer.isBuffer(out)) { fs.writeFileSync(dest, Buffer.from(out)); return; }
  if (out && out.data) { fs.writeFileSync(dest, Buffer.from(out.data)); return; }
  throw new Error("Unknown export return type: " + (out ? Object.keys(out).join(",") : String(out)));
}

// ---------- render previews ----------
for (let i = 0; i < presentation.slides.count; i++) {
  const slide = presentation.slides.getItem(i);
  try {
    const png = await presentation.export({ slide, format: "png", scale: 1 });
    await writeBlob(png, path.join(PREVIEW_DIR, `slide-${String(i + 1).padStart(2, "0")}.png`));
  } catch (e) {
    console.log(`PREVIEW FAIL slide ${i + 1}:`, e.message);
    throw e;
  }
}

// ---------- export ----------
const pptx = await PresentationFile.exportPptx(presentation);
const pptxBytes = pptx instanceof Uint8Array || Buffer.isBuffer(pptx)
  ? Buffer.from(pptx)
  : pptx && typeof pptx.bytes === "function"
    ? Buffer.from(await pptx.bytes())
    : pptx && typeof pptx.arrayBuffer === "function"
      ? Buffer.from(await pptx.arrayBuffer())
      : pptx && pptx.data
        ? Buffer.from(pptx.data)
        : null;

async function writePptx(dest) {
  if (pptxBytes) {
    fs.writeFileSync(dest, pptxBytes);
    return;
  }
  await writeBlob(pptx, dest);
}

const targets = [
  path.join(OUT_DIR, "output.pptx"),
  path.join(OUT_DIR, "output-v2.pptx"),
];

for (const dest of targets) {
  try {
    await writePptx(dest);
    console.log("WROTE", dest);
  } catch (e) {
    console.log("SKIP (locked):", dest, "-", e.message);
  }
}
console.log("DONE slides:", presentation.slides.count);
