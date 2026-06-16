const db = require('../lib/db');

const index = async (req, res, next) => {
  try {
    const userRole = req.session.userRole;
    const userId = req.session.userId;
    const currentFilter = req.query.filter === 'my' && userRole === 'penanggung_jawab' ? 'my' : 'all';

    let totalCountQuery = 'SELECT COUNT(*) as total FROM room_maintenance_requests';
    let statsQuery = 'SELECT status, COUNT(*) as total FROM room_maintenance_requests GROUP BY status';
    let maintenanceCountQuery = `SELECT COUNT(*) as total FROM room_maintenance_requests WHERE status IN ('reported', 'in_progress')`;
    let recentLaporanQuery = `
      SELECT
        rmr.id,
        r.name  AS room_name,
        u.name  AS reported_by_name,
        rmr.issue_description,
        rmr.status,
        rmr.reported_at
      FROM room_maintenance_requests rmr
      JOIN rooms     r ON rmr.room_id     = r.id
      JOIN users u ON rmr.reported_by = u.id
      ORDER BY rmr.reported_at DESC
      LIMIT 5
    `;

    let params = [];

    if (currentFilter === 'my') {
      totalCountQuery = `
        SELECT COUNT(*) as total 
        FROM room_maintenance_requests rmr
        JOIN rooms r ON rmr.room_id = r.id
        WHERE r.responsible_employee_id = ?
      `;
      statsQuery = `
        SELECT rmr.status, COUNT(*) as total 
        FROM room_maintenance_requests rmr
        JOIN rooms r ON rmr.room_id = r.id
        WHERE r.responsible_employee_id = ?
        GROUP BY rmr.status
      `;
      maintenanceCountQuery = `
        SELECT COUNT(*) as total 
        FROM room_maintenance_requests rmr
        JOIN rooms r ON rmr.room_id = r.id
        WHERE rmr.status IN ('reported', 'in_progress') AND r.responsible_employee_id = ?
      `;
      recentLaporanQuery = `
        SELECT
          rmr.id,
          r.name  AS room_name,
          u.name  AS reported_by_name,
          rmr.issue_description,
          rmr.status,
          rmr.reported_at
        FROM room_maintenance_requests rmr
        JOIN rooms     r ON rmr.room_id     = r.id
        JOIN users u ON rmr.reported_by = u.id
        WHERE r.responsible_employee_id = ?
        ORDER BY rmr.reported_at DESC
        LIMIT 5
      `;
      params = [userId];
    }

    // 1. Total semua laporan
    const [[{ total: totalCount }]] = await db.query(totalCountQuery, params);

    // 2. Per status
    const [stats] = await db.query(statsQuery, params);

    // 3. Jumlah maintenance aktif (status: open atau in_progress)
    const [[{ total: maintenanceCount }]] = await db.query(maintenanceCountQuery, params);

    // 4. Laporan terbaru — join rooms & employees
    const [recentLaporan] = await db.query(recentLaporanQuery, params);

    const flash = req.session.flash || null;
    delete req.session.flash;

    res.render('dashboard', {
      title: 'Dashboard',
      userName: req.session.userName,
      userRole,
      totalCount,
      stats,
      maintenanceCount,
      recentLaporan,
      currentFilter,
      flash,
    });

  } catch (err) {
    next(err);
  }
};

module.exports = { index };
