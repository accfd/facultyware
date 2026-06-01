const express    = require('express');
const router     = express.Router();
const ctrl       = require('../../controllers/maintenanceController');
const { isAuthenticated } = require('../../middlewares/auth');
const { checkPermission } = require('../../middlewares/acl');

// Semua route dilindungi isAuthenticated
router.use(isAuthenticated);

// GET  /maintenance          — Daftar permohonan aktif
router.get('/',
  checkPermission('maintenance.view'),
  ctrl.index
);

// GET  /maintenance/buat     — Form buat permohonan (harus SEBELUM /:id)
router.get('/buat',
  checkPermission('maintenance.create'),
  ctrl.create
);

// POST /maintenance          — Simpan permohonan baru
router.post('/',
  checkPermission('maintenance.create'),
  ctrl.store
);

// GET  /maintenance/:id      — Detail permohonan
router.get('/:id',
  checkPermission('maintenance.view'),
  ctrl.show
);

// POST /maintenance/:id/close  — Tutup permohonan
router.post('/:id/close',
  checkPermission('maintenance.close'),
  ctrl.close
);

// POST /maintenance/:id/revisi — Minta revisi
router.post('/:id/revisi',
  checkPermission('maintenance.revisi'),
  ctrl.revisi
);

module.exports = router;
