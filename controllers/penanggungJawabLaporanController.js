const db = require('../lib/db');

const PAGE_SIZE = 10;

const STATUS_INFO = {
  reported:    { text: 'Dilaporkan', bg: '#fffbeb', color: '#a16207',  border: '#fde68a' },
  in_progress: { text: 'Diproses',   bg: '#eff6ff', color: '#1d4ed8',  border: '#bfdbfe' },
  resolved:    { text: 'Selesai',    bg: '#f0fdf4', color: '#15803d',  border: '#bbf7d0' },
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /pj/laporan  — daftar laporan milik ruangan yang menjadi tanggung jawab PJ
// ══════════════════════════════════════════════════════════════════════════════
const index = async (req, res, next) => {
  try {
    const pjEmployeeId = req.session.userId;  // employees.id = users.id
    const search = req.query.search || '';
    const status = req.query.status || '';
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    // Build WHERE — filter ke ruangan yang menjadi tanggung jawab PJ ini
    const whereClauses = ['r.responsible_employee_id = ?'];
    const params       = [pjEmployeeId];

    if (search) {
      whereClauses.push('r.name LIKE ?');
      params.push(`%${search}%`);
    }
    if (status && ['reported', 'in_progress', 'resolved'].includes(status)) {
      whereClauses.push('rmr.status = ?');
      params.push(status);
    }

    const where = 'WHERE ' + whereClauses.join(' AND ');

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN users u ON rmr.reported_by = u.id
       ${where}`,
      params
    );

    const [laporan] = await db.query(
      `SELECT rmr.id, r.name AS room_name, b.name AS building_name,
              u.name AS reported_by_name, rmr.issue_description,
              rmr.status, rmr.reported_at
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN users u ON rmr.reported_by = u.id
       ${where}
       ORDER BY (rmr.status = 'reported') DESC, rmr.reported_at DESC
       LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, offset]
    );

    const totalPages = Math.ceil(total / PAGE_SIZE);

    const flash = req.session.flash || null;
    delete req.session.flash;

    res.render('pj/laporan/index', {
      title:       'Daftar Laporan',
      currentPath: '/pj/laporan',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash,
      laporan,
      STATUS_INFO,
      search,
      status,
      page,
      totalPages,
      total,
    });
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /pj/laporan/:id  — detail laporan (validasi akses ruangan PJ)
// ══════════════════════════════════════════════════════════════════════════════
const show = async (req, res, next) => {
  try {
    const pjEmployeeId = req.session.userId;
    const { id } = req.params;

    const [[laporan]] = await db.query(
      `SELECT rmr.id, rmr.issue_description, rmr.status, rmr.reported_at, rmr.resolved_at,
              r.name AS room_name, r.code AS room_code, r.id AS room_id,
              b.name AS building_name,
              u.name AS reported_by_name, u.email AS employee_number
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN users u ON rmr.reported_by = u.id
       WHERE rmr.id = ? AND r.responsible_employee_id = ?`,
      [id, pjEmployeeId]
    );

    if (!laporan) {
      return res.status(404).render('error', {
        message: 'Laporan tidak ditemukan',
        error:   { status: 404, stack: 'Laporan dengan ID tersebut tidak ada atau bukan wewenang Anda.' },
      });
    }

    const [logs] = await db.query(
      `SELECT rmrl.*, e.name AS logged_by_name, ev.name AS verified_by_name
       FROM room_maintenance_request_log rmrl
       LEFT JOIN employees e  ON rmrl.logged_by   = e.id
       LEFT JOIN employees ev ON rmrl.verified_by = ev.id
       WHERE rmrl.room_maintenance_request_id = ?
       ORDER BY rmrl.created_at ASC`,
      [id]
    );

    const flash = req.session.flash || null;
    delete req.session.flash;

    res.render('pj/laporan/show', {
      title:       `Laporan #${String(id).padStart(5, '0')}`,
      currentPath: '/pj/laporan',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash,
      laporan,
      logs,
      STATUS_INFO,
    });
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /pj/laporan/:id/edit  — form edit laporan (validasi akses)
// ══════════════════════════════════════════════════════════════════════════════
const edit = async (req, res, next) => {
  try {
    const pjEmployeeId = req.session.userId;
    const { id } = req.params;

    const [[laporan]] = await db.query(
      `SELECT rmr.id, rmr.issue_description, rmr.status,
              r.id AS room_id, r.name AS room_name, b.name AS building_name
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       WHERE rmr.id = ? AND r.responsible_employee_id = ?`,
      [id, pjEmployeeId]
    );

    if (!laporan) {
      return res.status(404).render('error', {
        message: 'Laporan tidak ditemukan',
        error:   { status: 404, stack: 'Laporan dengan ID tersebut tidak ada atau bukan wewenang Anda.' },
      });
    }

    if (laporan.status !== 'reported') {
      req.session.flash = { type: 'error', message: 'Laporan yang telah diproses tidak dapat diedit.' };
      return res.redirect(`/pj/laporan/${id}`);
    }

    // Hanya tampilkan ruangan yang menjadi tanggung jawab PJ ini
    const [rooms] = await db.query(
      `SELECT r.id, r.name, r.code, b.name AS building_name
       FROM rooms r
       JOIN buildings b ON r.building_id = b.id
       WHERE r.responsible_employee_id = ?
       ORDER BY b.name, r.name`,
      [pjEmployeeId]
    );

    res.render('pj/laporan/edit', {
      title:       `Edit Laporan #${String(id).padStart(5, '0')}`,
      currentPath: '/pj/laporan',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash:       null,
      laporan,
      rooms,
      errors:      null,
      old:         { room_id: laporan.room_id, issue_description: laporan.issue_description },
    });
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// POST /pj/laporan/:id  — simpan perubahan laporan
// ══════════════════════════════════════════════════════════════════════════════
const update = async (req, res, next) => {
  const pjEmployeeId = req.session.userId;
  const { id } = req.params;
  const { room_id, issue_description } = req.body;

  // Validasi
  const errors = [];
  if (!room_id) errors.push({ field: 'room_id', msg: 'Ruangan wajib dipilih.' });
  if (!issue_description || issue_description.trim().length < 20)
    errors.push({ field: 'issue_description', msg: 'Deskripsi kerusakan minimal 20 karakter.' });
  if (issue_description && issue_description.trim().length > 1000)
    errors.push({ field: 'issue_description', msg: 'Deskripsi kerusakan maksimal 1000 karakter.' });

  if (errors.length > 0) {
    try {
      const [[laporan]] = await db.query(
        `SELECT rmr.id, rmr.issue_description, rmr.status,
                r.id AS room_id, r.name AS room_name, b.name AS building_name
         FROM room_maintenance_requests rmr
         JOIN rooms r ON rmr.room_id = r.id
         JOIN buildings b ON r.building_id = b.id
         WHERE rmr.id = ? AND r.responsible_employee_id = ?`,
        [id, pjEmployeeId]
      );
      const [rooms] = await db.query(
        `SELECT r.id, r.name, r.code, b.name AS building_name
         FROM rooms r JOIN buildings b ON r.building_id = b.id
         WHERE r.responsible_employee_id = ?
         ORDER BY b.name, r.name`,
        [pjEmployeeId]
      );
      return res.render('pj/laporan/edit', {
        title:       `Edit Laporan #${String(id).padStart(5, '0')}`,
        currentPath: '/pj/laporan',
        userRole:    req.session.userRole,
        userName:    req.session.userName,
        flash:       null,
        laporan,
        rooms,
        errors,
        old: { room_id, issue_description },
      });
    } catch (e) { return next(e); }
  }

  try {
    const [[currentLaporan]] = await db.query(
      'SELECT status FROM room_maintenance_requests WHERE id = ?',
      [id]
    );
    if (currentLaporan && currentLaporan.status !== 'reported') {
      req.session.flash = { type: 'error', message: 'Laporan yang telah diproses tidak dapat diedit.' };
      return res.redirect(`/pj/laporan/${id}`);
    }

    // Validasi room_id ada dan menjadi tanggung jawab PJ
    const [[room]] = await db.query(
      'SELECT id FROM rooms WHERE id = ? AND responsible_employee_id = ?',
      [room_id, pjEmployeeId]
    );
    if (!room) {
      return res.redirect(`/pj/laporan/${id}/edit`);
    }

    await db.query(
      `UPDATE room_maintenance_requests
       SET issue_description = ?, room_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [issue_description.trim(), room_id, id]
    );

    req.session.flash = { type: 'success', message: 'Laporan berhasil diperbarui.' };
    res.redirect(`/pj/laporan/${id}`);
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /pj/laporan/:id  — hapus laporan
// ══════════════════════════════════════════════════════════════════════════════
const destroy = async (req, res, next) => {
  const pjEmployeeId = req.session.userId;
  const { id } = req.params;
  try {
    // Validasi kepemilikan dan status
    const [[laporan]] = await db.query(
      `SELECT rmr.id, rmr.status FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       WHERE rmr.id = ? AND r.responsible_employee_id = ?`,
      [id, pjEmployeeId]
    );
    if (!laporan) {
      req.session.flash = { type: 'error', message: 'Laporan tidak ditemukan atau bukan wewenang Anda.' };
      return res.redirect('/pj/laporan');
    }
    if (laporan.status !== 'reported') {
      req.session.flash = { type: 'error', message: 'Laporan yang telah diproses tidak dapat dihapus.' };
      return res.redirect(`/pj/laporan/${id}`);
    }

    // Hapus log dulu
    await db.query(
      'DELETE FROM room_maintenance_request_log WHERE room_maintenance_request_id = ?',
      [id]
    );
    // Hapus laporan
    await db.query(
      'DELETE FROM room_maintenance_requests WHERE id = ?',
      [id]
    );

    req.session.flash = { type: 'success', message: 'Laporan berhasil dihapus.' };
    res.redirect('/pj/laporan');
  } catch (err) { next(err); }
};

module.exports = { index, show, edit, update, destroy };
