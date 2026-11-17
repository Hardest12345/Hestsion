# Outfit Puzzle · Studio v0.2

Studio Bahasa Indonesia untuk merakit pakaian yang benar-benar dimiliki: lemari → rakit → kunci → rekomendasi form → pratinjau → terapkan → simpan → tandai dipakai. Demo lokal tetap tersedia tanpa secret. Mode cloud menambahkan Auth, lemari dan foto privat Supabase, backend Fastify, serta worker remove background + optimalisasi gambar. Rekomendasi outfit masih rules demo; model segmentasi foto adalah BiRefNet pretrained, bukan compatibility model hasil training produk.

Repository: [Hardest12345/Hestsion](https://github.com/Hardest12345/Hestsion). Demo satu berkas tersedia di [`demo/outfit-puzzle-demo.html`](demo/outfit-puzzle-demo.html); unduh berkas tersebut lalu buka di browser modern. Source juga bisa diunduh sebagai [ZIP branch main](https://github.com/Hardest12345/Hestsion/archive/refs/heads/main.zip).

## Jalankan

Butuh Node.js 22+ dan npm. Instalasi dependency pertama memerlukan internet; penggunaan aplikasi tidak memanggil layanan eksternal.

```bash
git clone https://github.com/Hardest12345/Hestsion.git
cd Hestsion
npm ci
npm run dev
```

Buka URL lokal yang dicetak Vite, biasanya `http://localhost:5173`. Untuk menghindari pindah penyimpanan, pakai host dan port yang sama setiap kali membuka.

## Foto PNG/JPG dan Supabase

Ikuti [panduan koneksi Supabase](docs/SUPABASE_SETUP.md). Koneksi development sudah diverifikasi pada project pengguna setelah pemilik menjalankan migration. Uji dua akun, upload privat, worker segmentasi, unduh hasil, dan cleanup sudah berhasil; file environment privat tidak disertakan di repository.

- Mode cloud: masuk, unggah satu PNG/JPG maksimal 10 MB, lalu pakaian tersimpan privat. Foto diproses lewat antrean; UI menunjukkan menunggu/diproses/siap/gagal dan menyediakan retry.
- Foto asli dipisahkan dari hasil tanpa latar. Backend decode/re-encode untuk membuang EXIF/GPS. Worker memakai BiRefNet-general-lite + alpha matting, mempertahankan transparansi, lalu Lanczos maksimal 2×/sisi 4.096 px + sharpening ringan, dengan output WebP lossless. Pembesaran bukan pemulihan detail blur atau rekonstruksi generatif.
- Pakaian/foto cloud sinkron per akun. Draft, outfit, favorit, dan riwayat masih lokal per akun. Demo tidak diunggah otomatis.
- Bucket privat dan signed URL 60 detik. Service-role key hanya di worker. Tidak ada foto pengguna yang otomatis dijadikan training data.

Web dijalankan dengan `npm run dev`; backend dengan `npm run dev:api`; worker Python dijalankan terpisah sesuai panduan. Worker perlu model cache dan resource CPU/RAM sendiri. Tidak ada deployment atau layanan berbayar yang dinyalakan otomatis.

## Pemeriksaan

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tes worker (setelah mengaktifkan Python virtualenv dan memasang requirements):

```bash
python -m unittest discover -s services/photo-worker -p 'test_*.py' -v
python scripts/test-db.py
```

Tes database memakai Docker PostgreSQL sementara, tanpa port publik dan tanpa menyentuh Supabase pengguna. Bootstrap auth/storage adalah stand-in khusus harness. Laporan terbaru ada di [verifikasi foto](docs/verification-photos.md); hasil M1 disimpan sebagai laporan historis.

Build menghasilkan **satu `dist/index.html`** dengan JavaScript, CSS, ikon, dan ilustrasi di dalamnya. Berkas `demo/outfit-puzzle-demo.html` adalah build demo tanpa konfigurasi cloud. Bisa dicoba dengan membuka berkas di browser modern; akses penyimpanan pada `file://` mengikuti kebijakan browser. Server localhost disarankan untuk persistence dan mode cloud. Belum ada verifikasi browser nyata di lingkungan pengerjaan.

## Coba alur pertama

1. Di Studio, klik **Jeans hitam**, lalu **Kunci** pada slot Bawahan. Di mobile, buka tab **Lemari** untuk memilih pakaian dan kembali ke **Papan** untuk mengunci.
2. Buka **Warna wajib & preferensi**, pilih warna atasan wajib **Putih**. Atur kegiatan dan kesan.
3. Klik **Lengkapi outfit**. Tersedia maksimal tiga alternatif legal dari lemari sendiri.
4. Klik alternatif untuk pratinjau. Papan tersimpan belum berubah. Klik **Terapkan pratinjau**.
5. Pilih mode **Ganti slot tertentu**, centang hanya **Sepatu**, lalu **Cari pengganti**. Atasan dan jeans tetap; sepatu lama tidak dipakai lagi di alternatif utama.
6. Coba **Undo** dan **Redo**, lalu **Simpan outfit** dengan nama. Reload dan buka tab **Outfit**. Tandai favorit atau **Aku pakai ini** secara terpisah.

Keyboard: gunakan Tab untuk memilih kontrol, Enter/Spasi untuk memasang/mengunci, dan select native untuk form. Drag-and-drop tersedia di desktop; tidak diperlukan untuk menyelesaikan alur. Memilih slot terlebih dahulu menjadikan slot itu target pemasangan; klik slot yang sama untuk membatalkan pilihan target.

## Yang tersedia

- 16 item fiktif, termasuk atasan putih/navy/gading, jeans, sepatu, outer, laundry, arsip, dan satu kategori yang belum didukung papan.
- Tambah, edit, hapus, pencarian, filter kategori, dan status pakaian. Demo memakai SVG buatan sendiri; akun cloud memakai foto privat dan turunannya.
- Empat slot semantik, pembatasan kategori/kepemilikan, kunci, lepas, reset slot terbuka, konfirmasi hapus semua jika ada lock.
- Riwayat Undo/Redo maksimal 50 aksi di sesi aktif. Draft, konteks, lemari, dan outfit tetap ada setelah reload.
- Tiga mode rekomendasi, warna wajib, formalitas/palet sebagai preferensi, konflik eksplisit, tanpa kandidat palsu.
- Pratinjau non-destruktif dan revalidasi sebelum apply. Revision papan, katalog, dan konteks menjaga hasil lama tetap ditandai usang.
- Outfit tersimpan dengan snapshot item, duplikasi, favorit, arsip/pulihkan, dan tandai dipakai sekali per outfit per tanggal perangkat.
- Skema penyimpanan tervalidasi, namespace lokal per akun, mode sementara saat data rusak/penyimpanan diblokir, download cadangan metadata JSON, serta deteksi perubahan dari tab lain.

Draft belum lengkap dapat disimpan dengan label draft; tidak dapat ditandai sebagai outfit lengkap atau dipakai. Kombinasi manual boleh melanggar warna dress code dengan peringatan; rekomendasi wajib memenuhi syarat.

## Uji browser

Pada komputer lokal:

```bash
npx playwright install chromium
npm run test:e2e
```

Playwright menjalankan empat skenario pada desktop dan viewport 360 × 780. Drag sengaja dilewati di mobile karena jalur tap/keyboard diuji. Untuk hanya melihat daftar tes:

```bash
npm run test:e2e -- --list
```

Pada lingkungan managed Sites, suite membutuhkan `E2E_BASE_URL` dari daemon preview resmi. Tidak ada server/browser alternatif yang otomatis dijalankan di lingkungan itu. Selama pengerjaan tool `cua_repl.js` tidak tersedia, sehingga E2E browser nyata **belum dieksekusi**. Tes komponen menggunakan DOM simulasi dan tidak membuktikan layout, fokus native, atau drag di browser.

## Struktur

```text
apps/web/src/          UI, hook aplikasi, ilustrasi SVG, tes komponen
apps/api/src/          Auth guard, validasi upload Sharp, adapter Supabase privat
packages/domain/      tipe + skema Zod, aturan editor, fixture, repository lokal, tes
packages/recommender/ generator legal, ranker deterministik, rerank keragaman
services/photo-worker/ queue consumer Python, segmentasi, alpha matting, optimalisasi
supabase/             migration privat + harness tes SQL
tests/e2e/            suite Playwright desktop dan mobile
docs/                 keputusan, data dictionary, hasil verifikasi, langkah berikut
```

`CompatibilityRanker` hanya memberi skor untuk ID kandidat legal. Domain yang sama dipakai UI, generator, adapter, validasi apply, dan tes. Backend/RLS melindungi pakaian dan foto cloud; uji dua akun Supabase nyata melalui API/Storage sudah berhasil. Gemini, compatibility training, tren, dan sinkronisasi outfit belum dibuat.

## Batasan data

Pada demo, semua data berada di browser. Pada akun cloud, pakaian/foto berada di Supabase; draft/outfit/riwayat berada di browser dengan namespace akun. Menghapus data browser menghapus data lokal, tetapi tidak menghapus pakaian cloud. Tidak ada migrasi demo, impor cadangan, atau training otomatis. Cadangan lewat ikon bantuan berisi metadata/referensi foto, bukan salinan file gambar. Simpan secara pribadi. Mode sementara tidak menimpa penyimpanan yang rusak.

Pengecekan token menghindari penimpaan perubahan tab lain yang sudah terdeteksi. `localStorage` tidak menyediakan transaksi antartab: dua penulisan pada saat yang persis sama masih dapat berlomba. Gunakan satu tab untuk mengedit; optimistic locking server menjadi pekerjaan M2.

## Setelah ini

Uji alur browser dan beberapa foto pakaian nyata dengan tepi/warna latar yang menantang. Koneksi dan uji dua akun melalui API/Storage sudah berhasil; deployment backend/worker belum dilakukan. Belum memerlukan dataset training: segmentasi memakai model pretrained. Lihat [setup](docs/SUPABASE_SETUP.md), [keputusan media](docs/decisions/002-private-photo-pipeline.md), dan [batas ranker demo](docs/model-cards/demo-rules-v1.md).
