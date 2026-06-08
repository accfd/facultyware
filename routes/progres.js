const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/pengelolaController');
const { isAuthenticated } = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/acl');

// Semua route dilindungi isAuthenticated + permission progres.view
router.use(isAuthenticated);

// GET /progres  — Riwayat penugasan yang sudah selesai (resolved)
router.get('/',
  checkPermission('progres.view'),
  ctrl.history
);

module.exports = router;
