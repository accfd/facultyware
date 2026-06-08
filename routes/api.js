/**
 * routes/api.js
 * REST API endpoint (GET only) untuk riwayat maintenance ruangan.
 * Autentikasi: API key via header X-API-KEY
 */

const router        = require('express').Router();
const { apiAuth }   = require('../middlewares/apiAuth');
const apiController = require('../controllers/apiController');

// GET /api/v1/maintenance           — daftar riwayat dengan pagination & filter
// GET /api/v1/maintenance/:id/status — status cepat satu tiket  (urutan penting: sebelum /:id)
// GET /api/v1/maintenance/:id       — detail lengkap satu tiket

router.get('/maintenance',             apiAuth, apiController.getRiwayatMaintenance);
router.get('/maintenance/:id/status',  apiAuth, apiController.getStatusTiket);
router.get('/maintenance/:id',         apiAuth, apiController.getDetailMaintenance);

module.exports = router;
