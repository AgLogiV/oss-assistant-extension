const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();

app.use(cors({ origin: true, methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "x-admin-token"] }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || "RC112900").trim();

if (!ADMIN_TOKEN) {
  // Fail fast: admin protection relies on this token.
  // eslint-disable-next-line no-console
  console.warn("[dashboard] ADMIN_TOKEN is empty. Set env ADMIN_TOKEN before starting in production.");
}

const DATA_DIR = path.join(__dirname, "data");
const MODELS_FILE = path.join(DATA_DIR, "models.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOADS_DIR));

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(MODELS_FILE)) fs.writeFileSync(MODELS_FILE, JSON.stringify({ version: 1, models: [] }, null, 2));
}

function loadModels() {
  ensureDataFile();
  const raw = fs.readFileSync(MODELS_FILE, "utf8");
  const parsed = JSON.parse(raw);
  const models = Array.isArray(parsed.models) ? parsed.models : [];

  const normalizeCategory = (c) => {
    const rawCat = String(c || "").trim().toLowerCase();
    if (!rawCat) return "other";
    if (rawCat === "internet" || rawCat === "интернет") return "internet";
    if (rawCat === "tv" || rawCat === "television" || rawCat === "телевизия" || rawCat === "телевизия ") return "tv";
    if (rawCat === "other" || rawCat === "others" || rawCat === "други") return "other";
    return "other";
  };

  return models
    .map(m => ({
      id: String(m.id || "").replace(/\D+/g, ""),
      name: String(m.name || "").trim(),
      image: String(m.image || "").trim(),
      category: normalizeCategory(m.category)
    }))
    .filter(m => m.id);
}

function saveModels(models) {
  ensureDataFile();
  const payload = { version: 1, models };
  fs.writeFileSync(MODELS_FILE, JSON.stringify(payload, null, 2), "utf8");
}

function authAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(500).json({ ok: false, error: "ADMIN_TOKEN is not configured on the server" });

  const token = req.get("x-admin-token") || req.get("authorization") || "";
  // Support either raw token header or "Bearer <token>".
  const normalized = token.toLowerCase().startsWith("bearer ")
    ? token.slice(7).trim()
    : token.trim();
  if (normalized !== ADMIN_TOKEN) return res.status(401).json({ ok: false, error: "Unauthorized" });

  next();
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Token check for the login page.
app.post("/api/auth/check", authAdmin, (req, res) => {
  res.json({ ok: true });
});

// Public (read-only): extension will later call this.
app.get("/api/models", (req, res) => {
  res.json({ ok: true, models: loadModels() });
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const id = String(req.body?.id || "").replace(/\D+/g, "");
      const ext = path.extname(file.originalname || "").toLowerCase() || ".webp";
      const safeExt = [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".webp";
      cb(null, `${id}${safeExt}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const ok = /^image\//.test(file.mimetype || "");
    cb(ok ? null : new Error("Only image uploads are allowed"), ok);
  }
});

// Admin-only mutations.
app.post("/api/models/add", authAdmin, (req, res) => {
  const { id, name, category } = req.body || {};
  const cleanId = String(id || "").replace(/\D+/g, "");
  const cleanName = String(name || "").trim();
  const cleanCategoryRaw = String(category || "").trim().toLowerCase();
  const cleanCategory = (cleanCategoryRaw === "internet" || cleanCategoryRaw === "tv" || cleanCategoryRaw === "other")
    ? cleanCategoryRaw
    : "";
  if (!cleanId) return res.status(400).json({ ok: false, error: "Missing id" });

  const models = loadModels();
  const idx = models.findIndex(m => m.id === cleanId);
  const next = idx >= 0
    ? models.map(m => (m.id === cleanId
      ? { ...m, id: cleanId, name: cleanName || m.name, category: cleanCategory || m.category || "other" }
      : m))
    : models.concat({ id: cleanId, name: cleanName, image: "", category: cleanCategory || "other" });

  saveModels(next);
  res.json({ ok: true, models: next });
});

app.post("/api/models/setCategory", authAdmin, (req, res) => {
  const { id, category } = req.body || {};
  const cleanId = String(id || "").replace(/\D+/g, "");
  const cleanCategoryRaw = String(category || "").trim().toLowerCase();
  const cleanCategory = (cleanCategoryRaw === "internet" || cleanCategoryRaw === "tv" || cleanCategoryRaw === "other")
    ? cleanCategoryRaw
    : "";
  if (!cleanId) return res.status(400).json({ ok: false, error: "Missing id" });
  if (!cleanCategory) return res.status(400).json({ ok: false, error: "Invalid category" });

  const models = loadModels();
  const next = models.map(m => (m.id === cleanId ? { ...m, category: cleanCategory } : m));
  saveModels(next);
  res.json({ ok: true, models: next });
});

app.post("/api/models/setImageUrl", authAdmin, (req, res) => {
  const { id, imageUrl } = req.body || {};
  const cleanId = String(id || "").replace(/\D+/g, "");
  const url = String(imageUrl || "").trim();
  if (!cleanId) return res.status(400).json({ ok: false, error: "Missing id" });

  const models = loadModels();
  const next = models.map(m => (m.id === cleanId ? { ...m, image: url } : m));
  saveModels(next);
  res.json({ ok: true, models: next });
});

app.post("/api/models/uploadImage", authAdmin, upload.single("image"), (req, res) => {
  const cleanId = String(req.body?.id || "").replace(/\D+/g, "");
  if (!cleanId) return res.status(400).json({ ok: false, error: "Missing id" });
  if (!req.file) return res.status(400).json({ ok: false, error: "Missing file" });

  const models = loadModels();
  const rel = `/uploads/${req.file.filename}`;
  const next = models.map(m => (m.id === cleanId ? { ...m, image: rel } : m));
  saveModels(next);
  res.json({ ok: true, models: next });
});

app.post("/api/models/remove", authAdmin, (req, res) => {
  const { id } = req.body || {};
  const cleanId = String(id || "").replace(/\D+/g, "");
  if (!cleanId) return res.status(400).json({ ok: false, error: "Missing id" });

  const models = loadModels();
  const next = models.filter(m => m.id !== cleanId);
  saveModels(next);
  res.json({ ok: true, models: next });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[dashboard] Listening on port ${PORT}`);
});

