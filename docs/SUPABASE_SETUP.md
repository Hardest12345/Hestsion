# Mengaktifkan foto dan Supabase

Koneksi development sudah diverifikasi pada project pengguna. Pengguna telah memberikan URL/publishable key dan menjalankan migration melalui SQL Editor. Uji live memakai dua akun sementara serta foto buatan sendiri; akun, file asli/turunan, dan record uji telah dibersihkan. Secret tetap di environment privat dan tidak masuk repository. Langkah di bawah untuk mereproduksi setup pada checkout/hosting lain.

## 1. Nilai koneksi

Siapkan **Project URL** dan **publishable key** (atau anon key lama) dari dashboard Supabase. Masukkan di `.env` pada lingkungan development; jangan commit `.env`.

```bash
cp .env.example .env
```

Isi `VITE_SUPABASE_URL` dan `SUPABASE_URL` dengan project yang sama. Isi `VITE_SUPABASE_PUBLISHABLE_KEY` dan `SUPABASE_PUBLISHABLE_KEY` dengan public/publishable key yang sama. `VITE_API_BASE_URL` menunjuk backend Node, default `http://localhost:3001`. Atur `CORS_ORIGINS` hanya untuk origin frontend yang dipakai. Untuk cloud hosting, frontend/API harus HTTPS; backend yang diproksikan lewat origin yang sama tetap menggunakan URL HTTPS absolut.

**Secret/service-role key hanya untuk worker privat.** Jangan taruh pada `VITE_*`, source, GitHub, atau chat. Project URL boleh dikirim untuk membantu konfigurasi; kunci server dipasang langsung lewat environment hosting/terminal yang aman. Koneksi belum berarti mengaktifkan layanan hosting berbayar.

## 2. Migration pada project development

Periksa project yang dituju dan backup bila project sudah memiliki data. Buka SQL Editor lalu jalankan hanya:

`supabase/migrations/202611170001_private_wardrobe_photos.sql`

Migration membuat tabel pakaian, tabel aset/antrean, bucket privat `wardrobe-images`, RLS, FK kepemilikan, dan RPC antrean. Jangan jalankan `supabase/tests/bootstrap.sql` pada Supabase: itu hanya stand-in auth/storage untuk tes PostgreSQL lokal. Migration ini sengaja satu kali, bukan idempotent; jika tabel/bucket/policy dari aplikasi lain sudah memakai nama yang sama, tinjau konflik terlebih dahulu. Bucket publik bernama sama menyebabkan migration gagal alih-alih diam-diam mengubah akses.

Kunci browser tidak boleh melakukan update state worker. API memverifikasi JWT ke Supabase Auth dan melakukan query dengan JWT pengguna sehingga RLS tetap aktif. Service role hanya tersedia pada consumer antrean.

## 3. Auth

Aktifkan provider Email + Password. Tetapkan Site URL serta allowlist URL konfirmasi sesuai frontend development, misalnya `http://localhost:5173`. Gunakan konfirmasi email untuk akun pilot. Frontend menyediakan daftar, masuk, dan keluar akun; setelah konfirmasi email, masuk kembali di aplikasi.

Demo lokal dan akun cloud dipisahkan. Login tidak memigrasikan pakaian demo atau data lokal secara otomatis. Pakaian/foto cloud disinkronkan; papan, outfit, favorit, dan riwayat pemakaian masih disimpan lokal per akun. Jangan menganggap seluruh M2 selesai pada perubahan ini.

## 4. Jalankan web dan backend

```bash
npm ci
npm run dev
```

Terminal kedua:

```bash
npm run dev:api
```

API berjalan di loopback `127.0.0.1:3001` secara default. Sesuaikan host saat container/deployment memang diperlukan. `GET /health` memeriksa proses API, bukan kesehatan worker. Jangan mengartikan health OK sebagai bukti segmentasi sedang aktif.

## 5. Jalankan worker gambar

Butuh Python 3.11+ dan CPU/RAM yang memadai. Smoke contoh 768 × 896 dengan dua thread CPU memakai peak RSS sekitar 6,7 GiB pada varian Lite setelah pengaturan memori; sediakan headroom di atas angka itu dan benchmark foto nyata sebelum memilih mesin. Varian penuh menyebabkan OOM pada limit 8 GiB dalam pengujian ini. Worker ini proses Python terpisah, bukan fungsi yang menghabiskan request browser atau Edge Function Supabase.

```bash
python -m venv .venv
.venv/bin/pip install -r services/photo-worker/requirements.txt
cp .env.worker.example .env.worker
```

Isi `.env.worker` secara privat dengan `SUPABASE_URL` dan `SUPABASE_SECRET_KEY` (`sb_secret_...`). Legacy JWT `SUPABASE_SERVICE_ROLE_KEY` juga didukung. Kunci baru dikirim pada header `apikey`; kunci JWT lama juga memakai Authorization. Worker tidak memakai session JWT pengguna. Untuk shell POSIX:

```bash
set -a
. ./.env.worker
set +a
.venv/bin/python services/photo-worker/worker.py
```

Pada hosting, pasang nilai tersebut lewat secret/environment milik layanan worker. Pertama kali worker dijalankan, rembg mengunduh bobot BiRefNet-general-lite ke `U2NET_HOME`. Sisihkan ruang untuk bobot yang besar; file model, virtualenv, dan cache tidak diunggah ke GitHub. Setelah bobot tersedia, gambar diproses pada worker sendiri. Foto tidak dikirim ke penyedia image generation atau dataset training.

Tunggu log `photo_worker=ready` sebelum uji unggah. Tanpa worker aktif, upload tetap tersimpan privat dengan status **Menunggu pemrosesan**. Job dicoba maksimal tiga kali otomatis. Kegagalan tidak mengganti foto asli. Tombol **Coba proses lagi** mengantrekan ulang job gagal.

## 6. Uji koneksi dengan dua akun

1. Akun A: tambah pakaian dengan PNG/JPG. Pastikan status antre → diproses → siap; lihat foto asli dan hasil di dialog edit.
2. Akun B pada browser/session terpisah: pakaian A tidak muncul. Memanggil ID item, asset, signed URL, enqueue, atau storage path milik A harus ditolak oleh API/RLS.
3. Coba MIME palsu, gambar rusak, file >10 MB, dan JPEG dengan orientasi/EXIF. Kegagalan tidak boleh membuat foto dianggap siap.
4. Ganti foto saat proses lama masih berjalan. Hasil yang ditampilkan harus mengikuti pointer asset terbaru; output lease lama tidak menimpa versi baru.
5. Matikan worker, unggah, nyalakan kembali. Antrean harus dilanjutkan. Uji kegagalan matting, retry, serta penghapusan file asli/turunan.
6. Hapus pakaian dan verifikasi objek Storage hilang. Uji pula worker crash di antara upload output dan finalisasi.

SQL policies diuji pada PostgreSQL lokal dengan stand-in `auth.uid()`/Storage schema, lalu diverifikasi dengan dua akun Supabase Auth nyata pada project pengguna. Uji live membuktikan upload API, RLS database/storage, larangan RPC worker bagi user, segmentasi worker, signed download, serta penghapusan original/cutout/thumbnail. Ini bukan uji browser UI; uji foto nyata dan perangkat pilot tetap diperlukan.

## Batas operasional

Original dinormalisasi ulang menjadi PNG tanpa EXIF/GPS, dengan maksimum input 10 MB / 24 MP. Bucket privat membatasi objek sampai 64 MB untuk PNG lossless dan turunan. Pemrosesan membatasi sisi terpanjang sampai 4.096 px; foto kecil dibesarkan maksimal 2× melalui Lanczos dan sharpening ringan, bukan rekonstruksi generatif. Foto sumber beresolusi rendah diberi catatan. Metadata warna/kategori tidak ditebak otomatis.

Queue memakai lease 10 menit dan output per lease. Worker menghapus output jika finalisasi ditolak, termasuk item yang dihapus. Jika worker crash persis setelah menulis file tetapi sebelum finalisasi/pembersihan, output sementara bisa tertinggal. Sebelum pilot, jadwalkan rekonsiliasi objek yang tidak lagi direferensikan, uji timeout pada CPU target, serta tetapkan retensi dan budget Storage. Signed URL berlaku 60 detik, hanya dibuat setelah verifikasi owner, dan tidak disimpan pada localStorage.

## Smoke integration eksplisit

`npm run test:live` membuat dua akun uji terkonfirmasi tanpa mengirim email, memakai JWT pengguna untuk operasi aplikasi, memproses satu foto buatan sendiri dengan worker, lalu menghapus akun/data/file uji. Script tidak menjadi bagian `npm test` atau CI default. Antrean harus kosong agar tidak memproses job pengguna lain. Hanya jalankan pada project development yang memang dipilih. Pasang `PHOTO_WORKER_PYTHON` ke Python virtualenv yang memuat requirements; pada lingkungan dengan proxy Node 24, gunakan `NODE_USE_ENV_PROXY=1` agar fetch melewati proxy yang sudah dikonfigurasi. Jangan mengubah trust TLS atau mencetak secret untuk diagnosis.
