const db = require('../lib/db');

const PAGE_SIZE = 10;

// Helper: Ambil ID Pelapor (mahasiswa/dosen) berdasarkan userId session
async function getEmployeeId(userId) {
  const [[emp]] = await db.query('SELECT id FROM employees WHERE id = ?', [userId]);
  if (emp) return emp.id;

  const [[stu]] = await db.query('SELECT id FROM students WHERE id = ?', [userId]);
  return stu ? stu.id : null;
}

// Helper: Format warna badge status laporan
const STATUS_INFO = {
  reported:    { text: 'Dilaporkan', bg: '#fffbeb', color: '#a16207',  border: '#fde68a' },
  in_progress: { text: 'Diproses',   bg: '#eff6ff', color: '#1d4ed8',  border: '#bfdbfe' },
  resolved:    { text: 'Selesai',    bg: '#f0fdf4', color: '#15803d',  border: '#bbf7d0' },
};

// GET /laporan - Daftar laporan pribadi
const index = async (req, res, next) => {
  try {
    const employeeId = await getEmployeeId(req.session.userId);
    if (!employeeId) {
      req.session.flash = { type: 'error', message: 'Data pegawai tidak ditemukan. Hubungi administrator.' };
      return res.redirect('/login');
    }

    const status   = req.query.status || '';
    const page     = Math.max(1, parseInt(req.query.page) || 1);
    const offset   = (page - 1) * PAGE_SIZE;

    // Filter query berdasarkan status
    const whereClauses = ['rmr.reported_by = ?'];
    const params       = [employeeId];
    if (status && ['reported', 'in_progress', 'resolved'].includes(status)) {
      whereClauses.push('rmr.status = ?');
      params.push(status);
    }
    const where = whereClauses.join(' AND ');

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM room_maintenance_requests rmr WHERE ${where}`,
      params
    );

    const [laporan] = await db.query(
      `SELECT rmr.id, r.name AS room_name, b.name AS building_name,
              rmr.issue_description, rmr.status, rmr.reported_at, rmr.resolved_at
       FROM room_maintenance_requests rmr
       JOIN rooms     r ON rmr.room_id     = r.id
       JOIN buildings b ON r.building_id   = b.id
       WHERE ${where}
       ORDER BY rmr.reported_at DESC
       LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, offset]
    );

    const totalPages = Math.ceil(total / PAGE_SIZE);

    const flash = req.session.flash || null;
    delete req.session.flash;

    res.render('laporan/index', {
      title:       'Laporan Saya',
      currentPath: '/laporan',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash,
      laporan,
      STATUS_INFO,
      status,
      page,
      totalPages,
      total,
    });
  } catch (err) { next(err); }
};

// GET /laporan/buat - Halaman form buat laporan
const create = async (req, res, next) => {
  try {
    const [rooms] = await db.query(
      `SELECT r.id, r.name, r.code, b.name AS building_name
       FROM rooms r
       JOIN buildings b ON r.building_id = b.id
       ORDER BY b.name, r.name`
    );

    const flash = req.session.flash || null;
    delete req.session.flash;

    res.render('laporan/create', {
      title:       'Buat Laporan',
      currentPath: '/laporan/buat',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash,
      rooms,
      errors:      null,
      old:         {},
    });
  } catch (err) { next(err); }
};

// POST /laporan - Simpan laporan baru
const store = async (req, res, next) => {
  const { room_id, issue_description } = req.body;
  const foto = req.file ? `/uploads/laporan/${req.file.filename}` : null;

  // Validasi input manual
  const errors = [];
  if (!room_id) errors.push({ field: 'room_id', msg: 'Ruangan wajib dipilih.' });
  if (!issue_description || issue_description.trim().length < 20)
    errors.push({ field: 'issue_description', msg: 'Deskripsi kerusakan minimal 20 karakter.' });
  if (issue_description && issue_description.trim().length > 1000)
    errors.push({ field: 'issue_description', msg: 'Deskripsi kerusakan maksimal 1000 karakter.' });
  
  if (req.multerError) {
    errors.push({ field: 'foto', msg: req.multerError });
  } else if (!foto) {
    errors.push({ field: 'foto', msg: 'Foto kerusakan wajib diunggah.' });
  }

  if (errors.length > 0) {
    const [rooms] = await db.query(
      `SELECT r.id, r.name, r.code, b.name AS building_name
       FROM rooms r JOIN buildings b ON r.building_id = b.id
       ORDER BY b.name, r.name`
    ).catch(() => [[]]);

    return res.render('laporan/create', {
      title:       'Buat Laporan',
      currentPath: '/laporan/buat',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash:       null,
      rooms,
      errors,
      old:         { room_id, issue_description },
    });
  }

  try {
    const employeeId = await getEmployeeId(req.session.userId);
    if (!employeeId) return res.redirect('/login');

    // Validasi keberadaan ruangan di database
    const [[room]] = await db.query('SELECT id, responsible_employee_id FROM rooms WHERE id = ?', [room_id]);
    if (!room) {
      const [rooms] = await db.query(
        `SELECT r.id, r.name, r.code, b.name AS building_name
         FROM rooms r JOIN buildings b ON r.building_id = b.id
         ORDER BY b.name, r.name`
      );
      return res.render('laporan/create', {
        title: 'Buat Laporan', currentPath: '/laporan/buat',
        userRole: req.session.userRole, userName: req.session.userName,
        flash: null, rooms,
        errors: [{ field: 'room_id', msg: 'Ruangan tidak valid.' }],
        old: { room_id, issue_description },
      });
    }

    // Insert data laporan baru
    const [result] = await db.query(
      `INSERT INTO room_maintenance_requests
         (room_id, reported_by, issue_description, status, reported_at, employee_id, created_at, updated_at)
       VALUES (?, ?, ?, 'reported', NOW(), ?, NOW(), NOW())`,
      [room_id, employeeId, issue_description.trim(), room.responsible_employee_id]
    );
    const newId = result.insertId;

    // Catat log pertama status=1 (Laporan dibuat)
    const [[{ nextId }]] = await db.query(
      'SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM room_maintenance_request_log'
    );
    await db.query(
      `INSERT INTO room_maintenance_request_log
         (id, room_maintenance_request_id, log, logged_by, logged_at, log_file, status, created_at, updated_at)
       VALUES (?, ?, 'Laporan dibuat', ?, NOW(), ?, 1, NOW(), NOW())`,
      [nextId, newId, employeeId, foto]
    );

    req.session.flash = { type: 'success', message: 'Laporan berhasil dikirim!' };
    res.redirect('/laporan');
  } catch (err) { next(err); }
};

// GET /laporan/:id - Detail laporan pribadi
const show = async (req, res, next) => {
  try {
    const employeeId = await getEmployeeId(req.session.userId);
    const { id }     = req.params;

    const [[laporan]] = await db.query(
      `SELECT rmr.id, rmr.issue_description, rmr.status, rmr.reported_at, rmr.resolved_at,
              r.name AS room_name, r.code AS room_code,
              b.name AS building_name,
              u.name AS reported_by_name
       FROM room_maintenance_requests rmr
       JOIN rooms     r ON rmr.room_id     = r.id
       JOIN buildings b ON r.building_id   = b.id
       JOIN users     u ON rmr.reported_by = u.id
       WHERE rmr.id = ? AND rmr.reported_by = ?`,
      [id, employeeId]
    );

    if (!laporan) {
      return res.status(404).render('error', {
        message: 'Laporan tidak ditemukan',
        error:   { status: 404, stack: 'Laporan tidak ada atau bukan milik Anda.' },
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

    res.render('laporan/show', {
      title:       `Laporan #${String(id).padStart(5, '0')}`,
      currentPath: '/laporan',
      userRole:    req.session.userRole,
      userName:    req.session.userName,
      flash,
      laporan,
      logs,
      STATUS_INFO,
    });
  } catch (err) { next(err); }
};

module.exports = { index, create, store, show };
