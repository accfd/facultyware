const bcrypt = require('bcryptjs');
const db = require('../lib/db');

const index = (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.redirect('/login');
};

const loginPage = (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'Login — Maintenance Ruangan FTI', errors: null, old: {} });
};

const login = async (req, res, next) => {
  const { email, password } = req.body;

  // Validasi input dasar
  if (!email || !password) {
    return res.render('auth/login', {
      title: 'Login — Maintenance Ruangan FTI',
      errors: ['Email dan password wajib diisi.'],
      old: { email },
    });
  }

  try {
    // 1. Cari user berdasarkan email
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.render('auth/login', {
        title: 'Login — Maintenance Ruangan FTI',
        errors: ['Email atau password salah.'],
        old: { email },
      });
    }

    const user = rows[0];

    // 2. Verifikasi password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render('auth/login', {
        title: 'Login — Maintenance Ruangan FTI',
        errors: ['Email atau password salah.'],
        old: { email },
      });
    }

    // 3. Ambil role dari model_has_roles JOIN roles
    const [roleRows] = await db.query(`
      SELECT r.name
      FROM roles r
      JOIN model_has_roles mhr ON r.id = mhr.role_id
      WHERE mhr.model_id = ? AND mhr.model_type = 'App\\\\Models\\\\User'
      LIMIT 1
    `, [user.id]);

    const userRole = roleRows.length > 0 ? roleRows[0].name : null;

    // 4. Simpan ke session
    req.session.userId    = user.id;
    req.session.userName  = user.name;
    req.session.userEmail = user.email;
    req.session.userRole  = userRole;

    // 5. Redirect berdasarkan role (via roleRedirect middleware)
    return res.redirect('/auth/role-redirect');

  } catch (err) {
    next(err);
  }
};

const logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.redirect('/login');
  });
};

module.exports = { index, loginPage, login, logout };
