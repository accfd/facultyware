const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const db = require('../lib/db');

const BASE_URL = 'http://localhost:3000';
const API_KEY = 'key_dev_2026';

// Helper: Login sebagai Pengelola Aset
async function loginPengelola(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('#username', 'pengelola@unand.ac.id');
  await page.fill('#password', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(`${BASE_URL}/penugasan`);
}

// Aset gambar untuk testing upload
const FOTO_PATH = path.join(__dirname, 'fixtures', 'foto-kerusakan.png');

test.describe('Fitur 13 - Pengelola Aset dapat melihat daftar penugasan perbaikan yang aktif', () => {
  test('Kondisi Normal - Menampilkan daftar penugasan aktif', async ({ page }) => {
    await loginPengelola(page);
    await expect(page.locator('h1')).toContainText('Penugasan Aktif');
    await expect(page.locator('table')).toBeVisible();
  });

  test('Kondisi Alternatif - Pencarian penugasan dengan kata kunci fiktif', async ({ page }) => {
    await loginPengelola(page);
    await page.fill('input[name="search"]', 'Ruangan Fiktif Super Rahasia');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/penugasan\?search=Ruangan\+Fiktif\+Super\+Rahasia/);
    await expect(page.getByText('Tidak ada penugasan yang cocok dengan pencarian.')).toBeVisible();
  });
});

test.describe('Fitur 14 - Pengelola Aset dapat mengunduh laporan permohonan maintenance dalam format PDF', () => {
  test('Kondisi Normal - Mengunduh PDF permohonan', async ({ page }) => {
    // 1. Ambil tiket berstatus 'in_progress' milik pengelola dari DB
    const [[tiket]] = await db.query(
      `SELECT id FROM room_maintenance_requests
       WHERE status = 'in_progress' AND employee_id = (SELECT id FROM users WHERE email = 'pengelola@unand.ac.id')
       LIMIT 1`
    );
    expect(tiket).toBeDefined();

    // 2. Buka detail penugasan
    await loginPengelola(page);
    await page.goto(`${BASE_URL}/penugasan/${tiket.id}`);
    
    // 3. Unduh berkas PDF dan pastikan formatnya benar (.pdf)
    const downloadPromise = page.waitForEvent('download');
    await page.click('a:has-text("PDF Permohonan")');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.pdf');
  });

  test('Kondisi Alternatif - Mengunduh PDF permohonan yang tidak valid atau bukan hak akses', async ({ page }) => {
    const idTidakValid = 999999999;
    await loginPengelola(page);
    
    // 1. Akses langsung tautan download PDF tiket fiktif
    const response = await page.goto(`${BASE_URL}/penugasan/${idTidakValid}/pdf`);
    expect(response?.status()).toBe(404);
    const contentType = response?.headers()['content-type'] || '';
    expect(contentType).not.toContain('application/pdf');
  });
});

test.describe('Fitur 15 - Pengelola Aset dapat mengunggah bukti hasil akhir perbaikan', () => {
  test('Kondisi Normal - Mengunggah progres perbaikan baru', async ({ page }) => {
    // 1. Ambil tiket berstatus 'in_progress'
    const [[tiket]] = await db.query(
      `SELECT id FROM room_maintenance_requests
       WHERE status = 'in_progress' AND employee_id = (SELECT id FROM users WHERE email = 'pengelola@unand.ac.id')
       LIMIT 1`
    );
    expect(tiket).toBeDefined();

    // 2. Bersihkan log progres status=3 terakhir agar form unggah terbuka kembali
    await db.query(
      `DELETE FROM room_maintenance_request_log
       WHERE room_maintenance_request_id = ? AND status = 3`,
      [tiket.id]
    );

    // 3. Buka halaman detail penugasan
    await loginPengelola(page);
    await page.goto(`${BASE_URL}/penugasan/${tiket.id}`);

    // 4. Isi form deskripsi perbaikan & upload foto bukti
    await page.fill('#description', 'Sudah dilakukan penyolderan kabel dan penggantian kipas indoor yang baru.');
    await page.setInputFiles('#foto', FOTO_PATH);
    await page.click('#submitBtn');

    // 5. Verifikasi pengalihan dan kemunculan flash success
    await expect(page).toHaveURL(`${BASE_URL}/penugasan/${tiket.id}`);
    await expect(page.locator('.flash-success')).toBeVisible();
    await expect(page.locator('.flash-success')).toContainText('Progres');
  });

  test('Kondisi Alternatif 1 - Mengirim progres tanpa foto dan deskripsi terlalu singkat', async ({ page }) => {
    // 1. Ambil tiket berstatus 'in_progress'
    const [[tiket]] = await db.query(
      `SELECT id FROM room_maintenance_requests
       WHERE status = 'in_progress' AND employee_id = (SELECT id FROM users WHERE email = 'pengelola@unand.ac.id')
       LIMIT 1`
    );
    expect(tiket).toBeDefined();

    // 2. Bersihkan log progres status=3 terakhir agar form unggah terbuka
    await db.query(
      `DELETE FROM room_maintenance_request_log
       WHERE room_maintenance_request_id = ? AND status = 3`,
      [tiket.id]
    );

    // 3. Buka detail penugasan
    await loginPengelola(page);
    await page.goto(`${BASE_URL}/penugasan/${tiket.id}`);

    // 4. Isi deskripsi yang terlalu singkat (kurang dari 20 karakter) tanpa mengunggah foto
    await page.fill('#description', 'Singkat');
    await page.click('#submitBtn');

    // 5. Verifikasi pesan error validasi muncul di sisi klien (JS)
    await expect(page.locator('#errFoto')).toBeVisible();
    await expect(page.locator('#errFoto')).toContainText('wajib diunggah');
    await expect(page.locator('#errDesc')).toBeVisible();
    await expect(page.locator('#errDesc')).toContainText('minimal 20 karakter');
  });

  test('Kondisi Alternatif 2 - Mengirim progres ganda berturut-turut', async ({ page }) => {
    // 1. Ambil tiket berstatus 'in_progress'
    const [[tiket]] = await db.query(
      `SELECT id FROM room_maintenance_requests
       WHERE status = 'in_progress' AND employee_id = (SELECT id FROM users WHERE email = 'pengelola@unand.ac.id')
       LIMIT 1`
    );
    expect(tiket).toBeDefined();

    // 2. Pastikan log progres status=3 sudah ada di database
    const [latestLogs] = await db.query(
      `SELECT id FROM room_maintenance_request_log
       WHERE room_maintenance_request_id = ? AND status = 3
       LIMIT 1`,
      [tiket.id]
    );
    if (latestLogs.length === 0) {
      const [[{ nid }]] = await db.query('SELECT COALESCE(MAX(id), 0) + 1 AS nid FROM room_maintenance_request_log');
      const [[emp]] = await db.query("SELECT id FROM users WHERE email = 'pengelola@unand.ac.id'");
      await db.query(
        `INSERT INTO room_maintenance_request_log (id, room_maintenance_request_id, log, logged_by, logged_at, status, created_at, updated_at)
         VALUES (?, ?, 'Progres Sementara', ?, NOW(), 3, NOW(), NOW())`,
        [nid, tiket.id, emp.id]
      );
    }

    await loginPengelola(page);

    // 3. Kirim request POST paksa untuk upload progres kedua kali berturut-turut (secara ilegal lewat backend)
    await page.request.post(`${BASE_URL}/penugasan/${tiket.id}/progres`, {
      multipart: {
        description: 'Mencoba mengirim progres ganda secara ilegal lewat backend dengan deskripsi yang cukup panjang.',
        foto: {
          name: 'foto-kerusakan.png',
          mimeType: 'image/png',
          buffer: fs.readFileSync(FOTO_PATH),
        }
      },
      maxRedirects: 0
    });

    // 4. Buka halaman detail penugasan & verifikasi pesan galat flash dari backend
    await page.goto(`${BASE_URL}/penugasan/${tiket.id}`);
    await expect(page.locator('.flash-error')).toBeVisible();
    await expect(page.locator('.flash-error')).toContainText('Anda sudah mengirim progres perbaikan');
  });
});

test.describe('Fitur 16 - Pengelola Aset dapat mengunduh laporan hasil perbaikan dalam format PDF', () => {
  test('Kondisi Normal - Mengunduh PDF hasil perbaikan', async ({ page }) => {
    // 1. Ambil tiket berstatus 'resolved' milik pengelola
    const [[tiket]] = await db.query(
      `SELECT id FROM room_maintenance_requests
       WHERE status = 'resolved' AND employee_id = (SELECT id FROM users WHERE email = 'pengelola@unand.ac.id')
       LIMIT 1`
    );
    expect(tiket).toBeDefined();

    // 2. Buka detail penugasan
    await loginPengelola(page);
    await page.goto(`${BASE_URL}/penugasan/${tiket.id}`);

    // 3. Unduh berkas PDF hasil perbaikan
    const downloadPromise = page.waitForEvent('download');
    await page.click('a:has-text("PDF Hasil")');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.pdf');
  });

  test('Kondisi Alternatif - Mengunduh PDF hasil perbaikan yang tidak ada atau bukan wewenang', async ({ page }) => {
    const idTidakValid = 999999999;
    await loginPengelola(page);

    // 1. Akses langsung tautan download PDF hasil tiket fiktif
    const response = await page.goto(`${BASE_URL}/penugasan/${idTidakValid}/pdf-hasil`);
    expect(response?.status()).toBe(404);
    const contentType = response?.headers()['content-type'] || '';
    expect(contentType).not.toContain('application/pdf');
  });
});

test.describe('Fitur 17 - Sistem dapat memberikan response data riwayat maintenance dalam format JSON (API)', () => {
  test('Kondisi Normal - Mengakses API riwayat maintenance dengan valid API key', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/maintenance`, {
      headers: { 'x-api-key': API_KEY }
    });
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.pagination).toBeDefined();
  });

  test('Kondisi Alternatif 1 - Mengakses API tanpa API key', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/maintenance`);
    expect(response.status()).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toBe('Unauthorized');
  });

  test('Kondisi Alternatif 2 - Mengakses API dengan API key tidak valid', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/maintenance`, {
      headers: { 'x-api-key': 'SALAH_KEY_123' }
    });
    expect(response.status()).toBe(401);
  });
});

test.describe('Fitur 18 - Sistem dapat memproses update status tiket secara cepat melalui endpoint API', () => {
  test('Kondisi Normal - Mengakses API status tiket cepat', async ({ request }) => {
    const [[tiket]] = await db.query('SELECT id, status FROM room_maintenance_requests LIMIT 1');
    expect(tiket).toBeDefined();

    // 1. Kirim request GET ke API status tiket
    const response = await request.get(`${BASE_URL}/api/v1/maintenance/${tiket.id}/status`, {
      headers: { 'x-api-key': API_KEY }
    });
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(tiket.id);
    expect(json.data.status).toBe(tiket.status);
    expect(json.data.log_count).toBeDefined();
  });

  test('Kondisi Alternatif - Mengakses API status tiket yang tidak terdaftar', async ({ request }) => {
    const idTidakValid = 999999999;
    
    // 1. Kirim request GET ke API status tiket dengan ID fiktif
    const response = await request.get(`${BASE_URL}/api/v1/maintenance/${idTidakValid}/status`, {
      headers: { 'x-api-key': API_KEY }
    });
    expect(response.status()).toBe(404);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toBe('Tiket tidak ditemukan.');
  });
});
