const express    = require('express');
const router     = express.Router();
const ctrl       = require('../../controllers/penanggungJawabLaporanController');
const pdfCtrl    = require('../../controllers/pdfController');
const { isAuthenticated } = require('../../middlewares/auth');
const { checkPermission } = require('../../middlewares/acl');

// Semua route dilindungi isAuthenticated
router.use(isAuthenticated);

// GET  /pj/laporan              — Daftar semua laporan
router.get('/',
  checkPermission('laporan.view_all'),
  ctrl.index
);

// GET  /pj/laporan/pdf-rekap    — Rekap PDF bulanan (SEBELUM /:id)
router.get('/pdf-rekap',
  checkPermission('dashboard.view'),
  pdfCtrl.rekapBulanan
);

// GET  /pj/laporan/:id/pdf  — Download PDF laporan (SEBELUM /:id/edit)
router.get('/:id/pdf',
  checkPermission('laporan.view_all'),
  pdfCtrl.buktiLaporanPJ
);

// GET  /pj/laporan/:id/edit — Form edit laporan
router.get('/:id/edit',
  checkPermission('laporan.update'),
  ctrl.edit
);

// GET  /pj/laporan/:id      — Detail laporan
router.get('/:id',
  checkPermission('laporan.view_all'),
  ctrl.show
);

// POST /pj/laporan/:id      — Simpan perubahan laporan
router.post('/:id',
  checkPermission('laporan.update'),
  ctrl.update
);

// DELETE /pj/laporan/:id    — Hapus laporan (via method-override)
router.delete('/:id',
  checkPermission('laporan.delete'),
  ctrl.destroy
);

module.exports = router;
