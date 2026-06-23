require('dotenv').config();
var express        = require('express');
var path           = require('path');
var cookieParser   = require('cookie-parser');
var logger         = require('morgan');
var session        = require('express-session');
var MySQLStore     = require('express-mysql-session')(session);
var methodOverride = require('method-override');

var indexRouter         = require('./routes/index');
var dashboardRouter     = require('./routes/dashboard');
var laporanRouter       = require('./routes/laporan');
var pjLaporanRouter     = require('./routes/pj/laporan');
var maintenanceRouter   = require('./routes/pj/maintenance');
var pengelolaRouter     = require('./routes/pengelola');
var progresRouter       = require('./routes/progres');
var apiRouter           = require('./routes/api');
const { notFoundHandler, errorHandler } = require('./middlewares/error');
const badgeMiddleware   = require('./middlewares/badge');

var app = express();

// Konfigurasi View Engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurasi Session Store MySQL
const sessionStore = new MySQLStore({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  schema: {
    tableName: 'express_sessions',
    columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' },
  },
  createDatabaseTable:     true,
  clearExpired:            true,
  checkExpirationInterval: 900000,
});

app.use(session({
  key:               'fw_session',
  secret:            process.env.SESSION_SECRET || 'fti_secret_2025',
  store:             sessionStore,
  resave:            false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24, httpOnly: true },
}));

// Middleware: Simpan session ke DB sebelum redirect (hindari bug flash message)
app.use((req, res, next) => {
  const originalRedirect = res.redirect;
  res.redirect = function (...args) {
    if (req.session && typeof req.session.save === 'function') {
      req.session.save((err) => {
        if (err) console.error('Session save error during redirect:', err);
        originalRedirect.apply(res, args);
      });
    } else {
      originalRedirect.apply(res, args);
    }
  };
  next();
});

// Middleware Global Badge
app.use(badgeMiddleware);

// Middleware: Nonaktifkan cache HTML (hindari flash message berulang saat back/forward)
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Registrasi Route
app.use('/',            indexRouter);
app.use('/pj/dashboard',   dashboardRouter);
app.use('/laporan',     laporanRouter);
app.use('/pj/laporan',  pjLaporanRouter);
app.use('/pj/maintenance', maintenanceRouter);
app.use('/penugasan',   pengelolaRouter);
app.use('/progres',     progresRouter);
app.use('/api/v1',      apiRouter);

// Handler Error 404 & Global Error
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

module.exports = app;
