const db = require('../lib/db');

const PAGE_SIZE = 10;

const STATUS_INFO = {
  reported:    { text: 'Dilaporkan', bg: '#fffbeb', color: '#a16207',  border: '#fde68a' },
  in_progress: { text: 'Diproses',   bg: '#eff6ff', color: '#1d4ed8',  border: '#bfdbfe' },
  resolved:    { text: 'Selesai',    bg: '#f0fdf4', color: '#15803d',  border: '#bbf7d0' },
};

// ── Helper: ambil employee_id dari userId session ──────────────────────────────
async function getEmployeeId(userId) {
  const [[emp]] = await db.query('SELECT id FROM employees WHERE id = ?', [userId]);
  return emp ? emp.id : null;
}

// ── Helper: generate id log baru (MAX+1) ──────────────────────────────────────
async function nextLogId() {
  const [[{ nid }]] = await db.query(
    'SELECT COALESCE(MAX(id), 0) + 1 AS nid FROM room_maintenance_request_log'
  );
  return nid;
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /maintenance  — daftar permohonan aktif
// ══════════════════════════════════════════════════════════════════════════════
const index = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const whereParts = ["rmr.status IN ('in_progress', 'reported')"];
    const params     = [];

    if (search) {
      whereParts.push('r.name LIKE ?');
      params.push(`%${search}%`);
    }
    const where = 'WHERE ' + whereParts.join(' AND ');

    // Total — LEFT JOIN employee agar tidak gagal jika employee_id NULL
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
              (SELECT COUNT(*) FROM room_maintenance_request_log
               WHERE room_maintenance_request_id = rmr.id) AS log_count
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       LEFT JOIN employees e_resp ON rmr.employee_id = e_resp.id
       ${where}
       ORDER BY rmr.reported_at DESC
       LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, offset]
    );

    const totalPages = Math.ceil(total / PAGE_SIZE);

    res.render('pj/maintenance/index', {
      title:       'Permohonan Maintenance',
      currentPath: '/maintenance',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash:       req.session.flash || null,
      maintenance,
      STATUS_INFO,
      search,
      page,
      totalPages,
      total,
    });
    delete req.session.flash;
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /maintenance/buat  — form buat permohonan
// ══════════════════════════════════════════════════════════════════════════════
const create = async (req, res, next) => {
  try {
    // Laporan yang statusnya masih reported
    const [laporan] = await db.query(
      `SELECT rmr.id, r.name AS room_name, rmr.issue_description, rmr.reported_at
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       WHERE rmr.status = 'reported'
       ORDER BY rmr.reported_at DESC`
    );

    // Pengelola aset
    const [pengelola] = await db.query(
      `SELECT e.id, e.name
       FROM employees e
       JOIN model_has_roles mhr ON e.id = mhr.model_id
       JOIN roles r ON mhr.role_id = r.id
       WHERE r.name = 'pengelola_aset'
         AND mhr.model_type = 'App\\\\Models\\\\User'`
    );

    // Pre-select laporan jika ada ?laporan_id dari tombol di halaman detail laporan
    const selectedLaporanId = req.query.laporan_id || '';

    res.render('pj/maintenance/create', {
      title:            'Buat Permohonan Maintenance',
      currentPath:      '/maintenance',
      userRole:         req.session.userRole,
      userName:         req.session.userName,
      flash:            null,
      laporan,
      pengelola,
      errors:           null,
      old:              { laporan_id: selectedLaporanId, pengelola_id: '' },
    });
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// POST /maintenance  — simpan permohonan
// ══════════════════════════════════════════════════════════════════════════════
const store = async (req, res, next) => {
  const { laporan_id, pengelola_id } = req.body;

  // Validasi
  const errors = [];
  if (!laporan_id)   errors.push({ field: 'laporan_id',   msg: 'Laporan wajib dipilih.' });
  if (!pengelola_id) errors.push({ field: 'pengelola_id', msg: 'Pengelola aset wajib dipilih.' });

  const renderForm = async (errs, old) => {
    const [laporan]   = await db.query(
      `SELECT rmr.id, r.name AS room_name, rmr.issue_description, rmr.reported_at
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       WHERE rmr.status = 'reported'
       ORDER BY rmr.reported_at DESC`
    );
    const [pengelola] = await db.query(
      `SELECT e.id, e.name
       FROM employees e
       JOIN model_has_roles mhr ON e.id = mhr.model_id
       JOIN roles r ON mhr.role_id = r.id
       WHERE r.name = 'pengelola_aset'
         AND mhr.model_type = 'App\\\\Models\\\\User'`
    );
    return res.render('pj/maintenance/create', {
      title:       'Buat Permohonan Maintenance',
      currentPath: '/maintenance',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash:       null,
      laporan,
      pengelola,
      errors:      errs,
      old,
    });
  };

  if (errors.length > 0) return renderForm(errors, { laporan_id, pengelola_id });

  try {
    // Cek laporan masih reported
    const [[laporan]] = await db.query(
      'SELECT id FROM room_maintenance_requests WHERE id = ? AND status = ?',
      [laporan_id, 'reported']
    );
    if (!laporan) {
      return renderForm(
        [{ field: 'laporan_id', msg: 'Laporan tidak ditemukan atau sudah diproses.' }],
        { laporan_id, pengelola_id }
      );
    }

    // Ambil employee_id PJ dari session
    const pjEmployeeId = await getEmployeeId(req.session.userId);

    // 1. Update status laporan → in_progress, assign pengelola
    await db.query(
      `UPDATE room_maintenance_requests
       SET status = 'in_progress', employee_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [pengelola_id, laporan_id]
    );

    // 2. Insert log
    const logId = await nextLogId();
    await db.query(
      `INSERT INTO room_maintenance_request_log
         (id, room_maintenance_request_id, log, logged_by, logged_at, status, created_at, updated_at)
       VALUES (?, ?, 'Permohonan maintenance dibuat', ?, NOW(), 1, NOW(), NOW())`,
      [logId, laporan_id, pjEmployeeId]
    );

    req.session.flash = { type: 'success', message: 'Permohonan maintenance berhasil dibuat.' };
    res.redirect('/maintenance');
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /maintenance/:id  — detail permohonan + timeline log
// ══════════════════════════════════════════════════════════════════════════════
const show = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[laporan]] = await db.query(
      `SELECT rmr.id, rmr.issue_description, rmr.status, rmr.reported_at, rmr.resolved_at,
              r.name AS room_name, r.code AS room_code,
              b.name AS building_name,
              e_by.name AS reported_by_name,
              e_pengelola.name AS pengelola_name
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN employees e_by ON rmr.reported_by = e_by.id
       LEFT JOIN employees e_pengelola ON rmr.employee_id = e_pengelola.id
       WHERE rmr.id = ?`,
      [id]
    );

    if (!laporan) {
      return res.status(404).render('error', {
        message: 'Permohonan tidak ditemukan',
        error:   { status: 404, stack: 'Permohonan maintenance dengan ID tersebut tidak ada.' },
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

    // Cek apakah ada progres (status=3) → untuk enable tombol Close
    const hasProgress = logs.some(lg => lg.status === 3);

    res.render('pj/maintenance/show', {
      title:       `Maintenance #${String(id).padStart(5, '0')}`,
      currentPath: '/maintenance',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash:       req.session.flash || null,
      laporan,
      logs,
      STATUS_INFO,
      hasProgress,
    });
    delete req.session.flash;
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// POST /maintenance/:id/close  — tutup permohonan (selesai)
// ══════════════════════════════════════════════════════════════════════════════
const close = async (req, res, next) => {
  const { id } = req.params;
  try {
    // Validasi: harus ada log status=3 (progres)
    const [[{ cnt }]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM room_maintenance_request_log
       WHERE room_maintenance_request_id = ? AND status = 3`,
      [id]
    );
    if (cnt === 0) {
      req.session.flash = {
        type: 'error',
        message: 'Permohonan tidak dapat ditutup. Belum ada update progres dari pengelola.',
      };
      return res.redirect(`/maintenance/${id}`);
    }

    const pjEmployeeId = await getEmployeeId(req.session.userId);

    // Update status laporan → resolved
    await db.query(
      `UPDATE room_maintenance_requests
       SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [id]
    );

    // Insert log status=5 (selesai)
    const logId = await nextLogId();
    await db.query(
      `INSERT INTO room_maintenance_request_log
         (id, room_maintenance_request_id, log, logged_by, logged_at, status, created_at, updated_at)
       VALUES (?, ?, 'Permohonan dinyatakan selesai', ?, NOW(), 5, NOW(), NOW())`,
      [logId, id, pjEmployeeId]
    );

    req.session.flash = { type: 'success', message: 'Permohonan berhasil ditutup dan dinyatakan selesai.' };
    res.redirect('/maintenance');
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// POST /maintenance/:id/revisi  — minta revisi
// ══════════════════════════════════════════════════════════════════════════════
const revisi = async (req, res, next) => {
  const { id }    = req.params;
  const { catatan } = req.body;

  if (!catatan || catatan.trim().length < 10) {
    req.session.flash = {
      type: 'error',
      message: 'Catatan revisi wajib diisi minimal 10 karakter.',
    };
    return res.redirect(`/maintenance/${id}`);
  }

  try {
    const pjEmployeeId = await getEmployeeId(req.session.userId);

    // Insert log status=4 (revisi)
    const logId = await nextLogId();
    await db.query(
      `INSERT INTO room_maintenance_request_log
         (id, room_maintenance_request_id, log, logged_by, logged_at, description, status, created_at, updated_at)
       VALUES (?, ?, 'Revisi diminta', ?, NOW(), ?, 4, NOW(), NOW())`,
      [logId, id, pjEmployeeId, catatan.trim()]
    );

    // Status tetap in_progress, tidak diubah

    req.session.flash = { type: 'success', message: 'Catatan revisi berhasil dikirim ke pengelola.' };
    res.redirect(`/maintenance/${id}`);
  } catch (err) { next(err); }
};

module.exports = { index, create, store, show, close, revisi };
