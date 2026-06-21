/**
 * scripts/seed_transactions.js
 * Seed database dengan data transaksi dummy untuk bulan Mei dan Juni 2026
 * Idempotent: aman dijalankan berulang kali
 * Jalankan dengan: node scripts/seed_transactions.js
 */

require('dotenv').config();
const db = require('../lib/db');

function log(msg) { console.log(`\n[SEED-TRANS] ${msg}`); }
function ok(msg)  { console.log(`  ✓  ${msg}`); }
function skip(msg) { console.log(`  –  ${msg} (sudah ada, dilewati)`); }

// Helper untuk memetakan deskripsi ke foto dummy kerusakan/progres yang sesuai
function getDummyPhoto(desc, type = 'laporan') {
  const d = desc.toLowerCase();
  const suffix = type === 'laporan' ? '' : '_fix';
  const folder = type === 'laporan' ? 'laporan' : 'progres';
  
  if (d.includes('ac') || d.includes('kipas') || d.includes('air') || d.includes('pipa') || d.includes('wastafel')) {
    return `/uploads/${folder}/dummy_ac${suffix}.png`;
  }
  if (d.includes('kursi') || d.includes('meja') || d.includes('papan') || d.includes('pintu') || d.includes('engsel') || d.includes('plafon') || d.includes('atap') || d.includes('cat') || d.includes('dinding') || d.includes('jendela')) {
    return `/uploads/${folder}/dummy_kursi${suffix}.png`;
  }
  // Default untuk elektronik / listrik / yang lainnya
  return `/uploads/${folder}/dummy_stopkontak${suffix}.png`;
}

async function main() {
  log('Starting transaction database seeding...');

  try {
    // 1. Ambil peta ruangan: code -> { id, responsible_employee_id }
    const [rooms] = await db.query('SELECT id, code, name, responsible_employee_id FROM rooms');
    const roomMap = {};
    rooms.forEach(r => {
      roomMap[r.code] = {
        id: r.id,
        name: r.name,
        pjId: r.responsible_employee_id
      };
    });

    // 2. Ambil peta pengguna: email -> id
    const [users] = await db.query('SELECT id, email FROM users');
    const userMap = {};
    users.forEach(u => {
      userMap[u.email] = u.id;
    });

    // Pengelola Aset Budi Santoso (ID: 7, email: pengelola@unand.ac.id)
    const pengelolaId = userMap['pengelola@unand.ac.id'] || 7;

    // 3. Dataset Transaksi Komprehensif
    const reportsData = [
      // ─── MEI 2026 ───
      // Minggu 1
      {
        roomCode: 'RM-DSI-SEM',
        reporterEmail: 'pengguna1@unand.ac.id',
        desc: 'AC mati tidak dingin di ruang seminar, mahasiswa kepanasan',
        status: 'resolved',
        date: '2026-05-03 09:00:00',
        resolvedDate: '2026-05-04 15:30:00'
      },
      {
        roomCode: 'RM-TK-SEM',
        reporterEmail: 'pengguna2@unand.ac.id',
        desc: 'Kursi kuliah patah di baris ketiga dekat pintu masuk utama',
        status: 'resolved',
        date: '2026-05-05 10:15:00',
        resolvedDate: '2026-05-06 14:00:00'
      },
      {
        roomCode: 'RM-INF-SEM',
        reporterEmail: 'pengguna1@unand.ac.id',
        desc: 'Layar proyektor robek di bagian sudut kanan bawah',
        status: 'resolved',
        date: '2026-05-07 11:30:00',
        resolvedDate: '2026-05-07 17:00:00'
      },
      // Minggu 2
      {
        roomCode: 'RM-DSI-RDBI',
        reporterEmail: 'pengguna2@unand.ac.id',
        desc: 'Stopkontak korsleting mengeluarkan percikan api saat dicolok charger',
        status: 'resolved',
        date: '2026-05-10 08:30:00',
        resolvedDate: '2026-05-11 11:00:00'
      },
      {
        roomCode: 'RM-TK-LKJ',
        reporterEmail: 'pengguna1@unand.ac.id',
        desc: 'Router WiFi tidak ada sinyal, lampu indikator warna merah berkedip',
        status: 'in_progress',
        date: '2026-05-12 14:00:00'
      },
      {
        roomCode: 'RM-INF-LKI',
        reporterEmail: 'pengguna3@unand.ac.id',
        desc: 'Pintu tidak bisa dikunci dari luar, slot kunci macet/berkarat',
        status: 'reported',
        date: '2026-05-14 16:45:00'
      },
      // Minggu 3
      {
        roomCode: 'RM-DSI-SE',
        reporterEmail: 'pengguna2@unand.ac.id',
        desc: 'Lampu ruangan kedap-kedip mengganggu kenyamanan praktikum mahasiswa',
        status: 'in_progress',
        date: '2026-05-17 09:15:00',
        hasRevision: true,
        revisionText: 'Mohon ganti dengan bohlam LED hemat energi, jangan merek biasa agar tidak cepat putus.'
      },
      {
        roomCode: 'RM-TK-RESLAB',
        reporterEmail: 'pengguna1@unand.ac.id',
        desc: 'Kipas angin bergetar kencang dan suaranya berisik sekali mengganggu konsentrasi',
        status: 'resolved',
        date: '2026-05-19 13:00:00',
        resolvedDate: '2026-05-20 16:30:00'
      },
      {
        roomCode: 'RM-INF-SEM',
        reporterEmail: 'pengguna2@unand.ac.id',
        desc: 'Atap bocor saat hujan deras di dekat meja pembicara seminar',
        status: 'in_progress',
        date: '2026-05-21 15:30:00'
      },
      // Minggu 4
      {
        roomCode: 'RM-DSI-TKITI',
        reporterEmail: 'pengguna1@unand.ac.id',
        desc: 'Pipa air wastafel bocor di bawah wastafel bagian kanan',
        status: 'reported',
        date: '2026-05-24 10:00:00'
      },
      {
        roomCode: 'RM-TK-DIGI',
        reporterEmail: 'pengguna2@unand.ac.id',
        desc: 'Meja instruktur retak di bagian penyangga kaki bawah kiri',
        status: 'in_progress',
        date: '2026-05-27 11:00:00',
        hasRevision: true,
        revisionText: 'Perbaikan kaki meja kurang kokoh, tolong disolder/lem besi ulang lebih kuat.'
      },
      {
        roomCode: 'RM-INF-LKI',
        reporterEmail: 'pengguna1@unand.ac.id',
        desc: 'AC mengeluarkan air dingin berlebih dan menetes ke lantai Lab',
        status: 'resolved',
        date: '2026-05-29 08:45:00',
        resolvedDate: '2026-05-30 13:15:00'
      },
  
      // ─── JUNI 2026 ───
      // Minggu 1
      {
        roomCode: 'RM-DSI-SEM',
        reporterEmail: 'pengguna1@unand.ac.id',
        desc: 'Plafon retak berpotensi jatuh di area tengah tempat duduk mahasiswa',
        status: 'resolved',
        date: '2026-06-02 09:30:00',
        resolvedDate: '2026-06-03 16:00:00'
      },
      {
        roomCode: 'RM-TK-LKJ',
        reporterEmail: 'pengguna2@unand.ac.id',
        desc: 'PC Laboratorium nomor 12 mati total tidak mau menyala sama sekali',
        status: 'resolved',
        date: '2026-06-04 10:00:00',
        resolvedDate: '2026-06-05 15:45:00'
      },
      {
        roomCode: 'RM-INF-SEM',
        reporterEmail: 'pengguna1@unand.ac.id',
        desc: 'Kursi dosen patah kakinya sehingga tidak bisa digunakan untuk mengajar',
        status: 'resolved',
        date: '2026-06-06 11:15:00',
        resolvedDate: '2026-06-07 14:30:00'
      },
      // Minggu 2
      {
        roomCode: 'RM-DSI-RDBI',
        reporterEmail: 'pengguna3@unand.ac.id',
        desc: 'Kabel HDMI proyektor hilang di meja instruktur Lab',
        status: 'in_progress',
        date: '2026-06-09 13:45:00'
      },
      {
        roomCode: 'RM-TK-RESLAB',
        reporterEmail: 'pengguna2@unand.ac.id',
        desc: 'Papan tulis kotor dan sulit dihapus karena noda spidol permanen',
        status: 'reported',
        date: '2026-06-10 16:00:00'
      },
      {
        roomCode: 'RM-INF-LKI',
        reporterEmail: 'pengguna1@unand.ac.id',
        desc: 'Mouse Lab PC nomor 5 tidak berfungsi tombol klik kirinya',
        status: 'in_progress',
        date: '2026-06-11 08:15:00',
        hasRevision: true,
        revisionText: 'Mouse baru masih macet tombol scrollnya, tolong diganti unit baru yang normal.'
      },
      // Minggu 3
      {
        roomCode: 'RM-DSI-SE',
        reporterEmail: 'pengguna1@unand.ac.id',
        desc: 'Tampilan proyektor buram dan tidak fokus walau sudah disetel lensanya',
        status: 'reported',
        date: '2026-06-13 14:00:00'
      },
      {
        roomCode: 'RM-TK-DIGI',
        reporterEmail: 'pengguna2@unand.ac.id',
        desc: 'Switch hub overheat sering membuat koneksi internet Lab putus sendiri',
        status: 'in_progress',
        date: '2026-06-15 15:00:00'
      },
      {
        roomCode: 'RM-INF-SEM',
        reporterEmail: 'pengguna1@unand.ac.id',
        desc: 'Engsel jendela sebelah kiri longgar dan rawan jatuh saat ditiup angin kencang',
        status: 'reported',
        date: '2026-06-17 10:30:00'
      },
      // Minggu 4
      {
        roomCode: 'RM-DSI-TKITI',
        reporterEmail: 'pengguna2@unand.ac.id',
        desc: 'AC bergetar berisik sekali mengganggu suara penjelasan dosen di kelas',
        status: 'resolved',
        date: '2026-06-22 09:00:00',
        resolvedDate: '2026-06-23 15:00:00'
      },
      {
        roomCode: 'RM-TK-SEM',
        reporterEmail: 'pengguna1@unand.ac.id',
        desc: 'Cat dinding terkelupas lembab karena rembesan air hujan di dinding luar',
        status: 'reported',
        date: '2026-06-25 11:30:00'
      },
      {
        roomCode: 'RM-INF-LKI',
        reporterEmail: 'pengguna2@unand.ac.id',
        desc: 'Keyboard Lab PC nomor 8 macet beberapa tombol hurufnya tidak responsif',
        status: 'in_progress',
        date: '2026-06-28 14:15:00'
      }
    ];

    // Ambil log ID terakhir untuk increment
    let [[{ maxId }]] = await db.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM room_maintenance_request_log');
    let logId = maxId;

    for (const r of reportsData) {
      const room = roomMap[r.roomCode];
      const reporterId = userMap[r.reporterEmail];

      if (!room) {
        console.error(`  ✗ Room "${r.roomCode}" tidak ditemukan`);
        continue;
      }
      if (!reporterId) {
        console.error(`  ✗ Reporter "${r.reporterEmail}" tidak ditemukan`);
        continue;
      }

      // Cek apakah data sudah pernah di-seed
      const [[ex]] = await db.query(
        `SELECT id FROM room_maintenance_requests 
         WHERE room_id = ? AND issue_description = ? AND DATE_FORMAT(reported_at, '%Y-%m-%d %H:%i:%s') = ?`,
        [room.id, r.desc, r.date]
      );

      if (ex) {
        skip(`Laporan: ${r.roomCode} - ${r.desc.substring(0, 30)}...`);
        continue;
      }

      // Insert ke room_maintenance_requests
      const [insRequest] = await db.query(
        `INSERT INTO room_maintenance_requests 
           (room_id, reported_by, issue_description, status, reported_at, resolved_at, employee_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          room.id,
          reporterId,
          r.desc,
          r.status,
          r.date,
          r.status === 'resolved' ? r.resolvedDate : null,
          r.status === 'reported' ? room.pjId : pengelolaId,
          r.date,
          r.status === 'resolved' ? r.resolvedDate : r.date
        ]
      );
      const requestId = insRequest.insertId;

      // ── LOG SEEDING ──
      
      // Log 1: Laporan Dibuat (Status: 1)
      logId++;
      const reportedPhoto = getDummyPhoto(r.desc, 'laporan');
      await db.query(
        `INSERT INTO room_maintenance_request_log
           (id, room_maintenance_request_id, log, logged_by, logged_at, log_file, description, status, created_at, updated_at)
         VALUES (?, ?, 'Laporan dibuat', ?, ?, ?, ?, 1, ?, ?)`,
        [logId, requestId, reporterId, r.date, reportedPhoto, r.desc, r.date, r.date]
      );

      // Log 2: Diterima oleh PJ (Status: 2) jika status != reported
      if (r.status !== 'reported') {
        const acceptDate = new Date(new Date(r.date).getTime() + 60 * 60 * 1000); // +1 Jam
        logId++;
        await db.query(
          `INSERT INTO room_maintenance_request_log
             (id, room_maintenance_request_id, log, logged_by, logged_at, description, status, created_at, updated_at)
           VALUES (?, ?, 'Laporan disetujui & ditugaskan', ?, ?, 'Pekerjaan ditugaskan ke Pengelola Aset.', 2, ?, ?)`,
          [logId, requestId, room.pjId, acceptDate, acceptDate, acceptDate]
        );

        // Log 3: Progres Perbaikan oleh Pengelola (Status: 3)
        const progressDate = new Date(new Date(r.date).getTime() + 2 * 60 * 60 * 1000); // +2 Jam
        logId++;
        const progressPhoto = getDummyPhoto(r.desc, 'progres');
        await db.query(
          `INSERT INTO room_maintenance_request_log
             (id, room_maintenance_request_id, log, logged_by, logged_at, log_file, description, status, created_at, updated_at)
           VALUES (?, ?, 'Progres perbaikan berjalan', ?, ?, ?, 'Pengecekan dan perbaikan awal oleh tim pengelola.', 3, ?, ?)`,
          [logId, requestId, pengelolaId, progressDate, progressPhoto, progressDate, progressDate]
        );

        // Log 4: Revisi oleh PJ jika ada hasRevision (Status: 4)
        if (r.hasRevision) {
          const revisionDate = new Date(new Date(r.date).getTime() + 4 * 60 * 60 * 1000); // +4 Jam
          logId++;
          await db.query(
            `INSERT INTO room_maintenance_request_log
               (id, room_maintenance_request_id, log, logged_by, logged_at, description, status, created_at, updated_at)
             VALUES (?, ?, 'Revisi diminta', ?, ?, ?, 4, ?, ?)`,
            [logId, requestId, room.pjId, revisionDate, r.revisionText, revisionDate, revisionDate]
          );
        }

        // Log 5: Selesai (Status: 5) jika status == resolved
        if (r.status === 'resolved') {
          const resolveDate = new Date(r.resolvedDate);
          logId++;
          await db.query(
            `INSERT INTO room_maintenance_request_log
               (id, room_maintenance_request_id, log, logged_by, logged_at, description, status, created_at, updated_at)
             VALUES (?, ?, 'Pekerjaan dinyatakan selesai', ?, ?, 'Verifikasi selesai, permohonan ditutup oleh Penanggung Jawab.', 5, ?, ?)`,
            [logId, requestId, room.pjId, resolveDate, resolveDate, resolveDate]
          );
        }
      }

      ok(`Laporan ${r.roomCode} ("${r.desc.substring(0, 30)}...") berhasil dibuat dengan status "${r.status}"`);
    }

    log('Transaction seeding completed successfully!');
  } catch (err) {
    console.error('\n  ✗ Error seeding transactions:', err.message);
    console.error(err);
  } finally {
    await db.end();
  }
}

main();
