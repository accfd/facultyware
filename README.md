# Facultyware - Central Panel (Modul Maintenance Ruangan Fisik)

## Deskripsi Aplikasi
Facultyware adalah platform manajemen fasilitas universitas. Sub-projek ini berfokus pada **Modul Maintenance Ruangan (Fisik)** untuk Kelompok **A7**. Aplikasi ini mempermudah pengguna (Dosen/Mahasiswa/Staff) untuk melaporkan kerusakan fasilitas/ruangan, serta memfasilitasi Penanggung Jawab (PJ) dan Pengelola Aset dalam memproses tiket perawatan, mengunggah bukti perbaikan, hingga mengunduh dokumen pelaporan/rekap dalam format PDF.

Aplikasi ini dibangun menggunakan arsitektur modern Node.js dengan **Express** dan **EJS**, menggunakan styling **Tailwind CSS (via Basecoat)**, serta didukung interaksi dinamis menggunakan **HTMX** (tanpa memuat ulang seluruh halaman / Single Page Application-like transitions).

---

## Fitur Utama
1. **Pengguna:** Mengisi laporan kerusakan, pemantauan status real-time, filter status laporan, dan unduh PDF bukti laporan.
2. **Penanggung Jawab (PJ):** Dashboard statistik, pencarian/filter laporan, memperbarui/menghapus permintaan, membuat permohonan maintenance ke Pengelola Aset, verifikasi pekerjaan Pengelola Aset (tutup/revisi), dan unduh rekap bulanan PDF.
3. **Pengelola Aset:** Melihat daftar penugasan aktif, mengunggah bukti perbaikan, mengunduh laporan permohonan maintenance PDF, dan mengunduh laporan hasil perbaikan PDF.
4. **API Integration:** Response riwayat maintenance format JSON dan pemrosesan update status tiket melalui endpoint API yang cepat.

---

## Cara Instalasi dan Menjalankan Aplikasi

### Prerequisites
Pastikan Anda sudah menginstal:
*   [Node.js](https://nodejs.org/) (versi 16 atau yang lebih baru)
*   [MySQL Database](https://www.mysql.com/)

### Langkah 1: Kloning Repositori
```bash
git clone https://github.com/accfd/facultyware.git
cd facultyware
```

### Langkah 2: Instal Dependensi
Jalankan perintah berikut untuk menginstal semua dependensi package yang diperlukan:
```bash
npm install
```

### Langkah 3: Konfigurasi Environment Variables
Buat file bernama `.env` di root direktori proyek (atau edit file `.env` yang sudah ada) dan sesuaikan konfigurasi database Anda:
```env
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=username_database_anda
DB_PASSWORD=password_database_anda
DB_NAME=nama_database_anda
SESSION_SECRET=fti_secret_2025
API_KEY=key_dev_2026
```

### Langkah 4: Impor Skema Database
Impor file SQL database (jika ada, e.g., dari `db.sql` atau file dump yang disediakan) ke dalam database MySQL Anda sesuai dengan konfigurasi `DB_NAME` pada file `.env`.

### Langkah 5: Menjalankan Aplikasi
*   **Mode Development (dengan auto-reload):**
    ```bash
    npm run dev
    ```
*   **Mode Production:**
    ```bash
    npm start
    ```
Aplikasi akan berjalan di `http://localhost:3000`.

### Langkah 6: Menjalankan Pengujian (Testing - Playwright)
Untuk menjalankan pengujian fungsionalitas otomatis:
```bash
npx playwright test
```
Untuk melihat laporan hasil testing:
```bash
npx playwright show-report
```

---

## Pembagian Tugas Anggota (Kelompok A7)

Berikut adalah daftar pembagian tugas dan tanggung jawab pengerjaan fitur pada sub-projek A7:

| No | Fitur | NIM | Nama PIC | Status |
| :--- | :--- | :---: | :--- | :---: |
| 1 | Pengguna dapat mengisi formulir laporan kerusakan ruangan | 2411522014 | Rafa Gian Atthari | ✅ |
| 2 | Pengguna dapat memantau status pelaporan secara real-time | 2411522014 | Rafa Gian Atthari | ✅ |
| 3 | Pengguna dapat memfilter riwayat laporan pribadi berdasarkan status | 2411522014 | Rafa Gian Atthari | ✅ |
| 4 | Pengguna dapat mengunduh bukti laporan dalam format PDF | 2411522001 | Rafa Gian Atthari | 📄 |
| 5 | Penanggung Jawab dapat memantau statistik laporan melalui dashboard | 2411522001 | Fuadi Dhiyaulhaq | ✅ |
| 6 | Penanggung Jawab dapat mencari laporan spesifik berdasarkan nama ruangan | 2411522001 | Fuadi Dhiyaulhaq | ✅ |
| 7 | Penanggung Jawab dapat menampilkan daftar riwayat permintaan maintenance (Read) | 2411522001 | Fuadi Dhiyaulhaq | ✅ |
| 8 | Penanggung Jawab dapat memperbarui data permintaan yang kurang lengkap (Update) | 2411522001 | Fuadi Dhiyaulhaq | ✅ |
| 9 | Penanggung Jawab dapat menghapus permintaan yang tidak valid atau duplikat (Delete) | 2411522001 | Fuadi Dhiyaulhaq | ✅ |
| 10 | Penanggung Jawab dapat membuat laporan permohonan maintenance kepada Pengelola Aset (Create) | 2411522001 | Fuadi Dhiyaulhaq | ✅ |
| 11 | Penanggung Jawab dapat memberi verifikasi hasil kerja Pengelola Aset untuk menutup / close permohonan atau revisi (Update) | 2411522001 | Fuadi Dhiyaulhaq | ✅ |
| 12 | Penanggung Jawab dapat mengunduh rekap laporan bulanan dalam format PDF | 2411522001 | Fuadi Dhiyaulhaq | 📄 |
| 13 | Pengelola Aset dapat melihat daftar penugasan perbaikan yang aktif | 2411522014 | Rafa Gian Atthari | ✅ |
| 14 | Pengelola Aset dapat mengunduh laporan permohonan maintenance dari Penanggung Jawab dalam format PDF | 2411522014 | Rafa Gian Atthari | 📄 |
| 15 | Pengelola Aset dapat mengunggah bukti hasil akhir perbaikan / mengupdate riwayat perbaikan (Create) | 2411522014 | Rafa Gian Atthari | ✅ |
| 16 | Pengelola Aset dapat mengunduh laporan hasil perbaikan dalam format PDF | 2411522001 | Rafa Gian Atthari | 📄 |
| 17 | Sistem dapat memberikan response data riwayat maintenance dalam format JSON (API) | 2411522014 | Rafa Gian Atthari | 🌐 |
| 18 | Sistem dapat memproses update status tiket secara cepat melalui endpoint API | 2411522014 | Fuadi Dhiyaulhaq | 🌐 |
