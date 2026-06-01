const express              = require('express');
const router               = express.Router();
const laporanController    = require('../controllers/laporanController');
const pdfController        = require('../controllers/pdfController');
const { isAuthenticated }  = require('../middlewares/auth');
const { checkPermission }  = require('../middlewares/acl');
const { uploadLaporan }    = require('../middlewares/upload');

// Wrapper untuk tangkap error multer dan kembalikan ke form
function multerGuard(uploadFn) {
  return (req, res, next) => {
    uploadFn(req, res, (err) => {
      if (err) {
        req.multerError = err.message || 'File upload gagal.';
      }
      next();
    });
  };
}

router.get('/',
  isAuthenticated,
  checkPermission('laporan.view_own'),
  laporanController.index
);

router.get('/buat',
  isAuthenticated,
  checkPermission('laporan.create'),
  laporanController.create
);

router.post('/',
  isAuthenticated,
  checkPermission('laporan.create'),
  multerGuard(uploadLaporan.single('foto')),
  laporanController.store
);

// GET /laporan/:id/pdf — Download PDF bukti laporan (harus SEBELUM /:id)
router.get('/:id/pdf',
  isAuthenticated,
  checkPermission('laporan.view_own'),
  pdfController.buktiLaporan
);

router.get('/:id',
  isAuthenticated,
  checkPermission('laporan.view_own'),
  laporanController.show
);

module.exports = router;
