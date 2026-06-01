require('dotenv').config();
var express    = require('express');
var path       = require('path');
var cookieParser = require('cookie-parser');
var logger     = require('morgan');
var session    = require('express-session');
var MySQLStore = require('express-mysql-session')(session);

var indexRouter     = require('./routes/index');
var dashboardRouter = require('./routes/dashboard');
var laporanRouter   = require('./routes/laporan');
const { notFoundHandler, errorHandler } = require('./middlewares/error');

var app = express();

// View engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Session store — tabel express_sessions (terpisah dari sessions Laravel)
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

// Routes
app.use('/',          indexRouter);
app.use('/dashboard', dashboardRouter);
app.use('/laporan',   laporanRouter);

// 404 & error handler
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
