const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const statePath = path.join(__dirname, 'fixtures', 'test-state.json');
const FOTO_PATH = path.join(__dirname, 'fixtures', 'foto-kerusakan.png');

// Helper: Buat laporan baru oleh Mahasiswa
async function createReport(page, description, uniqueKeyword) {
  await page.goto('/login');
  if (page.url().endsWith('/login')) {
    await page.fill('input[name="username"]', 'pengguna2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/laporan');
  } else {
    await page.goto('/laporan');
  }

  await page.goto('/laporan/buat');
  await page.selectOption('#building_select', 'Gedung Departemen Teknik Komputer');
  await page.selectOption('#room_id', { label: 'Robotic & Embedded System Laboratory (Reslab) (RM-TK-RESLAB)' });
  await page.fill('#issue_description', description);
  await page.setInputFiles('#foto', FOTO_PATH);
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL('/laporan');
  await expect(page.getByText('Laporan berhasil dikirim!')).toBeVisible();
  
  // Temukan ID laporan berdasarkan kata kunci
  const row = page.locator('table tbody tr').filter({ hasText: uniqueKeyword }).first();
  const detailLink = row.locator('a:has-text("Detail")');
  const detailHref = await detailLink.getAttribute('href');
  const reportId = detailHref.split('/').pop() || '';
  return reportId;
}

test.describe('Setup - Membuat Laporan Uji Coba sebagai Mahasiswa', () => {
  test('Membuat Laporan Uji Coba', async ({ page }) => {
    // 1. Buat Laporan Utama (untuk tes edit, permohonan, revisi, dan close)
    const createdReportId = await createReport(
      page,
      'AC Bocor dan mengeluarkan suara bising yang sangat mengganggu perkuliahan.',
      'AC Bocor'
    );
    console.log(`Report created for maintenance test: LPR-${createdReportId}`);

    // Jeda waktu antar insert
    await page.waitForTimeout(1500);

    // 2. Buat Laporan Duplikat (untuk tes delete)
    const reportForDeleteId = await createReport(
      page,
      'Laporan duplikat untuk menguji fitur hapus laporan dari sisi Penanggung Jawab.',
      'Laporan duplikat'
    );
    console.log(`Report created for delete test: LPR-${reportForDeleteId}`);

    // Simpan state ID laporan
    fs.writeFileSync(statePath, JSON.stringify({ createdReportId, reportForDeleteId }));

    // Logout
    await page.goto('/logout');
    await expect(page).toHaveURL('/login');
  });
});

test.describe('Fitur 5 - Penanggung Jawab dapat memantau statistik laporan melalui dashboard', () => {
  test('Kondisi Normal - Memantau statistik laporan melalui dashboard', async ({ page }) => {
    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Cek kartu statistik dashboard
    await expect(page.locator('text=Total Laporan')).toBeVisible();
    await expect(page.locator('.stat-text-reported')).toBeVisible();
    await expect(page.locator('.stat-text-progress')).toBeVisible();
    await expect(page.locator('.stat-text-resolved')).toBeVisible();

    // Cek filter dashboard
    const filterSelect = page.locator('#filter-select');
    await expect(filterSelect).toBeVisible();
    await filterSelect.selectOption('my');
    await expect(page).toHaveURL(/\/pj\/dashboard\?filter=my/);
  });
});

test.describe('Fitur 6 - Penanggung Jawab dapat mencari laporan spesifik berdasarkan nama ruangan', () => {
  test('Kondisi Normal - Mencari laporan spesifik berdasarkan nama ruangan', async ({ page }) => {
    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka daftar laporan
    await page.goto('/pj/laporan');
    await expect(page.locator('h1')).toContainText('Daftar Laporan');

    // Cari ruangan "Robotic"
    await page.fill('input[name="search"]', 'Robotic');
    await page.locator('form[action="/pj/laporan"] button[type="submit"]').click();

    // Verifikasi hasil pencarian
    await expect(page).toHaveURL(/\/pj\/laporan\?search=Robotic/);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(rows.nth(i).locator('td').nth(1)).toContainText('Robotic');
      }
    }
  });

  test('Kondisi Alternatif - Mencari ruangan yang tidak ada di sistem', async ({ page }) => {
    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka daftar laporan
    await page.goto('/pj/laporan');
    await expect(page.locator('h1')).toContainText('Daftar Laporan');

    // Cari kata kunci fiktif
    await page.fill('input[name="search"]', 'Ruangan Fiktif Super Rahasia');
    await page.locator('form[action="/pj/laporan"] button[type="submit"]').click();

    // Verifikasi tampilan kosong
    await expect(page).toHaveURL(/\/pj\/laporan\?search=Ruangan\+Fiktif\+Super\+Rahasia/);
    await expect(page.locator('text=Tidak ada laporan yang cocok dengan filter.')).toBeVisible();
    await expect(page.locator('a:has-text("Tampilkan Semua Laporan")')).toBeVisible();
  });
});

test.describe('Fitur 7 - Penanggung Jawab dapat menampilkan daftar riwayat permintaan maintenance (Read)', () => {
  test('Kondisi Normal - Menampilkan daftar riwayat permintaan maintenance', async ({ page }) => {
    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka permohonan maintenance
    await page.goto('/pj/maintenance');
    await expect(page.locator('h1')).toContainText('Permohonan Maintenance');
    
    // Verifikasi tabel tampil
    await expect(page.locator('table')).toBeVisible();
  });

  test('Kondisi Alternatif - Menampilkan halaman kosong ketika pencarian permohonan maintenance tidak ditemukan', async ({ page }) => {
    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka permohonan maintenance
    await page.goto('/pj/maintenance');
    await expect(page.locator('h1')).toContainText('Permohonan Maintenance');

    // Cari ruangan fiktif
    await page.fill('input[name="search"]', 'Ruangan Fiktif Super Rahasia');
    await page.locator('button[type="submit"]:has-text("Cari")').click();

    // Verifikasi redirect & pesan kosong
    await expect(page).toHaveURL(/\/pj\/maintenance\?search=Ruangan\+Fiktif\+Super\+Rahasia/);
    await expect(page.locator('text=Tidak ada permohonan maintenance aktif yang cocok dengan filter.')).toBeVisible();
    await expect(page.locator('a:has-text("Tampilkan Semua")')).toBeVisible();
  });
});

test.describe('Fitur 8 - Penanggung Jawab dapat memperbarui data permintaan yang kurang lengkap (Update)', () => {
  test('Kondisi Normal - Memperbarui data permintaan yang kurang lengkap', async ({ page }) => {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const createdReportId = state.createdReportId;

    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka halaman edit laporan
    await page.goto(`/pj/laporan/${createdReportId}/edit`);
    await expect(page.locator('h1')).toContainText('Edit Laporan');

    // Ubah deskripsi kerusakan
    await page.fill('#issue_description', 'AC bocor parah di lab Reslab dan rembesan air menetes mengenai meja komputer.');
    await page.click('button[type="submit"]');

    // Verifikasi redirect & flash success
    await expect(page).toHaveURL(`/pj/laporan/${createdReportId}`);
    await expect(page.locator('.flash-success')).toBeVisible();
    await expect(page.locator('.flash-success')).toContainText('Laporan berhasil diperbarui');
  });

  test('Kondisi Alternatif 1 - Memperbarui data permintaan dengan deskripsi terlalu singkat (kurang dari 20 karakter)', async ({ page }) => {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const createdReportId = state.createdReportId;

    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka halaman edit laporan
    await page.goto(`/pj/laporan/${createdReportId}/edit`);
    await expect(page.locator('h1')).toContainText('Edit Laporan');

    // Isi deskripsi terlalu pendek
    await page.fill('#issue_description', 'AC Rusak');
    await page.click('button[type="submit"]');

    // Verifikasi error validasi
    await expect(page).toHaveURL(`/pj/laporan/${createdReportId}`);
    await expect(page.locator('text=Deskripsi kerusakan minimal 20 karakter.').first()).toBeVisible();
  });

  test('Kondisi Alternatif 2 - Mengedit data permintaan yang statusnya sudah bukan reported (sedang diproses atau selesai)', async ({ page }) => {
    const db = require('../lib/db');
    
    // Dapatkan ID PJ 2
    const [[pj2]] = await db.query("SELECT id FROM users WHERE email = 'pj2@unand.ac.id'");
    const pj2UserId = pj2.id;

    // Cari tiket diproses/selesai
    const [[processedRequest]] = await db.query(
      `SELECT rmr.id FROM room_maintenance_requests rmr
       JOIN rooms r ON rmr.room_id = r.id
       WHERE r.responsible_employee_id = ? AND rmr.status != 'reported'
       LIMIT 1`,
      [pj2UserId]
    );

    expect(processedRequest).toBeDefined();
    const processedReportId = processedRequest.id;

    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Akses edit tiket yang sudah diproses
    await page.goto(`/pj/laporan/${processedReportId}/edit`);

    // Verifikasi redirect & flash error
    await expect(page).toHaveURL(`/pj/laporan/${processedReportId}`);
    await expect(page.locator('.flash-error')).toBeVisible();
    await expect(page.locator('.flash-error')).toContainText('Laporan yang telah diproses tidak dapat diedit.');
  });

  test('Kondisi Alternatif 3 - Mengakses halaman edit untuk laporan yang tidak ada atau bukan wewenang PJ', async ({ page }) => {
    const idTidakValid = 999999999;

    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Akses edit laporan fiktif
    const response = await page.goto(`/pj/laporan/${idTidakValid}/edit`);
    expect(response?.status()).toBe(404);

    // Verifikasi halaman 404
    await expect(page.getByText('Laporan tidak ditemukan')).toBeVisible();
  });
});

test.describe('Fitur 9 - Penanggung Jawab dapat menghapus permintaan yang tidak valid atau duplikat (Delete)', () => {
  test('Kondisi Normal - Menghapus permintaan yang tidak valid atau duplikat', async ({ page }) => {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const reportForDeleteId = state.reportForDeleteId;

    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka daftar laporan
    await page.goto('/pj/laporan');

    // Klik tombol hapus
    const deleteBtn = page.locator(`button.action-btn-delete[onclick*="delete-dialog-${reportForDeleteId}"]`);
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Klik konfirmasi hapus
    const deleteDialog = page.locator(`#delete-dialog-${reportForDeleteId}`);
    await deleteDialog.locator('button:has-text("Ya, Hapus")').click();

    // Verifikasi flash success
    await expect(page.locator('.flash-success')).toBeVisible();
    await expect(page.locator('.flash-success')).toContainText('Laporan berhasil dihapus');
  });
});

test.describe('Fitur 10 - Penanggung Jawab dapat membuat laporan permohonan maintenance kepada Pengelola Aset (Create)', () => {
  test('Kondisi Normal - Membuat laporan permohonan maintenance', async ({ page }) => {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const createdReportId = state.createdReportId;

    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka form permohonan
    await page.goto('/pj/maintenance/buat');
    await expect(page.locator('h1')).toContainText('Buat Permohonan Maintenance');

    // Pilih laporan
    await page.selectOption('#laporan_id', createdReportId);
    await page.click('button[type="submit"]');

    // Verifikasi redirect & flash success
    await expect(page).toHaveURL('/pj/maintenance');
    await expect(page.locator('.flash-success')).toBeVisible();
    await expect(page.locator('.flash-success')).toContainText('Permohonan maintenance berhasil dibuat');
  });

  test('Kondisi Alternatif 1 - Membuat laporan permohonan maintenance tanpa memilih laporan (laporan_id kosong)', async ({ page }) => {
    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka form permohonan
    await page.goto('/pj/maintenance/buat');
    await expect(page.locator('h1')).toContainText('Buat Permohonan Maintenance');

    // Submit tanpa pilih laporan
    await page.click('button[type="submit"]');

    // Verifikasi pesan error
    await expect(page.locator('text=Laporan wajib dipilih.').first()).toBeVisible();
  });
});

test.describe('Fitur 11 - Penanggung Jawab dapat memberi verifikasi hasil kerja Pengelola Aset untuk menutup / close permohonan atau revisi (Update)', () => {
  test('Kondisi Normal - Memverifikasi hasil kerja Pengelola Aset untuk mengajukan revisi atau menutup permohonan', async ({ page }) => {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const createdReportId = state.createdReportId;

    // --- ALUR 1: Tombol aksi disabled sebelum ada update progres ---
    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka detail permohonan
    await page.goto(`/pj/maintenance/${createdReportId}`);
    
    // Verifikasi tombol Close & Revisi disabled
    const disabledCloseBtn = page.locator('button[disabled]:has-text("Tutup & Nyatakan Selesai")');
    const disabledRevisiBtn = page.locator('button[disabled]:has-text("Minta Revisi")');
    await expect(disabledCloseBtn).toBeVisible();
    await expect(disabledRevisiBtn).toBeVisible();

    // Logout
    await page.goto('/logout');
    await expect(page).toHaveURL('/login');

    // --- ALUR 2: Pengelola tambah progres pertama ---
    // Login Pengelola
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pengelola@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/penugasan');

    // Buka detail penugasan & upload progres
    await page.goto(`/penugasan/${createdReportId}`);
    await page.fill('#description', 'Sedang melakukan pembersihan filter AC dan menutup kebocoran pada pipa pembuangan.');
    await page.setInputFiles('#foto', FOTO_PATH);
    await page.click('button[type="submit"]');

    // Verifikasi progres sukses ditambahkan
    await expect(page.locator('.flash-success')).toBeVisible();
    await page.goto('/logout');
    await expect(page).toHaveURL('/login');

    // --- ALUR 3: PJ minta revisi ---
    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka detail permohonan
    await page.goto(`/pj/maintenance/${createdReportId}`);

    // Buka modal revisi & submit catatan
    const activeRevisiBtn = page.locator('button:has-text("Minta Revisi")');
    await expect(activeRevisiBtn).toBeEnabled();
    await activeRevisiBtn.click();
    await expect(page.locator('#revisiModal')).toBeVisible();
    await page.fill('#catatan', 'AC masih sedikit berisik saat pertama kali dinyalakan. Mohon dicheck lagi.');
    await page.click('#revisiSubmit');

    // Verifikasi catatan revisi sukses
    await expect(page.locator('.flash-success')).toBeVisible();
    await expect(page.locator('.flash-success')).toContainText('Catatan revisi berhasil dikirim');
    await page.goto('/logout');
    await expect(page).toHaveURL('/login');

    // --- ALUR 4: Pengelola upload progres kedua ---
    // Login Pengelola
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pengelola@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/penugasan');

    // Upload progres setelah revisi
    await page.goto(`/penugasan/${createdReportId}`);
    await page.fill('#description', 'Kipas indoor AC sudah dibersihkan dan disesuaikan posisinya. Suara bising sudah hilang sepenuhnya.');
    await page.setInputFiles('#foto', FOTO_PATH);
    await page.click('button[type="submit"]');
    await expect(page.locator('.flash-success')).toBeVisible();
    await page.goto('/logout');
    await expect(page).toHaveURL('/login');

    // --- ALUR 5: PJ selesaikan permohonan (Close) ---
    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka detail permohonan
    await page.goto(`/pj/maintenance/${createdReportId}`);

    // Klik tombol selesai & konfirmasi
    const activeCloseBtn = page.locator('button:has-text("Tutup & Nyatakan Selesai")');
    await expect(activeCloseBtn).toBeEnabled();
    await activeCloseBtn.click();
    
    const closeDialog = page.locator('#confirm-close-dialog');
    await closeDialog.locator('button:has-text("Ya, Selesaikan")').click();

    // Verifikasi permohonan ditutup
    await expect(page).toHaveURL('/pj/maintenance');
    await expect(page.locator('.flash-success')).toBeVisible();
    await expect(page.locator('.flash-success')).toContainText('Permohonan berhasil ditutup');
  });

  test('Kondisi Alternatif 1 - Meminta revisi dengan catatan terlalu pendek (kurang dari 10 karakter)', async ({ page }) => {
    const db = require('../lib/db');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const createdReportId = state.createdReportId;

    // Dapatkan ID log baru
    const [[{ nid }]] = await db.query('SELECT COALESCE(MAX(id), 0) + 1 AS nid FROM room_maintenance_request_log');

    // Setup state sementara: in_progress & log status 3
    await db.query("UPDATE room_maintenance_requests SET status = 'in_progress' WHERE id = ?", [createdReportId]);
    await db.query(
      `INSERT INTO room_maintenance_request_log (id, room_maintenance_request_id, log, logged_by, logged_at, status, created_at, updated_at)
       VALUES (?, ?, 'Progres Sementara Untuk Uji Coba', 1, NOW(), 3, NOW(), NOW())`,
      [nid, createdReportId]
    );

    try {
      // Login PJ 2
      await page.goto('/login');
      await page.fill('input[name="username"]', 'pj2@unand.ac.id');
      await page.fill('input[name="password"]', 'password123');
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL('/pj/dashboard');

      // Buka detail permohonan
      await page.goto(`/pj/maintenance/${createdReportId}`);

      // Kirim catatan revisi terlalu pendek
      const activeRevisiBtn = page.locator('button:has-text("Minta Revisi")');
      await expect(activeRevisiBtn).toBeEnabled();
      await activeRevisiBtn.click();
      await page.fill('#catatan', 'Pendek');
      await page.click('#revisiSubmit');

      // Verifikasi error validasi client-side
      await expect(page.locator('#revisiErr')).toBeVisible();
      await expect(page.locator('text=Catatan minimal 10 karakter.').first()).toBeVisible();
    } finally {
      // Cleanup log sementara
      await db.query("DELETE FROM room_maintenance_request_log WHERE id = ?", [nid]);
    }
  });

  test('Kondisi Alternatif 2 - Mengajukan revisi ketika progres perbaikan belum diperbarui oleh pengelola', async ({ page }) => {
    const db = require('../lib/db');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const createdReportId = state.createdReportId;

    // Setup state: in_progress & hapus log status 3
    await db.query("UPDATE room_maintenance_requests SET status = 'in_progress' WHERE id = ?", [createdReportId]);
    await db.query("DELETE FROM room_maintenance_request_log WHERE room_maintenance_request_id = ? AND status = 3", [createdReportId]);

    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka detail permohonan
    await page.goto(`/pj/maintenance/${createdReportId}`);

    // Verifikasi tombol Minta Revisi tidak aktif (disabled) di UI
    const revisiBtn = page.locator('button:has-text("Minta Revisi")');
    await expect(revisiBtn).toBeDisabled();

    // Force submit POST revisi via form dinamis untuk verifikasi backend validation
    await page.evaluate((reportId) => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `/pj/maintenance/${reportId}/revisi`;
      
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'catatan';
      input.value = 'Catatan revisi yang panjang untuk memicu validasi backend.';
      form.appendChild(input);
      
      document.body.appendChild(form);
      form.submit();
    }, createdReportId);

    // Verifikasi error backend
    await expect(page.locator('.flash-error')).toBeVisible();
    await expect(page.locator('.flash-error')).toContainText('Tidak dapat meminta revisi. Menunggu update progres perbaikan baru dari pengelola.');
  });

  test('Kondisi Alternatif 3 - Menutup permohonan ketika progres perbaikan belum diperbarui oleh pengelola', async ({ page }) => {
    const db = require('../lib/db');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const createdReportId = state.createdReportId;

    // Setup state: in_progress & hapus log status 3
    await db.query("UPDATE room_maintenance_requests SET status = 'in_progress' WHERE id = ?", [createdReportId]);
    await db.query("DELETE FROM room_maintenance_request_log WHERE room_maintenance_request_id = ? AND status = 3", [createdReportId]);

    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka detail permohonan
    await page.goto(`/pj/maintenance/${createdReportId}`);

    // Verifikasi tombol Tutup & Nyatakan Selesai tidak aktif (disabled) di UI
    const closeBtn = page.locator('button:has-text("Tutup & Nyatakan Selesai")');
    await expect(closeBtn).toBeDisabled();

    // Force submit POST close via form dinamis untuk verifikasi backend validation
    await page.evaluate((reportId) => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `/pj/maintenance/${reportId}/close`;
      document.body.appendChild(form);
      form.submit();
    }, createdReportId);

    // Verifikasi error backend
    await expect(page.locator('.flash-error')).toBeVisible();
    await expect(page.locator('.flash-error')).toContainText('Permohonan tidak dapat ditutup. Menunggu update progres perbaikan baru dari pengelola.');
  });
});

test.describe('Fitur 12 - Penanggung Jawab dapat mengunduh rekap laporan bulanan dalam format PDF', () => {
  test('Kondisi Normal - Mengunduh rekap laporan bulanan', async ({ page }) => {
    // Login PJ 2
    await page.goto('/login');
    await page.fill('input[name="username"]', 'pj2@unand.ac.id');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pj/dashboard');

    // Buka daftar laporan
    await page.goto('/pj/laporan');

    // Klik download rekap PDF
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Download Rekap PDF")');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('.pdf');
  });
});
