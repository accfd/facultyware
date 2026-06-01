const PDFDocument = require('pdfkit');
const db   = require('../lib/db');
const path = require('path');
const fs   = require('fs');

// Pastikan folder generated ada
const generatedDir = path.join(__dirname, '../public/generated');
if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────────────────
async function getEmployeeId(userId) {
  const [[emp]] = await db.query('SELECT id FROM employees WHERE id = ?', [userId]);
  return emp ? emp.id : null;
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_LABEL = {
  reported:    'Dilaporkan',
  in_progress: 'Dalam Proses',
  resolved:    'Selesai',
};

const LOG_STATUS_LABEL = {
  1: 'Laporan Dibuat',
  2: 'Diterima',
  3: 'Progres Perbaikan',
  4: 'Revisi',
  5: 'Selesai',
};

// ── PDF Builder Helpers ────────────────────────────────────────────────────────

/** Gambar header dokumen (logo teks + garis + subtitle) */
function drawHeader(doc, subtitle) {
  doc.fontSize(14).font('Helvetica-Bold')
     .text('FAKULTAS TEKNOLOGI INFORMASI', 50, 50, { align: 'center', width: 495 });
  doc.fontSize(12).font('Helvetica-Bold')
     .text('UNIVERSITAS ANDALAS', { align: 'center', width: 495 });
  doc.moveDown(0.4);

  // Garis tebal
  const y1 = doc.y;
  doc.moveTo(50, y1).lineTo(545, y1).lineWidth(2).stroke();
  doc.moveTo(50, y1 + 2).lineTo(545, y1 + 2).lineWidth(0.5).stroke();
  doc.moveDown(0.6);

  // Sub-judul dokumen
  doc.fontSize(13).font('Helvetica-Bold')
     .text(subtitle.toUpperCase(), { align: 'center', width: 495 });
  doc.moveDown(0.4);

  // Tanggal cetak
  doc.fontSize(9).font('Helvetica').fillColor('#555555')
     .text(`Dicetak pada: ${fmtDateTime(new Date())}`, { align: 'right', width: 495 });
  doc.fillColor('#000000');
  doc.moveDown(1);
}

/** Gambar satu baris label: nilai */
function drawField(doc, label, value, xLabel, xValue, y, opts = {}) {
  const labelW  = opts.labelW  || 160;
  const valueW  = opts.valueW  || 310;
  doc.fontSize(10).font('Helvetica-Bold')
     .text(label + ':', xLabel, y, { width: labelW, lineBreak: false });
  doc.fontSize(10).font('Helvetica')
     .text(String(value || '-'), xValue, y, { width: valueW });
}

/** Gambar header tabel */
function drawTableHeader(doc, columns, y) {
  doc.rect(50, y, 495, 18).fill('#2563EB');
  let x = 50;
  columns.forEach(col => {
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF')
       .text(col.label, x + 4, y + 4, { width: col.w - 8, lineBreak: false });
    x += col.w;
  });
  doc.fillColor('#000000');
  return y + 18;
}

/** Gambar satu baris tabel (auto height) */
function drawTableRow(doc, columns, row, y, isEven) {
  // Hitung tinggi baris berdasarkan teks terpanjang
  let maxH = 16;
  columns.forEach((col, i) => {
    const val = String(row[i] || '-');
    const textH = doc.heightOfString(val, { width: col.w - 8, fontSize: 8.5 });
    if (textH + 8 > maxH) maxH = textH + 8;
  });

  if (isEven) doc.rect(50, y, 495, maxH).fill('#F0F4FF');
  doc.rect(50, y, 495, maxH).stroke('#CCCCCC');

  let x = 50;
  columns.forEach((col, i) => {
    doc.rect(x, y, col.w, maxH).stroke('#CCCCCC');
    doc.fontSize(8.5).font('Helvetica').fillColor('#000000')
       .text(String(row[i] || '-'), x + 4, y + 4, { width: col.w - 8 });
    x += col.w;
  });
  return y + maxH;
}

/** Gambar footer (nomor halaman) */
function addPageNumbers(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.fontSize(8).font('Helvetica').fillColor('#777777')
       .text(
         `Halaman ${i + 1} dari ${range.count}`,
         50, doc.page.height - 35,
         { align: 'center', width: 495 }
       );
    doc.moveTo(50, doc.page.height - 40).lineTo(545, doc.page.height - 40)
       .lineWidth(0.5).stroke('#CCCCCC');
  }
  doc.fillColor('#000000');
}

/** Periksa apakah perlu ganti halaman */
function checkPageBreak(doc, neededSpace = 60) {
  if (doc.y + neededSpace > doc.page.height - 60) {
    doc.addPage();
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// A. PDF BUKTI LAPORAN — untuk Pengguna Biasa
// GET /laporan/:id/pdf
// ══════════════════════════════════════════════════════════════════════════════
const buktiLaporan = async (req, res, next) => {
  try {
    const employeeId = await getEmployeeId(req.session.userId);
    const { id }     = req.params;

    const [[laporan]] = await db.query(
      `SELECT rmr.*, r.name AS room_name, r.code AS room_code,
              b.name AS building_name, b.code AS building_code,
              e.name AS reported_by_name, e.employee_number
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN employees e ON rmr.reported_by = e.id
       WHERE rmr.id = ? AND rmr.reported_by = ?`,
      [id, employeeId]
    );

    if (!laporan) {
      return res.status(404).render('error', {
        message: 'Laporan tidak ditemukan',
        error: { status: 404, stack: 'Laporan tidak ada atau bukan milik Anda.' },
      });
    }

    const [logs] = await db.query(
      `SELECT rmrl.logged_at, rmrl.log, rmrl.description, rmrl.status,
              e.name AS logged_by_name
       FROM room_maintenance_request_log rmrl
       LEFT JOIN employees e ON rmrl.logged_by = e.id
       WHERE rmrl.room_maintenance_request_id = ?
       ORDER BY rmrl.created_at ASC`,
      [id]
    );

    // Buat PDF
    const doc      = new PDFDocument({ margin: 50, bufferPages: true, size: 'A4' });
    const filename = `bukti-laporan-LPR-${String(id).padStart(5, '0')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    drawHeader(doc, 'Bukti Laporan Kerusakan Ruangan');

    // Nomor Laporan (besar)
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#2563EB')
       .text(`LPR-${String(laporan.id).padStart(5, '0')}`, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    // Section: Info Laporan
    doc.fontSize(11).font('Helvetica-Bold').text('Informasi Laporan');
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.5);

    const fields = [
      ['Nama Pelapor',    laporan.reported_by_name],
      ['NIP / NIM',       laporan.employee_number || '-'],
      ['Ruangan',         `${laporan.room_name} (${laporan.room_code})`],
      ['Gedung',          `${laporan.building_name} (${laporan.building_code})`],
      ['Tanggal Laporan', fmtDateTime(laporan.reported_at)],
      ['Status Terkini',  STATUS_LABEL[laporan.status] || laporan.status],
    ];
    if (laporan.resolved_at) {
      fields.push(['Tanggal Selesai', fmtDateTime(laporan.resolved_at)]);
    }

    fields.forEach(([label, val]) => {
      const y = doc.y;
      drawField(doc, label, val, 50, 220, y);
      doc.moveDown(0.55);
    });

    doc.moveDown(0.5);

    // Deskripsi kerusakan
    doc.fontSize(11).font('Helvetica-Bold').text('Deskripsi Kerusakan');
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.5);
    doc.rect(50, doc.y, 495, doc.heightOfString(laporan.issue_description, { width: 483 }) + 14)
       .fill('#F8FAFF');
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
       .text(laporan.issue_description, 57, doc.y + 7, { width: 483 });
    doc.moveDown(1.5);

    // Tabel log riwayat
    checkPageBreak(doc, 80);
    doc.fontSize(11).font('Helvetica-Bold').text('Riwayat Perbaikan');
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.5);

    if (logs.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#888888').text('Belum ada riwayat perbaikan.');
      doc.fillColor('#000000');
    } else {
      const cols = [
        { label: 'Tanggal',    w: 130 },
        { label: 'Keterangan', w: 175 },
        { label: 'Deskripsi',  w: 120 },
        { label: 'Oleh',       w: 70  },
      ];
      let tY = drawTableHeader(doc, cols, doc.y);
      logs.forEach((lg, i) => {
        checkPageBreak(doc, 30);
        if (doc.y !== tY) tY = doc.y;
        const row = [
          fmtDateTime(lg.logged_at),
          `${LOG_STATUS_LABEL[lg.status] || '-'}\n${lg.log || ''}`,
          lg.description || '-',
          lg.logged_by_name || '-',
        ];
        tY = drawTableRow(doc, cols, row, tY, i % 2 === 0);
        doc.y = tY;
      });
    }

    addPageNumbers(doc);
    doc.end();
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// B. PDF REKAP LAPORAN BULANAN — untuk Penanggung Jawab
// GET /pj/laporan/pdf-rekap?bulan=YYYY-MM
// ══════════════════════════════════════════════════════════════════════════════
const rekapBulanan = async (req, res, next) => {
  try {
    const bulan = req.query.bulan || '';
    if (!bulan || !/^\d{4}-\d{2}$/.test(bulan)) {
      return res.status(400).render('error', {
        message: 'Parameter bulan tidak valid',
        error: { status: 400, stack: 'Gunakan format YYYY-MM, contoh: 2025-05' },
      });
    }

    const [laporan] = await db.query(
      `SELECT rmr.id, r.name AS room_name, b.name AS building_name,
              e.name AS reported_by, rmr.issue_description,
              rmr.status, rmr.reported_at, rmr.resolved_at
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN employees e ON rmr.reported_by = e.id
       WHERE DATE_FORMAT(rmr.reported_at, '%Y-%m') = ?
       ORDER BY rmr.reported_at ASC`,
      [bulan]
    );

    // Summary
    const total     = laporan.length;
    const selesai   = laporan.filter(l => l.status === 'resolved').length;
    const proses    = laporan.filter(l => l.status === 'in_progress').length;
    const dilaporkan = laporan.filter(l => l.status === 'reported').length;

    // Format nama bulan
    const [tahun, bln] = bulan.split('-');
    const namaBulan = new Date(`${tahun}-${bln}-01`)
      .toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    const doc      = new PDFDocument({ margin: 50, bufferPages: true, size: 'A4' });
    const filename = `rekap-laporan-${bulan}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    drawHeader(doc, `Rekap Laporan Maintenance Ruangan\n${namaBulan}`);

    // Ringkasan statistik
    doc.fontSize(11).font('Helvetica-Bold').text('Ringkasan Statistik');
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.5);

    // Kotak statistik 4 kolom
    const boxW = 115, boxH = 52, boxGap = 8;
    const boxY = doc.y;
    const stats = [
      { label: 'Total Laporan', val: total,      color: '#2563EB' },
      { label: 'Dilaporkan',    val: dilaporkan,  color: '#D97706' },
      { label: 'Dalam Proses',  val: proses,      color: '#7C3AED' },
      { label: 'Selesai',       val: selesai,     color: '#15803D' },
    ];
    stats.forEach((s, i) => {
      const bx = 50 + i * (boxW + boxGap);
      doc.rect(bx, boxY, boxW, boxH).fill('#F8FAFF').stroke('#DDDDDD');
      doc.fontSize(22).font('Helvetica-Bold').fillColor(s.color)
         .text(String(s.val), bx, boxY + 6, { width: boxW, align: 'center' });
      doc.fontSize(9).font('Helvetica').fillColor('#555555')
         .text(s.label, bx, boxY + 32, { width: boxW, align: 'center' });
    });
    doc.fillColor('#000000');
    doc.y = boxY + boxH + 20;
    doc.moveDown(0.5);

    // Tabel laporan
    doc.fontSize(11).font('Helvetica-Bold').text(`Daftar Laporan — ${namaBulan}`);
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.5);

    if (laporan.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#888888')
         .text('Tidak ada laporan pada periode ini.');
      doc.fillColor('#000000');
    } else {
      const cols = [
        { label: 'No',       w: 25  },
        { label: 'Ruangan',  w: 100 },
        { label: 'Gedung',   w: 80  },
        { label: 'Pelapor',  w: 85  },
        { label: 'Deskripsi', w: 125 },
        { label: 'Status',   w: 60  },
        { label: 'Tgl',      w: 70  },
      ];
      checkPageBreak(doc, 40);
      let tY = drawTableHeader(doc, cols, doc.y);
      laporan.forEach((l, i) => {
        checkPageBreak(doc, 25);
        if (doc.y !== tY) tY = doc.y;
        const trunc = (s, n) => s && s.length > n ? s.substring(0, n) + '…' : (s || '-');
        const row = [
          String(i + 1),
          l.room_name,
          l.building_name,
          trunc(l.reported_by, 18),
          trunc(l.issue_description, 40),
          STATUS_LABEL[l.status] || l.status,
          fmtDate(l.reported_at),
        ];
        tY = drawTableRow(doc, cols, row, tY, i % 2 === 0);
        doc.y = tY;
      });
    }

    addPageNumbers(doc);
    doc.end();
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// C. PDF PERMOHONAN MAINTENANCE — untuk Pengelola Aset
// GET /penugasan/:id/pdf
// ══════════════════════════════════════════════════════════════════════════════
const permohonanMaintenance = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[laporan]] = await db.query(
      `SELECT rmr.id, rmr.issue_description, rmr.status, rmr.reported_at,
              r.name AS room_name, r.code AS room_code,
              b.name AS building_name, b.code AS building_code,
              e_by.name AS reported_by_name, e_by.employee_number AS reported_by_number,
              e_pj.name AS penanggung_jawab_name,
              e_pg.name AS pengelola_name
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN employees e_by ON rmr.reported_by = e_by.id
       JOIN employees e_pj ON r.responsible_employee_id = e_pj.id
       LEFT JOIN employees e_pg ON rmr.employee_id = e_pg.id
       WHERE rmr.id = ?`,
      [id]
    );

    if (!laporan) {
      return res.status(404).render('error', {
        message: 'Permohonan tidak ditemukan',
        error: { status: 404, stack: 'Data tidak ada.' },
      });
    }

    // Ambil tanggal maintenance dibuat (log status=1)
    const [[firstLog]] = await db.query(
      `SELECT logged_at FROM room_maintenance_request_log
       WHERE room_maintenance_request_id = ? AND status = 1
       ORDER BY created_at ASC LIMIT 1`,
      [id]
    );

    const doc      = new PDFDocument({ margin: 50, bufferPages: true, size: 'A4' });
    const filename = `permohonan-maintenance-MNT-${String(id).padStart(5, '0')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    drawHeader(doc, 'Surat Permohonan Maintenance Ruangan');

    // Nomor permohonan
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#2563EB')
       .text(`MNT-${String(laporan.id).padStart(5, '0')}`, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    // Info
    doc.fontSize(11).font('Helvetica-Bold').text('Data Permohonan');
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.5);

    const fields = [
      ['Tanggal Permohonan', fmtDate(firstLog ? firstLog.logged_at : laporan.reported_at)],
      ['Ruangan',            `${laporan.room_name} (${laporan.room_code})`],
      ['Gedung',             `${laporan.building_name} (${laporan.building_code})`],
      ['Tanggal Kerusakan',  fmtDate(laporan.reported_at)],
      ['Dilaporkan Oleh',    laporan.reported_by_name],
      ['Penanggung Jawab',   laporan.penanggung_jawab_name],
      ['Pengelola Ditugaskan', laporan.pengelola_name || '-'],
      ['Status',             STATUS_LABEL[laporan.status] || laporan.status],
    ];

    fields.forEach(([label, val]) => {
      const y = doc.y;
      drawField(doc, label, val, 50, 230, y);
      doc.moveDown(0.6);
    });

    doc.moveDown(0.5);

    // Deskripsi
    doc.fontSize(11).font('Helvetica-Bold').text('Deskripsi Kerusakan');
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.5);
    const descH = doc.heightOfString(laporan.issue_description, { width: 483 }) + 14;
    doc.rect(50, doc.y, 495, descH).fill('#F8FAFF');
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
       .text(laporan.issue_description, 57, doc.y + 7, { width: 483 });
    doc.moveDown(2.5);

    // Kolom tanda tangan
    checkPageBreak(doc, 100);
    doc.fontSize(11).font('Helvetica-Bold').text('Persetujuan');
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.8);

    const sigY = doc.y;
    // Kotak TTD kiri
    doc.rect(50, sigY, 220, 90).stroke('#CCCCCC');
    doc.fontSize(9).font('Helvetica').text('Penanggung Jawab', 50, sigY + 6, { width: 220, align: 'center' });
    doc.text(laporan.penanggung_jawab_name, 50, sigY + 70, { width: 220, align: 'center' });
    // Kotak TTD kanan
    doc.rect(325, sigY, 220, 90).stroke('#CCCCCC');
    doc.text('Pengelola Aset', 325, sigY + 6, { width: 220, align: 'center' });
    doc.text(laporan.pengelola_name || '_______________', 325, sigY + 70, { width: 220, align: 'center' });

    addPageNumbers(doc);
    doc.end();
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// D. PDF LAPORAN HASIL PERBAIKAN — untuk Pengelola Aset
// GET /penugasan/:id/pdf-hasil
// ══════════════════════════════════════════════════════════════════════════════
const hasilPerbaikan = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[laporan]] = await db.query(
      `SELECT rmr.id, rmr.issue_description, rmr.status, rmr.reported_at, rmr.resolved_at,
              r.name AS room_name, r.code AS room_code,
              b.name AS building_name,
              e_by.name AS reported_by_name,
              e_pj.name AS penanggung_jawab_name,
              e_pg.name AS pengelola_name
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN employees e_by ON rmr.reported_by = e_by.id
       JOIN employees e_pj ON r.responsible_employee_id = e_pj.id
       LEFT JOIN employees e_pg ON rmr.employee_id = e_pg.id
       WHERE rmr.id = ?`,
      [id]
    );

    if (!laporan) {
      return res.status(404).render('error', {
        message: 'Data tidak ditemukan',
        error: { status: 404, stack: 'Laporan dengan ID tersebut tidak ada.' },
      });
    }

    // Ambil semua log progres (status=3)
    const [progres] = await db.query(
      `SELECT rmrl.log, rmrl.description, rmrl.log_file, rmrl.logged_at,
              rmrl.status, e.name AS logged_by_name
       FROM room_maintenance_request_log rmrl
       LEFT JOIN employees e ON rmrl.logged_by = e.id
       WHERE rmrl.room_maintenance_request_id = ?
       ORDER BY rmrl.created_at ASC`,
      [id]
    );

    const progresOnly = progres.filter(p => p.status === 3);

    const doc      = new PDFDocument({ margin: 50, bufferPages: true, size: 'A4' });
    const filename = `hasil-perbaikan-PNT-${String(id).padStart(5, '0')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    drawHeader(doc, 'Laporan Hasil Perbaikan Ruangan');

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#15803D')
       .text(`PNT-${String(laporan.id).padStart(5, '0')}`, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    // Info ringkas
    doc.fontSize(11).font('Helvetica-Bold').text('Informasi Perbaikan');
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.5);

    const fields = [
      ['Ruangan',          `${laporan.room_name} (${laporan.room_code})`],
      ['Gedung',           laporan.building_name],
      ['Pelapor',          laporan.reported_by_name],
      ['Penanggung Jawab', laporan.penanggung_jawab_name],
      ['Pengelola Aset',   laporan.pengelola_name || '-'],
      ['Tgl Laporan',      fmtDate(laporan.reported_at)],
      ['Status Akhir',     STATUS_LABEL[laporan.status] || laporan.status],
    ];
    if (laporan.resolved_at) {
      fields.push(['Tgl Selesai', fmtDate(laporan.resolved_at)]);
    }

    fields.forEach(([label, val]) => {
      const y = doc.y;
      drawField(doc, label, val, 50, 220, y);
      doc.moveDown(0.6);
    });

    doc.moveDown(0.5);

    // Deskripsi kerusakan
    doc.fontSize(11).font('Helvetica-Bold').text('Deskripsi Kerusakan Awal');
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.5);
    const descH = doc.heightOfString(laporan.issue_description, { width: 483 }) + 14;
    doc.rect(50, doc.y, 495, descH).fill('#FFF8F0');
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
       .text(laporan.issue_description, 57, doc.y + 7, { width: 483 });
    doc.moveDown(1.5);

    // Tabel progres
    checkPageBreak(doc, 60);
    doc.fontSize(11).font('Helvetica-Bold')
       .text(`Rekap Progres Perbaikan (${progresOnly.length} update)`);
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.5);

    if (progresOnly.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#888888').text('Belum ada update progres.');
      doc.fillColor('#000000');
    } else {
      const cols = [
        { label: 'Ke-',       w: 30  },
        { label: 'Tanggal',   w: 110 },
        { label: 'Deskripsi Pekerjaan', w: 245 },
        { label: 'Foto',      w: 110 },
      ];
      let tY = drawTableHeader(doc, cols, doc.y);
      progresOnly.forEach((p, i) => {
        checkPageBreak(doc, 30);
        if (doc.y !== tY) tY = doc.y;
        const fotoInfo = p.log_file
          ? `Ada (tersimpan di sistem)\n${path.basename(p.log_file)}`
          : 'Tidak ada';
        const row = [
          String(i + 1),
          fmtDateTime(p.logged_at),
          p.description || '-',
          fotoInfo,
        ];
        tY = drawTableRow(doc, cols, row, tY, i % 2 === 0);
        doc.y = tY;
      });
    }

    // Catatan foto
    doc.moveDown(1);
    doc.fontSize(8.5).font('Helvetica').fillColor('#777777')
       .text('* Foto bukti perbaikan tidak ditampilkan dalam PDF. File foto tersimpan di sistem dan dapat diakses melalui aplikasi.', {
         width: 495,
       });
    doc.fillColor('#000000');

    addPageNumbers(doc);
    doc.end();
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// E. PDF BUKTI LAPORAN untuk Penanggung Jawab (view all)
// GET /pj/laporan/:id/pdf
// ══════════════════════════════════════════════════════════════════════════════
const buktiLaporanPJ = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[laporan]] = await db.query(
      `SELECT rmr.*, r.name AS room_name, r.code AS room_code,
              b.name AS building_name, b.code AS building_code,
              e.name AS reported_by_name, e.employee_number
       FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       JOIN employees e ON rmr.reported_by = e.id
       WHERE rmr.id = ?`,
      [id]
    );

    if (!laporan) {
      return res.status(404).render('error', {
        message: 'Laporan tidak ditemukan',
        error: { status: 404, stack: 'Laporan tidak ada.' },
      });
    }

    const [logs] = await db.query(
      `SELECT rmrl.logged_at, rmrl.log, rmrl.description, rmrl.status,
              e.name AS logged_by_name
       FROM room_maintenance_request_log rmrl
       LEFT JOIN employees e ON rmrl.logged_by = e.id
       WHERE rmrl.room_maintenance_request_id = ?
       ORDER BY rmrl.created_at ASC`,
      [id]
    );

    const doc      = new PDFDocument({ margin: 50, bufferPages: true, size: 'A4' });
    const filename = `laporan-LPR-${String(id).padStart(5, '0')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    drawHeader(doc, 'Detail Laporan Kerusakan Ruangan');

    doc.fontSize(16).font('Helvetica-Bold').fillColor('#2563EB')
       .text(`LPR-${String(laporan.id).padStart(5, '0')}`, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    doc.fontSize(11).font('Helvetica-Bold').text('Informasi Laporan');
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.5);

    const fields = [
      ['Nama Pelapor',    laporan.reported_by_name],
      ['NIP / NIM',       laporan.employee_number || '-'],
      ['Ruangan',         `${laporan.room_name} (${laporan.room_code})`],
      ['Gedung',          `${laporan.building_name} (${laporan.building_code})`],
      ['Tanggal Laporan', fmtDateTime(laporan.reported_at)],
      ['Status Terkini',  STATUS_LABEL[laporan.status] || laporan.status],
    ];
    if (laporan.resolved_at) fields.push(['Tanggal Selesai', fmtDateTime(laporan.resolved_at)]);

    fields.forEach(([label, val]) => {
      const y = doc.y;
      drawField(doc, label, val, 50, 220, y);
      doc.moveDown(0.55);
    });

    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica-Bold').text('Deskripsi Kerusakan');
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.5);
    const descH = doc.heightOfString(laporan.issue_description, { width: 483 }) + 14;
    doc.rect(50, doc.y, 495, descH).fill('#F8FAFF');
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
       .text(laporan.issue_description, 57, doc.y + 7, { width: 483 });
    doc.moveDown(1.5);

    checkPageBreak(doc, 80);
    doc.fontSize(11).font('Helvetica-Bold').text('Riwayat Perbaikan');
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.5);

    if (logs.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#888888').text('Belum ada riwayat.');
      doc.fillColor('#000000');
    } else {
      const cols = [
        { label: 'Tanggal',    w: 130 },
        { label: 'Keterangan', w: 175 },
        { label: 'Deskripsi',  w: 120 },
        { label: 'Oleh',       w: 70  },
      ];
      let tY = drawTableHeader(doc, cols, doc.y);
      logs.forEach((lg, i) => {
        checkPageBreak(doc, 30);
        if (doc.y !== tY) tY = doc.y;
        const row = [
          fmtDateTime(lg.logged_at),
          `${LOG_STATUS_LABEL[lg.status] || '-'}\n${lg.log || ''}`,
          lg.description || '-',
          lg.logged_by_name || '-',
        ];
        tY = drawTableRow(doc, cols, row, tY, i % 2 === 0);
        doc.y = tY;
      });
    }

    addPageNumbers(doc);
    doc.end();
  } catch (err) { next(err); }
};

module.exports = {
  buktiLaporan,       // A: GET /laporan/:id/pdf
  rekapBulanan,       // B: GET /pj/laporan/pdf-rekap?bulan=YYYY-MM
  permohonanMaintenance, // C: GET /penugasan/:id/pdf
  hasilPerbaikan,     // D: GET /penugasan/:id/pdf-hasil
  buktiLaporanPJ,     // E: GET /pj/laporan/:id/pdf
};
