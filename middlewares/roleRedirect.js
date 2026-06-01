/**
 * Middleware: redirect user ke halaman sesuai rolenya setelah login
 */
const roleRedirect = (req, res) => {
  const role = req.session.userRole;

  const destinations = {
    pengguna:         '/laporan',
    penanggung_jawab: '/dashboard',
    pengelola_aset:   '/penugasan',
  };

  const destination = destinations[role] || '/login';
  res.redirect(destination);
};

module.exports = { roleRedirect };
