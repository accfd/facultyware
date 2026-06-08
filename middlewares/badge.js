/**
 * middlewares/badge.js
 * Menghitung badge notifikasi untuk setiap role dan menyimpannya ke res.locals.badgeCounts
 * - PJ: jumlah laporan berstatus 'reported' yang ada di ruangan tanggung jawabnya
 * - Pengelola: jumlah penugasan baru yang belum pernah ada update progres
 */
const db = require('../lib/db');

async function badgeMiddleware(req, res, next) {
  // Hanya hitung badge jika user sudah login
  if (!req.session || !req.session.userId) {
    res.locals.badgeCounts = null;
    return next();
  }

  try {
    const role = req.session.userRole;
    const userId = req.session.userId;
    const counts = { newLaporan: 0, newTugas: 0, newMaintenance: 0 };

    if (role === 'penanggung_jawab') {
      // Hitung laporan 'reported' di ruangan yang menjadi tanggung jawab PJ ini
      const [[{ n }]] = await db.query(
        `SELECT COUNT(*) AS n
         FROM room_maintenance_requests rmr
         JOIN rooms r ON rmr.room_id = r.id
         WHERE rmr.status = 'reported'
           AND r.responsible_employee_id = ?`,
        [userId]
      );
      counts.newLaporan = n || 0;

      // Hitung permohonan maintenance yang memiliki update baru (status log terakhir = 3)
      const [[{ n: nMaint }]] = await db.query(
        `SELECT COUNT(*) AS n
         FROM room_maintenance_requests rmr
         JOIN rooms r ON rmr.room_id = r.id
         WHERE r.responsible_employee_id = ?
           AND (
             SELECT status FROM room_maintenance_request_log
             WHERE room_maintenance_request_id = rmr.id
             ORDER BY created_at DESC, id DESC LIMIT 1
           ) = 3`,
        [userId]
      );
      counts.newMaintenance = nMaint || 0;

    } else if (role === 'pengelola_aset') {
      // Hitung penugasan in_progress yang belum ada log progres (status=3)
      const [[{ n }]] = await db.query(
        `SELECT COUNT(*) AS n
         FROM room_maintenance_requests rmr
         WHERE rmr.status = 'in_progress'
           AND rmr.employee_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM room_maintenance_request_log
             WHERE room_maintenance_request_id = rmr.id AND status = 3
           )`,
        [userId]
      );
      counts.newTugas = n || 0;
    }

    res.locals.badgeCounts = counts;
  } catch (err) {
    // Jangan crash karena badge, cukup set null
    res.locals.badgeCounts = null;
  }

  next();
}

module.exports = badgeMiddleware;
