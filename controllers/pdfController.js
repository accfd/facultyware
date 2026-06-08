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
  const dateObj = new Date(d);
  const tgl = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const jam = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
  return `${tgl} pukul ${jam}`;
}

function fmtDateTimePukul(d) {
  if (!d) return '-';
  const dateObj = new Date(d);
  const tgl = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const jam = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
  return `${tgl}\nPukul ${jam}`;
}

function initDoc() {
  const doc = new PDFDocument({ margin: 40, bufferPages: true, size: 'A4' });
  doc.registerFont('Cambria', 'C:\\Windows\\Fonts\\cambria.ttc', 'Cambria');
  doc.registerFont('Cambria-Bold', 'C:\\Windows\\Fonts\\cambriab.ttf');
  doc.registerFont('Cambria-Italic', 'C:\\Windows\\Fonts\\cambriai.ttf');
  doc.registerFont('Cambria-BoldItalic', 'C:\\Windows\\Fonts\\cambriaz.ttf');
  return doc;
}

const STATUS_LABEL = {
  reported:    'Dilaporkan',
  in_progress: 'Dalam Proses',
  resolved:    'Terselesaikan',
};

const LOG_STATUS_LABEL = {
  1: 'Laporan Dibuat',
  2: 'Diterima',
  3: 'Progres Perbaikan',
  4: 'Revisi',
  5: 'Selesai',
};

// ── PDF Builder Helpers ────────────────────────────────────────────────────────

/** Gambar header dokumen (logo teks + garis + subtitle) menggunakan Cambria */
function drawHeader(doc, subtitle) {
  const logoPath = path.join(__dirname, '../public/assets/images/logo-unand.png');
  let hasLogo = fs.existsSync(logoPath);
  
  if (hasLogo) {
    // Gambar logo di sebelah kiri
    doc.image(logoPath, 45, 40, { width: 55 });
    // Teks Kop Surat di sebelah kanan logo
    doc.fontSize(11).font('Cambria-Bold')
       .text('U N I V E R S I T A S   A N D A L A S', 110, 40, { align: 'center', width: 445 });
    doc.fontSize(14).font('Cambria-Bold')
       .text('FAKULTAS TEKNOLOGI INFORMASI', 110, 54, { align: 'center', width: 445 });
    doc.fontSize(9).font('Cambria')
       .text('Kampus Universitas Andalas, Limau Manis, Padang - 25163', 110, 72, { align: 'center', width: 445 });
    doc.fontSize(7.5).font('Cambria')
       .text('Telp: 0751-9824667 Website: http://fti.unand.ac.id email: sekretariat@it.unand.ac.id', 110, 84, { align: 'center', width: 445 });
  } else {
    // Jika logo tidak ada, gambar teks biasa terpusat penuh
    doc.fontSize(11).font('Cambria-Bold')
       .text('U N I V E R S I T A S   A N D A L A S', 40, 40, { align: 'center', width: 515 });
    doc.fontSize(14).font('Cambria-Bold')
       .text('FAKULTAS TEKNOLOGI INFORMASI', 40, 54, { align: 'center', width: 515 });
    doc.fontSize(9).font('Cambria')
       .text('Kampus Universitas Andalas, Limau Manis, Padang - 25163', 40, 72, { align: 'center', width: 515 });
    doc.fontSize(7.5).font('Cambria')
       .text('Telp: 0751-9824667 Website: http://fti.unand.ac.id email: sekretariat@it.unand.ac.id', 40, 84, { align: 'center', width: 515 });
  }

  // Garis Kop Surat
  const yLine = 112;
  doc.moveTo(40, yLine).lineTo(555, yLine).lineWidth(1.5).stroke('#000000');
  doc.moveTo(40, yLine + 2).lineTo(555, yLine + 2).lineWidth(0.5).stroke('#000000');
  doc.y = yLine + 10;
  doc.moveDown(0.4);

  // Sub-judul dokumen di tengah
  doc.fontSize(12).font('Cambria-Bold')
     .text(subtitle.toUpperCase(), 40, doc.y, { align: 'center', width: 515 });
  doc.moveDown(0.5);
}

/** Gambar satu baris label: nilai (Cambria, Size 12) */
function drawField(doc, label, value, xLabel, xValue, y, opts = {}) {
  const labelW  = opts.labelW  || 170;
  const valueW  = opts.valueW  || 345;
  doc.fontSize(12).font('Cambria-Bold')
     .text(label + ':', xLabel, y, { width: labelW, lineBreak: false });
  doc.fontSize(12).font('Cambria')
     .text(String(value || '-'), xValue, y, { width: valueW });
}

/** Gambar header tabel (Cambria) */
function drawTableHeader(doc, columns, y) {
  doc.rect(40, y, 515, 20).stroke('#000000');
  let x = 40;
  columns.forEach(col => {
    doc.rect(x, y, col.w, 20).stroke('#000000');
    doc.fontSize(10).font('Cambria-Bold').fillColor('#000000')
       .text(col.label, x + 4, y + 5, { width: col.w - 8, align: col.align || 'left' });
    x += col.w;
  });
  doc.fillColor('#000000');
  return y + 20;
}

/** Gambar satu baris tabel (auto height, Cambria) */
function drawTableRow(doc, columns, row, y, isEven) {
  // Hitung tinggi baris berdasarkan teks/gambar terpanjang/tertinggi
  let maxH = 18;
  columns.forEach((col, i) => {
    const val = row[i];
    if (val && typeof val === 'object' && val.type === 'image') {
      const imgH = val.height || 60;
      if (imgH + 10 > maxH) maxH = imgH + 10;
    } else {
      const valStr = String(val || '-');
      const textH = doc.heightOfString(valStr, { width: col.w - 8, fontSize: 10 });
      if (textH + 8 > maxH) maxH = textH + 8;
    }
  });

  if (isEven) {
    doc.rect(40, y, 515, maxH).fill('#F0F4FF');
  }
  doc.rect(40, y, 515, maxH).stroke('#CCCCCC');

  let x = 40;
  columns.forEach((col, i) => {
    doc.rect(x, y, col.w, maxH).stroke('#CCCCCC');
    const val = row[i];
    if (val && typeof val === 'object' && val.type === 'image') {
      if (val.path && fs.existsSync(val.path)) {
        try {
          doc.image(val.path, x + 5, y + 5, { fit: [col.w - 10, maxH - 10], align: 'center', valign: 'center' });
        } catch (e) {
          doc.fontSize(10).font('Cambria').fillColor('#000000')
             .text('-', x + 4, y + 4, { width: col.w - 8, align: 'center' });
        }
      } else {
        doc.fontSize(10).font('Cambria').fillColor('#000000')
           .text('-', x + 4, y + 4, { width: col.w - 8, align: 'center' });
      }
    } else {
      doc.fontSize(10).font('Cambria').fillColor('#000000')
         .text(String(val || '-'), x + 4, y + 4, { width: col.w - 8 });
    }
    x += col.w;
  });
  return y + maxH;
}

/** Gambar footer (nomor halaman & tanggal cetak, Cambria) */
function addPageNumbers(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    
    // Matikan sementara bottom margin untuk mencegah autoPageBreak PDFKit
    const oldBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    // Garis pembatas footer
    doc.moveTo(40, doc.page.height - 35).lineTo(555, doc.page.height - 35)
       .lineWidth(0.5).stroke('#CCCCCC');

    // Tanggal cetak di sebelah kiri
    doc.fontSize(8.5).font('Cambria').fillColor('#777777')
       .text(
         `Dicetak pada: ${fmtDateTime(new Date())}`,
         40, doc.page.height - 30,
         { align: 'left', width: 250 }
       );

    // Nomor halaman di sebelah kanan
    doc.fontSize(8.5).font('Cambria').fillColor('#777777')
       .text(
         `Halaman ${i + 1} dari ${range.count}`,
         305, doc.page.height - 30,
         { align: 'right', width: 250 }
       );

    // Kembalikan margin bawah semula
    doc.page.margins.bottom = oldBottomMargin;
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
      `SELECT rmrl.logged_at, rmrl.log, rmrl.description, rmrl.status, rmrl.log_file,
              e.name AS logged_by_name
       FROM room_maintenance_request_log rmrl
       LEFT JOIN employees e ON rmrl.logged_by = e.id
       WHERE rmrl.room_maintenance_request_id = ?
       ORDER BY rmrl.created_at ASC`,
      [id]
    );

    const initialLog = logs.find(lg => lg.status === 1);
    const photoUrl = initialLog && initialLog.log_file ? initialLog.log_file : null;
    const imgPath = photoUrl ? path.join(__dirname, '../public', photoUrl) : null;
    const hasPhoto = imgPath && fs.existsSync(imgPath);

    // Buat PDF
    const doc      = initDoc();
    const filename = `bukti-laporan-LPR-${String(id).padStart(5, '0')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    drawHeader(doc, 'Bukti Laporan Kerusakan Ruangan');

    // Nomor Laporan (besar)
    doc.fontSize(14).font('Cambria-Bold').fillColor('#2563EB')
       .text(`LPR-${String(laporan.id).padStart(5, '0')}`, 40, doc.y, { align: 'center', width: 515 });
    doc.fillColor('#000000');
    doc.moveDown(0.4);

    // Section: Info Laporan
    doc.fontSize(12).font('Cambria-Bold').text('Informasi Laporan', 40);
    doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.3);

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
      drawField(doc, label, val, 40, 220, y);
      doc.moveDown(0.4);
    });

    doc.moveDown(0.3);

    // Deskripsi kerusakan
    doc.fontSize(12).font('Cambria-Bold').text('Deskripsi Kerusakan', 40);
    doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.3);
    const descH = doc.heightOfString(laporan.issue_description, { width: 501, fontSize: 11 }) + 14;
    const boxY = doc.y;
    doc.rect(40, boxY, 515, descH).fill('#F8FAFF');
    doc.fontSize(11).font('Cambria').fillColor('#000000')
       .text(laporan.issue_description, 47, boxY + 7, { width: 501 });
    doc.y = boxY + descH;
    doc.moveDown(0.6);

    // Render foto jika dilampirkan pelapor
    if (hasPhoto) {
      doc.moveDown(0.4);
      checkPageBreak(doc, 190);
      doc.fontSize(12).font('Cambria-Bold').text('Foto Kerusakan', 40);
      doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
      doc.moveDown(0.5);

      try {
        doc.image(imgPath, { fit: [240, 160] });
      } catch (e) {
        doc.fontSize(11).font('Cambria-Italic').fillColor('#888888').text('Gagal memuat foto kerusakan.');
        doc.fillColor('#000000');
      }
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

    const doc      = initDoc();
    const filename = `rekap-laporan-${bulan}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    drawHeader(doc, `Rekap Laporan Maintenance Ruangan\nBULAN ${namaBulan}`);

    // Ringkasan statistik
    doc.fontSize(12).font('Cambria-Bold').text('Ringkasan Statistik', 40);
    doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.3);

    // Kotak statistik 4 kolom (lebar total 515)
    const boxW = 122, boxH = 52, boxGap = 9;
    const boxY = doc.y;
    const stats = [
      { label: 'Total Laporan', val: total,      color: '#2563EB' },
      { label: 'Dilaporkan',    val: dilaporkan,  color: '#D97706' },
      { label: 'Dalam Proses',  val: proses,      color: '#7C3AED' },
      { label: 'Selesai',       val: selesai,     color: '#15803D' },
    ];
    stats.forEach((s, i) => {
      const bx = 40 + i * (boxW + boxGap);
      doc.rect(bx, boxY, boxW, boxH).fill('#F8FAFF').stroke('#DDDDDD');
      doc.fontSize(22).font('Cambria-Bold').fillColor(s.color)
         .text(String(s.val), bx, boxY + 6, { width: boxW, align: 'center' });
      doc.fontSize(9).font('Cambria').fillColor('#555555')
         .text(s.label, bx, boxY + 32, { width: boxW, align: 'center' });
    });
    doc.fillColor('#000000');
    doc.y = boxY + boxH + 20;
    doc.moveDown(0.3);

    // Tabel laporan
    doc.fontSize(12).font('Cambria-Bold').text('Daftar Laporan', 40);
    doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.3);

    if (laporan.length === 0) {
      doc.fontSize(11).font('Cambria').fillColor('#888888')
         .text('Tidak ada laporan pada periode ini.');
      doc.fillColor('#000000');
    } else {
      const cols = [
        { label: 'No',                 w: 30,  align: 'center' },
        { label: 'Tanggal Pelaporan',  w: 100 },
        { label: 'Nama Pelapor',       w: 105 },
        { label: 'Ruang',              w: 105 },
        { label: 'Gedung',             w: 85  },
        { label: 'Status',             w: 90  },
      ];
      checkPageBreak(doc, 40);
      let tY = drawTableHeader(doc, cols, doc.y);
      
      laporan.forEach((l, i) => {
        const txtTgl     = fmtDate(l.reported_at);
        const txtPelapor = l.reported_by || '-';
        const txtRuang   = l.room_name || '-';
        const txtGedung  = l.building_name || '-';
        const txtStatus  = STATUS_LABEL[l.status] || l.status || '-';
        
        const hTgl     = doc.heightOfString(txtTgl,     { width: 100 - 8, fontSize: 10 });
        const hPelapor = doc.heightOfString(txtPelapor, { width: 105 - 8, fontSize: 10 });
        const hRuang   = doc.heightOfString(txtRuang,   { width: 105 - 8, fontSize: 10 });
        const hGedung  = doc.heightOfString(txtGedung,  { width: 85 - 8,  fontSize: 10 });
        const hStatus  = doc.heightOfString(txtStatus,  { width: 90 - 8,  fontSize: 10 });
        
        const h1 = Math.max(hTgl, hPelapor, hRuang, hGedung, hStatus) + 10;
        
        const txtDesc = `Deskripsi: ${l.issue_description || '-'}`;
        const h2 = doc.heightOfString(txtDesc, { width: 485 - 8, fontSize: 10 }) + 10;
        const hRecord = h1 + h2;
        
        const didBreak = checkPageBreak(doc, hRecord);
        if (didBreak) {
          tY = drawTableHeader(doc, cols, doc.y);
        }
        
        if (i % 2 === 0) {
          doc.rect(40, tY, 515, hRecord).fill('#F9FAFB');
        }
        
        doc.rect(40, tY, 515, hRecord).stroke('#000000');
        doc.moveTo(70, tY).lineTo(70, tY + hRecord).stroke('#000000');
        doc.moveTo(70, tY + h1).lineTo(555, tY + h1).stroke('#000000');
        
        let x = 70;
        const row1Cols = [100, 105, 105, 85, 90];
        row1Cols.slice(0, 4).forEach(w => {
          x += w;
          doc.moveTo(x, tY).lineTo(x, tY + h1).stroke('#000000');
        });
        
        doc.fontSize(10).font('Cambria-Bold').fillColor('#000000')
           .text(String(i + 1), 40, tY + (hRecord - 10) / 2, { width: 30, align: 'center' });
           
        doc.fontSize(10).font('Cambria');
        doc.text(txtTgl,     74,  tY + (h1 - hTgl) / 2,     { width: 100 - 8 });
        doc.text(txtPelapor, 174, tY + (h1 - hPelapor) / 2,  { width: 105 - 8 });
        doc.text(txtRuang,   279, tY + (h1 - hRuang) / 2,    { width: 105 - 8 });
        doc.text(txtGedung,  384, tY + (h1 - hGedung) / 2,   { width: 85 - 8 });
        doc.text(txtStatus,  469, tY + (h1 - hStatus) / 2,   { width: 90 - 8 });
        
        doc.text(txtDesc, 74, tY + h1 + 5, { width: 485 - 8 });
        
        tY += hRecord;
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

    const doc      = initDoc();
    const filename = `permohonan-maintenance-MNT-${String(id).padStart(5, '0')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    drawHeader(doc, 'Surat Permohonan Maintenance Ruangan');

    // Nomor permohonan
    doc.fontSize(14).font('Cambria-Bold').fillColor('#2563EB')
       .text(`MNT-${String(laporan.id).padStart(5, '0')}`, 40, doc.y, { align: 'center', width: 515 });
    doc.fillColor('#000000');
    doc.moveDown(0.4);

    // Info
    doc.fontSize(12).font('Cambria-Bold').text('Data Permohonan', 40);
    doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.3);

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
      drawField(doc, label, val, 40, 230, y);
      doc.moveDown(0.4);
    });

    doc.moveDown(0.3);

    // Deskripsi
    doc.fontSize(12).font('Cambria-Bold').text('Deskripsi Kerusakan', 40);
    doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.3);
    const descH = doc.heightOfString(laporan.issue_description, { width: 501, fontSize: 11 }) + 14;
    const boxY = doc.y;
    doc.rect(40, boxY, 515, descH).fill('#FFF8F0');
    doc.fontSize(11).font('Cambria').fillColor('#000000')
       .text(laporan.issue_description, 47, boxY + 7, { width: 501 });
    doc.y = boxY + descH;
    doc.moveDown(0.5);

    // Kolom tanda tangan
    doc.fontSize(12).font('Cambria-Bold').text('Persetujuan', 40);
    doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.4);

    const sigY = doc.y;
    // Kotak TTD kiri
    doc.rect(40, sigY, 230, 75).stroke('#CCCCCC');
    doc.fontSize(10).font('Cambria').text('Penanggung Jawab', 40, sigY + 6, { width: 230, align: 'center' });
    doc.fontSize(10).font('Cambria-Bold').text(laporan.penanggung_jawab_name, 40, sigY + 58, { width: 230, align: 'center' });

    // Kotak TTD kanan
    doc.rect(325, sigY, 230, 75).stroke('#CCCCCC');
    doc.fontSize(10).font('Cambria').text('Pengelola Aset', 325, sigY + 6, { width: 230, align: 'center' });
    doc.fontSize(10).font('Cambria-Bold').text(laporan.pengelola_name || '_______________', 325, sigY + 58, { width: 230, align: 'center' });

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

    if (laporan.status !== 'resolved') {
      req.session.flash = {
        type: 'error',
        message: 'PDF hasil perbaikan belum dapat diunduh karena permohonan belum dinyatakan selesai/ditutup.'
      };
      return res.redirect(`/penugasan/${id}`);
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

    const doc      = initDoc();
    const filename = `hasil-perbaikan-PNT-${String(id).padStart(5, '0')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    drawHeader(doc, 'Laporan Hasil Perbaikan Ruangan');

    doc.fontSize(14).font('Cambria-Bold').fillColor('#15803D')
       .text(`PNT-${String(laporan.id).padStart(5, '0')}`, 40, doc.y, { align: 'center', width: 515 });
    doc.fillColor('#000000');
    doc.moveDown(0.4);

    // Info ringkas
    doc.fontSize(12).font('Cambria-Bold').text('Informasi Perbaikan', 40);
    doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.3);

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
      drawField(doc, label, val, 40, 220, y);
      doc.moveDown(0.4);
    });

    doc.moveDown(0.3);

    // Deskripsi kerusakan
    doc.fontSize(12).font('Cambria-Bold').text('Deskripsi Kerusakan Awal', 40);
    doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.3);
    const descH = doc.heightOfString(laporan.issue_description, { width: 501, fontSize: 11 }) + 14;
    const boxY2 = doc.y;
    doc.rect(40, boxY2, 515, descH).fill('#FFF8F0');
    doc.fontSize(11).font('Cambria').fillColor('#000000')
       .text(laporan.issue_description, 47, boxY2 + 7, { width: 501 });
    doc.y = boxY2 + descH;
    doc.moveDown(0.5);

    // Tabel progres
    doc.fontSize(12).font('Cambria-Bold')
       .text(`Rekap Progres Perbaikan (${progresOnly.length} update)`, 40);
    doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.3);

    if (progresOnly.length === 0) {
      doc.fontSize(11).font('Cambria').fillColor('#888888').text('Belum ada update progres.');
      doc.fillColor('#000000');
    } else {
      const cols = [
        { label: 'Ke-',       w: 30  },
        { label: 'Tanggal',   w: 95  },
        { label: 'Deskripsi Pekerjaan', w: 280 },
        { label: 'Foto',      w: 110 },
      ];
      checkPageBreak(doc, 40);
      let tY = drawTableHeader(doc, cols, doc.y);
      progresOnly.forEach((p, i) => {
        const imgPath = p.log_file ? path.join(__dirname, '../public', p.log_file) : null;
        const hasImg = imgPath && fs.existsSync(imgPath);
        const neededSpace = hasImg ? 75 : 35;
        checkPageBreak(doc, neededSpace);
        if (doc.y !== tY) tY = doc.y;

        const fotoCell = hasImg
          ? { type: 'image', path: imgPath, height: 60 }
          : '-';

        const row = [
          String(i + 1),
          fmtDateTimePukul(p.logged_at),
          p.description || '-',
          fotoCell,
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

    const doc      = initDoc();
    const filename = `laporan-LPR-${String(id).padStart(5, '0')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    drawHeader(doc, 'Detail Laporan Kerusakan Ruangan');

    doc.fontSize(14).font('Cambria-Bold').fillColor('#2563EB')
       .text(`LPR-${String(laporan.id).padStart(5, '0')}`, 40, doc.y, { align: 'center', width: 515 });
    doc.fillColor('#000000');
    doc.moveDown(0.4);

    doc.fontSize(12).font('Cambria-Bold').text('Informasi Laporan', 40);
    doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.3);

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
      drawField(doc, label, val, 40, 220, y);
      doc.moveDown(0.4);
    });

    doc.moveDown(0.3);
    doc.fontSize(12).font('Cambria-Bold').text('Deskripsi Kerusakan', 40);
    doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.3);
    const descH = doc.heightOfString(laporan.issue_description, { width: 501, fontSize: 11 }) + 14;
    const boxY = doc.y;
    doc.rect(40, boxY, 515, descH).fill('#F8FAFF');
    doc.fontSize(11).font('Cambria').fillColor('#000000')
       .text(laporan.issue_description, 47, boxY + 7, { width: 501 });
    doc.y = boxY + descH;
    doc.moveDown(0.6);

    doc.fontSize(12).font('Cambria-Bold').text('Riwayat Perbaikan', 40);
    doc.moveTo(40, doc.y + 1).lineTo(555, doc.y + 1).lineWidth(0.5).stroke('#CCCCCC');
    doc.moveDown(0.3);

    if (logs.length === 0) {
      doc.fontSize(11).font('Cambria').fillColor('#888888').text('Belum ada riwayat.');
      doc.fillColor('#000000');
    } else {
      const cols = [
        { label: 'Tanggal',    w: 130 },
        { label: 'Keterangan', w: 185 },
        { label: 'Deskripsi',  w: 130 },
        { label: 'Oleh',       w: 70  },
      ];
      checkPageBreak(doc, 40);
      let tY = drawTableHeader(doc, cols, doc.y);
      logs.forEach((lg, i) => {
        checkPageBreak(doc, 35);
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
