const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ── Pastikan direktori upload ada ──────────────────────────────────────────────
const uploadDirs = [
  path.join(__dirname, '../public/uploads/laporan'),
  path.join(__dirname, '../public/uploads/progres'),
  path.join(__dirname, '../public/generated'),
];
uploadDirs.forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

// ── Storage laporan ────────────────────────────────────────────────────────────
const laporanStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads/laporan')),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `laporan_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`);
  },
});

// ── Storage progres ────────────────────────────────────────────────────────────
const progresStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads/progres')),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `progres_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`);
  },
});

// ── File filter: hanya gambar ──────────────────────────────────────────────────
const imageFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png/;
  const extOk  = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowed.test(file.mimetype);
  if (extOk && mimeOk) return cb(null, true);
  cb(new Error('Hanya file gambar (JPG, PNG) yang diperbolehkan.'));
};

const uploadLaporan = multer({
  storage:    laporanStorage,
  fileFilter: imageFilter,
  limits:     { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const uploadProgres = multer({
  storage:    progresStorage,
  fileFilter: imageFilter,
  limits:     { fileSize: 5 * 1024 * 1024 },
});

module.exports = { uploadLaporan, uploadProgres };
