// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const AKUN_PENGGUNA = {
  email:    'pengguna1@unand.ac.id',
  password: 'password123',
};

// Aset gambar untuk testing upload
const FOTO_KERUSAKAN_PATH = path.join(__dirname, 'fixtures', 'foto-kerusakan.png');

// Helper: Login sebagai Mahasiswa/Dosen
async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('#username', AKUN_PENGGUNA.email);
  await page.fill('#password', AKUN_PENGGUNA.password);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login$/); // Pastikan berhasil login
}

test.describe('Fitur 1 - Pengguna dapat mengisi formulir laporan kerusakan ruangan', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Kondisi Normal - Mengisi dan mengirimkan laporan kerusakan ruangan dengan data valid', async ({ page }) => {
    // 1. Buka halaman form laporan
    await page.goto(`${BASE_URL}/laporan/buat`);
    await expect(page.locator('#laporanForm')).toBeVisible();

    // 2. Pilih gedung
    const buildingSelect = page.locator('#building_select');
    const buildingOptions = await buildingSelect.locator('option').all();
    expect(buildingOptions.length).toBeGreaterThan(1);
    const buildingValue = await buildingOptions[1].getAttribute('value');
    await buildingSelect.selectOption(buildingValue);

    // 3. Pilih ruangan
    const roomSelect = page.locator('#room_id');
    await expect(roomSelect).toBeEnabled();
    const roomOptions = await roomSelect.locator('option').all();
    expect(roomOptions.length).toBeGreaterThan(1);
    const roomValue = await roomOptions[1].getAttribute('value');
    await roomSelect.selectOption(roomValue);

    // 4. Isi deskripsi kerusakan
    const deskripsi = 'AC di ruangan ini tidak dingin dan mengeluarkan suara bising sejak kemarin siang.';
    await page.fill('#issue_description', deskripsi);

    // 5. Upload foto bukti kerusakan & cek pratinjau
    await page.setInputFiles('#foto', FOTO_KERUSAKAN_PATH);
    await expect(page.locator('#previewWrap')).toBeVisible();

    // 6. Submit form laporan
    await page.click('#submitBtn');

    // 7. Verifikasi halaman dialihkan ke daftar laporan dan pesan sukses muncul
    await expect(page).toHaveURL(`${BASE_URL}/laporan`);
    await expect(page.getByText('Laporan berhasil dikirim!')).toBeVisible();
  });

  test('Kondisi Alternatif - Menampilkan pesan validasi ketika formulir dikirim kosong', async ({ page }) => {
    // 1. Buka form laporan
    await page.goto(`${BASE_URL}/laporan/buat`);
    await expect(page.locator('#laporanForm')).toBeVisible();

    // 2. Submit form kosong langsung
    await page.click('#submitBtn');

    // 3. Pastikan halaman tidak berpindah
    await expect(page).toHaveURL(`${BASE_URL}/laporan/buat`);

    // 4. Verifikasi munculnya pesan error validasi input wajib
    await expect(page.locator('#err-building')).toHaveText('Gedung wajib dipilih.');
    await expect(page.locator('#err-room_id')).toHaveText('Ruangan wajib dipilih.');
    await expect(page.locator('#err-issue_description')).toHaveText('Deskripsi kerusakan minimal 20 karakter.');
    await expect(page.locator('#err-foto')).toHaveText('Foto kerusakan wajib diunggah.');

    // 5. Pastikan tombol kirim tidak berubah status
    await expect(page.locator('#submitBtn')).toHaveText(/Kirim Laporan/);
  });
});

test.describe('Fitur 2 - Pengguna dapat memantau status pelaporan secara real-time', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Kondisi Normal - Memantau status laporan secara konsisten dan terkini', async ({ page }) => {
    // 1. Buka daftar laporan
    await page.goto(`${BASE_URL}/laporan`);

    // 2. Pastikan minimal ada 1 data laporan
    const baris = page.locator('tbody tr');
    await expect(baris.first()).toBeVisible();

    // 3. Ambil status laporan dari baris pertama
    const statusDiDaftar = (await baris.first().locator('.status-badge').innerText()).trim();
    expect(['Dilaporkan', 'Diproses', 'Selesai']).toContain(statusDiDaftar);

    // 4. Reload halaman untuk memverifikasi konsistensi status
    await page.reload();
    const statusSetelahReload = (await baris.first().locator('.status-badge').innerText()).trim();
    expect(statusSetelahReload).toBe(statusDiDaftar);

    // 5. Buka detail laporan
    await baris.first().getByText('Detail').click();
    await expect(page).toHaveURL(/\/laporan\/\d+$/);

    // 6. Verifikasi kecocokan status detail vs daftar, serta tampilnya Riwayat Perbaikan
    await expect(page.locator('.status-badge')).toHaveText(statusDiDaftar);
    await expect(page.getByText(/^LPR-\d{5}$/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Riwayat Perbaikan' })).toBeVisible();
    await expect(page.getByText('Laporan Dibuat').first()).toBeVisible();
  });

  test('Kondisi Alternatif - Menampilkan halaman error 404 ketika mengakses laporan tidak valid atau bukan milik sendiri', async ({ page }) => {
    const idTidakValid = 999999999;

    // 1. Buka paksa detail laporan dengan ID fiktif
    const response = await page.goto(`${BASE_URL}/laporan/${idTidakValid}`);
    expect(response?.status()).toBe(404);

    // 2. Verifikasi tampilan halaman error 404
    await expect(page.getByText('Halaman Tidak Ditemukan')).toBeVisible();
    await expect(page.getByText('Laporan tidak ditemukan')).toBeVisible();
  });
});

test.describe('Fitur 3 - Pengguna dapat memfilter riwayat laporan pribadi berdasarkan status', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/laporan`);
  });

  test('Kondisi Normal - Memfilter riwayat laporan berdasarkan status', async ({ page }) => {
    const FILTERS = [
      { label: 'Dilaporkan', value: 'reported',    badgeText: 'Dilaporkan' },
      { label: 'Diproses',   value: 'in_progress', badgeText: 'Diproses' },
      { label: 'Selesai',    value: 'resolved',    badgeText: 'Selesai' },
    ];

    for (const f of FILTERS) {
      // 1. Klik tautan filter status
      await page.getByRole('link', { name: f.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/laporan\\?status=${f.value}`));

      // 2. Tunggu tabel data atau pesan data kosong dirender
      const baris = page.locator('tbody tr');
      const pesanKosong = page.getByText('Belum ada laporan dengan status ini.');

      await Promise.race([
        baris.first().waitFor({ state: 'visible' }),
        pesanKosong.waitFor({ state: 'visible' }),
      ]);

      const jumlahBaris = await baris.count();

      // 3. Verifikasi: jika kosong tampilkan pesan kosong, jika ada pastikan semua badge sesuai filter
      if (jumlahBaris === 0) {
        await expect(pesanKosong).toBeVisible();
      } else {
        const semuaBadge = await baris.locator('.status-badge').allInnerTexts();
        for (const badgeText of semuaBadge) {
          expect(badgeText.trim()).toBe(f.badgeText);
        }
      }
    }

    // 4. Kembalikan filter ke opsi default 'Semua'
    await page.getByRole('link', { name: 'Semua', exact: true }).click();
    await expect(page).toHaveURL(/\/laporan\?status=$/);
  });

  test('Kondisi Alternatif - Menampilkan halaman kosong atau memproses nilai status tidak valid di URL', async ({ page }) => {
    // 1. Akses halaman dengan nomor halaman yang sangat besar (out-of-bounds)
    await page.goto(`${BASE_URL}/laporan?status=resolved&page=9999`);
    await page.waitForLoadState('networkidle');

    // 2. Pastikan tabel kosong dan menampilkan pesan kosong
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(page.getByText('Belum ada laporan dengan status ini.')).toBeVisible();

    // 3. Masukkan parameter status tidak valid langsung lewat URL
    const responseStatusInvalid = await page.goto(`${BASE_URL}/laporan?status=hapus_semua_data`);
    expect(responseStatusInvalid?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText('Laporan Saya');
  });
});

test.describe('Fitur 4 - Pengguna dapat mengunduh bukti laporan dalam format PDF', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Kondisi Normal - Mengunduh bukti laporan dalam format PDF dari halaman daftar dan detail', async ({ page }) => {
    await page.goto(`${BASE_URL}/laporan`);

    const baris = page.locator('tbody tr');
    await expect(baris.first()).toBeVisible();

    // 1. Dapatkan ID laporan dari baris pertama untuk mencocokkan nama berkas PDF
    const hrefDetail = await baris.first().getByText('Detail').getAttribute('href');
    expect(hrefDetail).not.toBeNull();
    const idLaporan  = /** @type {string} */ (hrefDetail).split('/').pop();
    const namaFileDiharapkan = `bukti-laporan-LPR-${String(idLaporan).padStart(5, '0')}.pdf`;

    // 2. Unduh PDF dari halaman daftar laporan
    const [downloadDariDaftar] = await Promise.all([
      page.waitForEvent('download'),
      baris.first().getByText('PDF', { exact: true }).click(),
    ]);
    expect(downloadDariDaftar.suggestedFilename()).toBe(namaFileDiharapkan);

    // 3. Unduh PDF dari halaman detail laporan
    await page.goto(`${BASE_URL}/laporan/${idLaporan}`);
    const [downloadDariDetail] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download PDF' }).click(),
    ]);
    expect(downloadDariDetail.suggestedFilename()).toBe(namaFileDiharapkan);

    // 4. Validasi keutuhan berkas PDF yang diunduh (ukuran & signature file %PDF-)
    const pathFileUnduhan = await downloadDariDetail.path();
    expect(pathFileUnduhan).not.toBeNull();
    const stats = fs.statSync(/** @type {string} */ (pathFileUnduhan));
    expect(stats.size).toBeGreaterThan(0);

    const headerBuffer = Buffer.alloc(5);
    const fd = fs.openSync(/** @type {string} */ (pathFileUnduhan), 'r');
    fs.readSync(fd, headerBuffer, 0, 5, 0);
    fs.closeSync(fd);
    expect(headerBuffer.toString('utf-8')).toBe('%PDF-');
  });

  test('Kondisi Alternatif - Menolak unduh PDF untuk laporan yang tidak valid atau bukan milik sendiri', async ({ page }) => {
    const idTidakValid = 999999999;

    // 1. Akses langsung tautan download PDF laporan fiktif
    const response = await page.goto(`${BASE_URL}/laporan/${idTidakValid}/pdf`);
    expect(response?.status()).toBe(404);

    // 2. Pastikan respons bukan PDF dan menampilkan halaman error 404
    const contentType = response?.headers()['content-type'] || '';
    expect(contentType).not.toContain('application/pdf');
    await expect(page.getByText('Halaman Tidak Ditemukan')).toBeVisible();
  });
});