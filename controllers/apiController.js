/**
 * controllers/apiController.js
 * REST API endpoint (GET only) untuk riwayat maintenance ruangan.
 */

const db = require('../lib/db');

// ── Helper: validasi integer positif ──────────────────────────────────────────
function posInt(val, fallback) {
  const n = parseInt(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/maintenance
// Query params: room_id, status, page (default 1), per_page (default 10)
// ══════════════════════════════════════════════════════════════════════════════
const getRiwayatMaintenance = async (req, res, next) => {
  try {
    const page     = posInt(req.query.page,     1);
    const perPage  = Math.min(posInt(req.query.per_page, 10), 100); // cap 100
    const offset   = (page - 1) * perPage;
    const roomId   = req.query.room_id;
    const status   = req.query.status;

    const VALID_STATUS = ['reported', 'in_progress', 'resolved'];

    // ── Build WHERE ──────────────────────────────────────────────────────────
    const whereClauses = [];
    const params       = [];

    if (roomId) {
      whereClauses.push('rmr.room_id = ?');
      params.push(roomId);
    }
    if (status && VALID_STATUS.includes(status)) {
      whereClauses.push('rmr.status = ?');
      params.push(status);
    }

    const where = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // ── Count total ──────────────────────────────────────────────────────────
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM room_maintenance_requests rmr
       JOIN rooms     r ON rmr.room_id     = r.id
       JOIN buildings b ON r.building_id   = b.id
       JOIN users u ON rmr.reported_by = u.id
       ${where}`,
      params
    );

    // ── Fetch data ───────────────────────────────────────────────────────────
    const [rows] = await db.query(
      `SELECT
         rmr.id,
         r.id    AS room_id,   r.name AS room_name,   r.code AS room_code,
         b.id    AS building_id, b.name AS building_name,
         u.id    AS rep_id,    u.name AS rep_name,
         rmr.issue_description,
         rmr.status,
         rmr.reported_at,
         rmr.resolved_at,
         (SELECT COUNT(*)
          FROM room_maintenance_request_log
          WHERE room_maintenance_request_id = rmr.id) AS log_count
       FROM room_maintenance_requests rmr
       JOIN rooms     r ON rmr.room_id     = r.id
       JOIN buildings b ON r.building_id   = b.id
       JOIN users u ON rmr.reported_by = u.id
       ${where}
       ORDER BY rmr.reported_at DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    // ── Format response ──────────────────────────────────────────────────────
    const data = rows.map(row => ({
      id:                row.id,
      room:              { id: row.room_id,     name: row.room_name,     code: row.room_code },
      building:          { id: row.building_id, name: row.building_name },
      reported_by:       { id: row.rep_id,      name: row.rep_name },
      issue_description: row.issue_description,
      status:            row.status,
      reported_at:       row.reported_at,
      resolved_at:       row.resolved_at,
      log_count:         Number(row.log_count),
    }));

    return res.json({
      success: true,
      data,
      pagination: {
        total:        Number(total),
        per_page:     perPage,
        current_page: page,
        total_pages:  Math.ceil(Number(total) / perPage) || 1,
      },
    });

  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/maintenance/:id
// Detail lengkap satu tiket + array log progres
// ══════════════════════════════════════════════════════════════════════════════
const getDetailMaintenance = async (req, res, next) => {
  try {
    const { id } = req.params;

    // ── Ambil data tiket ─────────────────────────────────────────────────────
    const [[tiket]] = await db.query(
      `SELECT
         rmr.id,
         r.id    AS room_id,      r.name  AS room_name,     r.code AS room_code,
         b.id    AS building_id,  b.name  AS building_name,
         u_rep.id  AS rep_id,     u_rep.name  AS rep_name,
         e_asgn.id AS asgn_id,    e_asgn.name AS asgn_name,
         rmr.issue_description,
         rmr.status,
         rmr.reported_at,
         rmr.resolved_at
       FROM room_maintenance_requests rmr
       JOIN rooms        r     ON rmr.room_id     = r.id
       JOIN buildings    b     ON r.building_id   = b.id
       JOIN users        u_rep ON rmr.reported_by = u_rep.id
       LEFT JOIN employees e_asgn ON rmr.employee_id  = e_asgn.id
       WHERE rmr.id = ?`,
      [id]
    );

    if (!tiket) {
      return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });
    }

    // ── Ambil log progres ────────────────────────────────────────────────────
    const [logRows] = await db.query(
      `SELECT
         rmrl.id,
         rmrl.log,
         e_log.name  AS logged_by,
         rmrl.logged_at,
         rmrl.description,
         rmrl.log_file,
         rmrl.status
       FROM room_maintenance_request_log rmrl
       LEFT JOIN employees e_log ON rmrl.logged_by = e_log.id
       WHERE rmrl.room_maintenance_request_id = ?
       ORDER BY rmrl.created_at ASC, rmrl.id ASC`,
      [id]
    );

    return res.json({
      success: true,
      data: {
        id:                tiket.id,
        room:              { id: tiket.room_id,     name: tiket.room_name,     code: tiket.room_code },
        building:          { id: tiket.building_id, name: tiket.building_name },
        reported_by:       { id: tiket.rep_id,      name: tiket.rep_name },
        assigned_to:       tiket.asgn_id ? { id: tiket.asgn_id, name: tiket.asgn_name } : null,
        issue_description: tiket.issue_description,
        status:            tiket.status,
        reported_at:       tiket.reported_at,
        resolved_at:       tiket.resolved_at,
        logs: logRows.map(l => ({
          id:          l.id,
          log:         l.log,
          logged_by:   l.logged_by || null,
          logged_at:   l.logged_at,
          description: l.description,
          log_file:    l.log_file,
          status:      l.status,
        })),
      },
    });

  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/maintenance/:id/status
// Response cepat: hanya status + log terakhir
// ══════════════════════════════════════════════════════════════════════════════
const getStatusTiket = async (req, res, next) => {
  try {
    const { id } = req.params;

    // ── Ambil status tiket ───────────────────────────────────────────────────
    const [[tiket]] = await db.query(
      `SELECT rmr.id, rmr.status, rmr.updated_at
       FROM room_maintenance_requests rmr
       WHERE rmr.id = ?`,
      [id]
    );

    if (!tiket) {
      return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });
    }

    // ── Hitung jumlah log ────────────────────────────────────────────────────
    const [[{ log_count }]] = await db.query(
      `SELECT COUNT(*) AS log_count
       FROM room_maintenance_request_log
       WHERE room_maintenance_request_id = ?`,
      [id]
    );

    // ── Ambil log terbaru ────────────────────────────────────────────────────
    const [[latestLog]] = await db.query(
      `SELECT rmrl.log, rmrl.logged_at, e.name AS logged_by
       FROM room_maintenance_request_log rmrl
       LEFT JOIN employees e ON rmrl.logged_by = e.id
       WHERE rmrl.room_maintenance_request_id = ?
       ORDER BY rmrl.created_at DESC, rmrl.id DESC
       LIMIT 1`,
      [id]
    );

    return res.json({
      success: true,
      data: {
        id:           tiket.id,
        status:       tiket.status,
        last_updated: tiket.updated_at,
        log_count:    Number(log_count),
        latest_log:   latestLog
          ? { log: latestLog.log, logged_at: latestLog.logged_at, logged_by: latestLog.logged_by || null }
          : null,
      },
    });

  } catch (err) {
    next(err);
  }
};

module.exports = { getRiwayatMaintenance, getDetailMaintenance, getStatusTiket };
