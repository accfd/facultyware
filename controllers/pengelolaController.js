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
// GET /penugasan  — daftar penugasan aktif milik pengelola yang login
// ══════════════════════════════════════════════════════════════════════════════
const index = async (req, res, next) => {
  try {
    const employeeId = await getEmployeeId(req.session.userId);
    if (!employeeId) {
      req.session.flash = { type: 'error', message: 'Data pegawai tidak ditemukan.' };
      return res.redirect('/login');
    }

    const search = req.query.search || '';
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const whereParts = ["rmr.status = 'in_progress'", 'rmr.employee_id = ?'];
    const params     = [employeeId];

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
       JOIN employees e_pj ON r.responsible_employee_id = e_pj.id
       ${where}`,
      params
    );

    const [penugasan] = await db.query(
      `SELECT rmr.id, r.name AS room_name, b.name AS building_name,
              rmr.issue_description, rmr.status, rmr.reported_at,
              e_pj.name AS penanggung_jawab_name,
              (SELECT COUNT(*) FROM room_maintenance_request_log
               WHERE room_maintenance_request_id = rmr.id AND status = 3) AS jumlah_progres,
              (SELECT status FROM room_maintenance_request_log
               WHERE room_maintenance_request_id = rmr.id
               ORDER BY created_at DESC, id DESC LIMIT 1) = 4 AS has_revisi
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN employees e_pj ON r.responsible_employee_id = e_pj.id
       ${where}
       ORDER BY rmr.reported_at ASC
       LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, offset]
    );

    const totalPages = Math.ceil(total / PAGE_SIZE);

    const flash = req.session.flash || null;
    delete req.session.flash;

    res.render('pengelola/index', {
      title:       'Penugasan Aktif',
      currentPath: '/penugasan',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash,
      penugasan,
      STATUS_INFO,
      search,
      page,
      totalPages,
      total,
    });
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /penugasan/:id  — detail penugasan + timeline log
// ══════════════════════════════════════════════════════════════════════════════
const show = async (req, res, next) => {
  try {
    const employeeId = await getEmployeeId(req.session.userId);
    const { id }     = req.params;

    const [[laporan]] = await db.query(
      `SELECT rmr.id, rmr.issue_description, rmr.status, rmr.reported_at, rmr.resolved_at,
              r.name AS room_name, r.code AS room_code,
              b.name AS building_name,
              e_by.name AS reported_by_name,
              e_pj.name AS penanggung_jawab_name
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN employees e_by ON rmr.reported_by = e_by.id
       JOIN employees e_pj ON r.responsible_employee_id = e_pj.id
       WHERE rmr.id = ? AND rmr.employee_id = ?`,
      [id, employeeId]
    );

    if (!laporan) {
      return res.status(404).render('error', {
        message: 'Penugasan tidak ditemukan',
        error:   { status: 404, stack: 'Penugasan tidak ada atau bukan milik Anda.' },
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

    // Cek apakah log terakhir adalah revisi (status=4)
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
    const hasRevisi = lastLog && lastLog.status === 4;
    const canSubmitProgres = !lastLog || lastLog.status !== 3;

    const flash = req.session.flash || null;
    delete req.session.flash;

    res.render('pengelola/show', {
      title:       `Penugasan #${String(id).padStart(5, '0')}`,
      currentPath: req.baseUrl || '/penugasan',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash,
      laporan,
      logs,
      STATUS_INFO,
      hasRevisi,
      lastRevisiNote: hasRevisi ? lastLog.description : null,
      canSubmitProgres,
    });
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// POST /penugasan/:id/progres  — simpan update progres perbaikan
// ══════════════════════════════════════════════════════════════════════════════
const storeProgres = async (req, res, next) => {
  const { id }        = req.params;
  const { description } = req.body;
  const foto          = req.file ? `/uploads/progres/${req.file.filename}` : null;

  // Multer error (file bukan gambar / terlalu besar)
  if (req.multerError) {
    req.session.flash = { type: 'error', message: req.multerError };
    return res.redirect(`/penugasan/${id}`);
  }

  // Validasi
  const errors = [];
  if (!description || description.trim().length < 20)
    errors.push('Deskripsi pekerjaan minimal 20 karakter.');
  if (!foto)
    errors.push('Foto bukti perbaikan wajib diunggah.');

  if (errors.length > 0) {
    req.session.flash = { type: 'error', message: errors.join(' ') };
    return res.redirect(`/penugasan/${id}`);
  }

  try {
    const employeeId = await getEmployeeId(req.session.userId);

    // Cek apakah log terakhir sudah berstatus 3 (Progres)
    const [latestLogs] = await db.query(
      `SELECT status FROM room_maintenance_request_log
       WHERE room_maintenance_request_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [id]
    );
    const lastLog = latestLogs.length > 0 ? latestLogs[0] : null;
    if (lastLog && lastLog.status === 3) {
      req.session.flash = {
        type: 'error',
        message: 'Anda sudah mengirim progres perbaikan. Harap tunggu verifikasi atau revisi dari Penanggung Jawab.',
      };
      return res.redirect(`/penugasan/${id}`);
    }

    // Hitung nomor progres
    const [[{ cnt }]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM room_maintenance_request_log
       WHERE room_maintenance_request_id = ? AND status = 3`,
      [id]
    );
    const nomorProgres = cnt + 1;

    // INSERT log progres (status=3)
    const logId = await nextLogId();
    await db.query(
      `INSERT INTO room_maintenance_request_log
         (id, room_maintenance_request_id, log, logged_by, logged_at,
          log_file, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), ?, ?, 3, NOW(), NOW())`,
      [logId, id, `Progres ${nomorProgres}`, employeeId, foto, description.trim()]
    );

    req.session.flash = { type: 'success', message: `Progres ${nomorProgres} berhasil dikirim!` };
    res.redirect(`/penugasan/${id}`);
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /progres  — riwayat penugasan yang sudah selesai
// ══════════════════════════════════════════════════════════════════════════════
const history = async (req, res, next) => {
  try {
    const employeeId = await getEmployeeId(req.session.userId);
    if (!employeeId) {
      req.session.flash = { type: 'error', message: 'Data pegawai tidak ditemukan.' };
      return res.redirect('/login');
    }

    const search = req.query.search || '';
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const whereParts = ["rmr.status = 'resolved'", 'rmr.employee_id = ?'];
    const params     = [employeeId];

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
       JOIN employees e_pj ON r.responsible_employee_id = e_pj.id
       ${where}`,
      params
    );

    const [penugasan] = await db.query(
      `SELECT rmr.id, r.name AS room_name, b.name AS building_name,
              rmr.issue_description, rmr.status, rmr.reported_at, rmr.resolved_at,
              e_pj.name AS penanggung_jawab_name,
              (SELECT COUNT(*) FROM room_maintenance_request_log
               WHERE room_maintenance_request_id = rmr.id AND status = 3) AS jumlah_progres
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN employees e_pj ON r.responsible_employee_id = e_pj.id
       ${where}
       ORDER BY rmr.resolved_at DESC
       LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, offset]
    );

    const totalPages = Math.ceil(total / PAGE_SIZE);

    const flash = req.session.flash || null;
    delete req.session.flash;

    res.render('pengelola/history', {
      title:       'Riwayat Progres',
      currentPath: '/progres',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash,
      penugasan,
      STATUS_INFO,
      search,
      page,
      totalPages,
      total,
    });
  } catch (err) { next(err); }
};

module.exports = { index, show, storeProgres, history };
