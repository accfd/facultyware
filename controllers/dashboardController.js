const db = require('../lib/db');

const index = async (req, res, next) => {
  try {
    // 1. Total semua laporan
    const [[{ total: totalCount }]] = await db.query(
      'SELECT COUNT(*) as total FROM room_maintenance_requests'
    );

    // 2. Per status
    const [stats] = await db.query(
      'SELECT status, COUNT(*) as total FROM room_maintenance_requests GROUP BY status'
    );

    // 3. Jumlah maintenance aktif (status: open atau in_progress)
    const [[{ total: maintenanceCount }]] = await db.query(
      `SELECT COUNT(*) as total FROM room_maintenance_requests
       WHERE status IN ('reported', 'in_progress')`
    );

    // 4. Laporan terbaru — join rooms & employees
    const [recentLaporan] = await db.query(`
      SELECT
        rmr.id,
        r.name  AS room_name,
        e.name  AS reported_by_name,
        rmr.issue_description,
        rmr.status,
        rmr.reported_at
      FROM room_maintenance_requests rmr
      JOIN rooms     r ON rmr.room_id     = r.id
      JOIN employees e ON rmr.reported_by = e.id
      ORDER BY rmr.reported_at DESC
      LIMIT 5
    `);

    res.render('dashboard', {
      title:          'Dashboard',
      userName:       req.session.userName,
      userRole:       req.session.userRole,
      totalCount,
      stats,
      maintenanceCount,
      recentLaporan,
      flash:          req.session.flash || null,
    });

    // Hapus flash setelah dirender
    delete req.session.flash;

  } catch (err) {
    next(err);
  }
};

module.exports = { index };
