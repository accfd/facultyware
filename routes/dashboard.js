const express          = require('express');
const router           = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { isAuthenticated }  = require('../middlewares/auth');
const { checkPermission }  = require('../middlewares/acl');

// GET /dashboard
router.get('/', isAuthenticated, checkPermission('dashboard.view'), dashboardController.index);

module.exports = router;
