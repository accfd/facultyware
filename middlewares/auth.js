// Middleware: cek apakah user sudah login
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
};

module.exports = { isAuthenticated };
