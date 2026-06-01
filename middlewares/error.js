var createError = require('http-errors');

// catch 404 and forward to error handler
const notFoundHandler = (req, res, next) => {
  next(createError(404));
};

// error handler
const errorHandler = (err, req, res, next) => {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Terjadi kesalahan yang tidak terduga.';

  // Untuk request API/AJAX, kembalikan JSON
  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.status(status).json({ error: message });
  }

  res.status(status);
  res.render('error', {
    message,
    error: { status, stack: req.app.get('env') === 'development' ? err.stack : '' },
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
