var express = require('express');
var router  = express.Router();

const indexController     = require('../controllers/indexController');
const { isAuthenticated } = require('../middlewares/auth');
const { roleRedirect }    = require('../middlewares/roleRedirect');

// Root → redirect sesuai status login
router.get('/', indexController.index);

// Login
router.get('/login',  indexController.loginPage);
router.post('/login', indexController.login);

// Logout
router.get('/logout', indexController.logout);

// Role-redirect setelah login
router.get('/auth/role-redirect', isAuthenticated, roleRedirect);

module.exports = router;
