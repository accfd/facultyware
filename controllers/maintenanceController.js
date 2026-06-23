const db = require('../lib/db');

const PAGE_SIZE = 10;

const STATUS_INFO = {
  reported:    { text: 'Dilaporkan', bg: '#fffbeb', color: '#a16207',  border: '#fde68a' },
  in_progress: { text: 'Diproses',   bg: '#eff6ff', color: '#1d4ed8',  border: '#bfdbfe' },
  resolved:    { text: 'Selesai',    bg: '#f0fdf4', color: '#15803d',  border: '#bbf7d0' },
};

// Helper: Ambil employee_id berdasarkan userId session
async function getEmployeeId(userId) {
  const [[emp]] = await db.query('SELECT id FROM employees WHERE id = ?', [userId]);
  return emp ? emp.id : null;
}

// Helper: Dapatkan ID log berikutnya
async function nextLogId() {
  const [[{ nid }]] = await db.query(
    'SELECT COALESCE(MAX(id), 0) + 1 AS nid FROM room_maintenance_request_log'
  );
  return nid;
}

// GET /maintenance - Daftar permohonan maintenance
const index = async (req, res, next) => {
  try {
    const pjEmployeeId = req.session.userId;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const whereParts = [
      'r.responsible_employee_id = ?',
    ];
    const params = [pjEmployeeId];

    if (status) {
      whereParts.push('rmr.status = ?');
      params.push(status);
    } else {
      whereParts.push("rmr.status IN ('in_progress', 'resolved')");
    }

    if (search) {
      whereParts.push('r.name LIKE ?');
      params.push(`%${search}%`);
    }
    const where = 'WHERE ' + whereParts.join(' AND ');

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       LEFT JOIN employees e_resp ON rmr.employee_id = e_resp.id
       ${where}`,
      params
    );

    const [maintenance] = await db.query(
      `SELECT rmr.id, r.name AS room_name, b.name AS building_name,
              rmr.issue_description, rmr.status, rmr.reported_at,
              e_resp.name AS pengelola_name,
              u.name AS reported_by_name,
              (SELECT COUNT(*) FROM room_maintenance_request_log
               WHERE room_maintenance_request_id = rmr.id) AS log_count,
              (SELECT status FROM room_maintenance_request_log
               WHERE room_maintenance_request_id = rmr.id
               ORDER BY created_at DESC, id DESC LIMIT 1) = 3 AS has_update
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN users u ON rmr.reported_by = u.id
       LEFT JOIN employees e_resp ON rmr.employee_id = e_resp.id
       ${where}
       ORDER BY has_update DESC, rmr.reported_at DESC
       LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, offset]
    );

    const totalPages = Math.ceil(total / PAGE_SIZE);

    const flash = req.session.flash || null;
    delete req.session.flash;

    const statusFilters = [
      { val: '',            label: 'Semua' },
      { val: 'in_progress', label: 'Diproses' },
      { val: 'resolved',    label: 'Selesai' },
    ];

    res.render('pj/maintenance/index', {
      title:       'Permohonan Maintenance',
      currentPath: '/pj/maintenance',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash,
      maintenance,
      STATUS_INFO,
      search,
      status,
      statusFilters,
      page,
      totalPages,
      total,
    });
  } catch (err) { next(err); }
};

// GET /maintenance/buat - Halaman form buat permohonan maintenance
const create = async (req, res, next) => {
  try {
    const pjEmployeeId = req.session.userId;

    // Ambil laporan berstatus 'reported' pada ruangan tanggung jawab PJ ini
    const [laporan] = await db.query(
      `SELECT rmr.id, r.name AS room_name, rmr.issue_description, rmr.reported_at,
              u.name AS reported_by_name
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN users u ON rmr.reported_by = u.id
       WHERE rmr.status = 'reported'
         AND r.responsible_employee_id = ?
       ORDER BY rmr.reported_at DESC`,
      [pjEmployeeId]
    );

    // Pre-select ID laporan jika ada di parameter query
    const selectedLaporanId = req.query.laporan_id || '';

    res.render('pj/maintenance/create', {
      title:            'Buat Permohonan Maintenance',
      currentPath:      '/pj/maintenance',
      userRole:         req.session.userRole,
      userName:         req.session.userName,
      flash:            null,
      laporan,
      errors:           null,
      old:              { laporan_id: selectedLaporanId },
    });
  } catch (err) { next(err); }
};

// POST /maintenance - Simpan permohonan (auto-assign pengelola)
const store = async (req, res, next) => {
  const pjEmployeeId = req.session.userId;
  const { laporan_id } = req.body;

  // Validasi input
  const errors = [];
  if (!laporan_id) errors.push({ field: 'laporan_id', msg: 'Laporan wajib dipilih.' });

  const renderForm = async (errs, old) => {
    const [laporan] = await db.query(
      `SELECT rmr.id, r.name AS room_name, rmr.issue_description, rmr.reported_at,
              u.name AS reported_by_name
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN users u ON rmr.reported_by = u.id
       WHERE rmr.status = 'reported'
         AND r.responsible_employee_id = ?
       ORDER BY rmr.reported_at DESC`,
      [pjEmployeeId]
    );
    return res.render('pj/maintenance/create', {
      title:       'Buat Permohonan Maintenance',
      currentPath: '/pj/maintenance',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash:       null,
      laporan,
      errors:      errs,
      old,
    });
  };

  if (errors.length > 0) return renderForm(errors, { laporan_id });

  try {
    // Cari pengelola aset pertama untuk auto-assign tugas
    const [[pengelola]] = await db.query(
      `SELECT e.id
       FROM employees e
       JOIN model_has_roles mhr ON e.id = mhr.model_id
       JOIN roles r ON mhr.role_id = r.id
       WHERE r.name = 'pengelola_aset'
         AND mhr.model_type = 'App\\\\Models\\\\User'
       LIMIT 1`
    );

    // 1. Update status laporan ke 'in_progress' dan pasang pengelola
    await db.query(
      `UPDATE room_maintenance_requests
       SET status = 'in_progress', employee_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [pengelola.id, laporan_id]
    );

    // 2. Catat log status permohonan dibuat (status = 1)
    const logId = await nextLogId();
    await db.query(
      `INSERT INTO room_maintenance_request_log
         (id, room_maintenance_request_id, log, logged_by, logged_at, status, created_at, updated_at)
       VALUES (?, ?, 'Permohonan maintenance dibuat', ?, NOW(), 1, NOW(), NOW())`,
      [logId, laporan_id, pjEmployeeId]
    );

    req.session.flash = { type: 'success', message: 'Permohonan maintenance berhasil dibuat.' };
    res.redirect('/pj/maintenance');
  } catch (err) { next(err); }
};

// GET /maintenance/:id - Detail permohonan & timeline perkembangan
const show = async (req, res, next) => {
  try {
    const pjEmployeeId = req.session.userId;
    const { id } = req.params;

    const [[laporan]] = await db.query(
      `SELECT rmr.id, rmr.issue_description, rmr.status, rmr.reported_at, rmr.resolved_at,
              r.name AS room_name, r.code AS room_code,
              b.name AS building_name,
              u_by.name AS reported_by_name,
              e_pengelola.name AS pengelola_name
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN users u_by ON rmr.reported_by = u_by.id
       LEFT JOIN employees e_pengelola ON rmr.employee_id = e_pengelola.id
       WHERE rmr.id = ? AND r.responsible_employee_id = ?`,
      [id, pjEmployeeId]
    );

    if (!laporan) {
      return res.status(404).render('error', {
        message: 'Permohonan tidak ditemukan',
        error:   { status: 404, stack: 'Permohonan maintenance dengan ID tersebut tidak ada atau bukan wewenang Anda.' },
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

    // Cek keberadaan progres (status = 3) untuk membolehkan aksi revisi/tutup
    const hasProgress = logs.some(lg => lg.status === 3);

    // Cek apakah log terakhir merupakan update progres dari pengelola
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
    const canAction = lastLog && lastLog.status === 3;

    const flash = req.session.flash || null;
    delete req.session.flash;

    res.render('pj/maintenance/show', {
      title:       `Maintenance #${String(id).padStart(5, '0')}`,
      currentPath: '/pj/maintenance',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash,
      laporan,
      logs,
      STATUS_INFO,
      hasProgress,
      canAction,
    });
  } catch (err) { next(err); }
};

// POST /maintenance/:id/close - Tutup permohonan (Selesai)
const close = async (req, res, next) => {
  const pjEmployeeId = req.session.userId;
  const { id } = req.params;
  try {
    // Validasi kepemilikan ruangan
    const [[laporan]] = await db.query(
      `SELECT rmr.id FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       WHERE rmr.id = ? AND r.responsible_employee_id = ?`,
      [id, pjEmployeeId]
    );
    if (!laporan) {
      req.session.flash = { type: 'error', message: 'Permohonan tidak ditemukan atau bukan wewenang Anda.' };
      return res.redirect('/pj/maintenance');
    }

    // Pastikan log terakhir berstatus progres (status = 3)
    const [latestLogs] = await db.query(
      `SELECT status FROM room_maintenance_request_log
       WHERE room_maintenance_request_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [id]
    );
    const lastLog = latestLogs.length > 0 ? latestLogs[0] : null;
    if (!lastLog || lastLog.status !== 3) {
      req.session.flash = {
        type: 'error',
        message: 'Permohonan tidak dapat ditutup. Menunggu update progres perbaikan baru dari pengelola.',
      };
      return res.redirect(`/pj/maintenance/${id}`);
    }

    // Update status laporan ke 'resolved'
    await db.query(
      `UPDATE room_maintenance_requests
       SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [id]
    );

    // Catat log penyelesaian permohonan (status = 5)
    const logId = await nextLogId();
    await db.query(
      `INSERT INTO room_maintenance_request_log
         (id, room_maintenance_request_id, log, logged_by, logged_at, status, created_at, updated_at)
       VALUES (?, ?, 'Permohonan dinyatakan selesai', ?, NOW(), 5, NOW(), NOW())`,
      [logId, id, pjEmployeeId]
    );

    req.session.flash = { type: 'success', message: 'Permohonan berhasil ditutup dan dinyatakan selesai.' };
    res.redirect('/pj/maintenance');
  } catch (err) { next(err); }
};

// POST /maintenance/:id/revisi - Minta revisi hasil pekerjaan
const revisi = async (req, res, next) => {
  const pjEmployeeId = req.session.userId;
  const { id }    = req.params;
  const { catatan } = req.body;

  if (!catatan || catatan.trim().length < 10) {
    req.session.flash = {
      type: 'error',
      message: 'Catatan revisi wajib diisi minimal 10 karakter.',
    };
    return res.redirect(`/pj/maintenance/${id}`);
  }

  try {
    // Pastikan log terakhir berstatus progres (status = 3) sebelum meminta revisi
    const [latestLogs] = await db.query(
      `SELECT status FROM room_maintenance_request_log
       WHERE room_maintenance_request_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [id]
    );
    const lastLog = latestLogs.length > 0 ? latestLogs[0] : null;
    if (!lastLog || lastLog.status !== 3) {
      req.session.flash = {
        type: 'error',
        message: 'Tidak dapat meminta revisi. Menunggu update progres perbaikan baru dari pengelola.',
      };
      return res.redirect(`/pj/maintenance/${id}`);
    }

    // Validasi kepemilikan ruangan
    const [[laporan]] = await db.query(
      `SELECT rmr.id FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       WHERE rmr.id = ? AND r.responsible_employee_id = ?`,
      [id, pjEmployeeId]
    );
    if (!laporan) {
      req.session.flash = { type: 'error', message: 'Permohonan tidak ditemukan atau bukan wewenang Anda.' };
      return res.redirect('/pj/maintenance');
    }

    // Catat log permintaan revisi (status = 4)
    const logId = await nextLogId();
    await db.query(
      `INSERT INTO room_maintenance_request_log
         (id, room_maintenance_request_id, log, logged_by, logged_at, description, status, created_at, updated_at)
       VALUES (?, ?, 'Revisi diminta', ?, NOW(), ?, 4, NOW(), NOW())`,
      [logId, id, pjEmployeeId, catatan.trim()]
    );

    req.session.flash = { type: 'success', message: 'Catatan revisi berhasil dikirim ke pengelola.' };
    res.redirect(`/pj/maintenance/${id}`);
  } catch (err) { next(err); }
};

module.exports = { index, create, store, show, close, revisi };
