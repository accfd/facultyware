const db = require('../lib/db');

/**
 * Middleware ACL — cek permission berdasarkan model_has_roles
 * @param {string|string[]} requiredPermissions
 */
const checkPermission = (requiredPermissions) => {
  return async (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.redirect('/login');
    }

    const permissionsArray = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : [requiredPermissions];

    try {
      const [rows] = await db.query(`
        SELECT DISTINCT p.name
        FROM permissions p
        JOIN role_has_permissions rhp ON p.id = rhp.permission_id
        JOIN model_has_roles mhr ON rhp.role_id = mhr.role_id
        WHERE mhr.model_id = ?
          AND mhr.model_type = 'App\\\\Models\\\\User'
          AND p.name IN (?)
      `, [req.session.userId, permissionsArray]);

      if (rows.length > 0) {
        return next();
      }

      return res.status(403).render('error', {
        message: 'Akses Ditolak',
        error: { status: 403, stack: 'Anda tidak memiliki izin untuk mengakses halaman ini.' },
      });
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { checkPermission };
