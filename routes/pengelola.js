const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/pengelolaController');
const pdfCtrl    = require('../controllers/pdfController');
const { isAuthenticated } = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/acl');
const { uploadProgres }   = require('../middlewares/upload');

// Wrapper untuk tangkap error multer
function multerGuard(uploadFn) {
  return (req, res, next) => {
    uploadFn(req, res, (err) => {
      if (err) req.multerError = err.message || 'File upload gagal.';
      next();
    });
  };
}

// Semua route dilindungi isAuthenticated
router.use(isAuthenticated);

// GET  /penugasan          — Daftar penugasan aktif
router.get('/',
  checkPermission('progres.view'),
  ctrl.index
);

// GET  /penugasan/:id/pdf       — PDF Surat Permohonan Maintenance
router.get('/:id/pdf',
  checkPermission('progres.view'),
  pdfCtrl.permohonanMaintenance
);

// GET  /penugasan/:id/pdf-hasil — PDF Laporan Hasil Perbaikan
router.get('/:id/pdf-hasil',
  checkPermission('progres.view'),
  pdfCtrl.hasilPerbaikan
);

// GET  /penugasan/:id           — Detail penugasan
router.get('/:id',
  checkPermission('progres.view'),
  ctrl.show
);

// POST /penugasan/:id/progres   — Kirim update progres
router.post('/:id/progres',
  checkPermission('progres.create'),
  multerGuard(uploadProgres.single('foto')),
  ctrl.storeProgres
);

module.exports = router;
