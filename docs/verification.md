# Verifikasi Milestone 1

Hasil faktual dari perintah yang dijalankan pada checkout ini. Log lengkap berada di `docs/checks/`. Tidak ada pemanggilan API berbayar atau pengujian yang menggunakan secret.

| Perintah | Hasil |
| --- | --- |
| `npm run lint` | Lulus, exit 0. |
| `npm run typecheck` | Lulus, exit 0. |
| `npm test` | Lulus, 29 tes: 20 domain/repository/recommender dan 9 komponen/alur UI, exit 0. |
| `npm run build` | Lulus, exit 0; satu `dist/index.html`, sekitar 403 kB sebelum gzip. |
| `npm run test:e2e -- --list` | Lulus discovery, 8 kombinasi tes/proyek terdaftar; ini bukan eksekusi tes. |
| `npm run test:e2e` | Terhenti sebelum browser/server dimulai, exit 1: managed preview membutuhkan URL resmi. Tool `cua_repl.js` tidak tersedia pada sesi ini, sehingga preview/browser alternatif tidak dimulai sesuai panduan Sites. |
| Audit HTML build | Satu inline script dan nol resource eksternal pada atribut HTML. Ukuran/hash dicatat di `checks/offline-artifact.json`. Audit statis tidak membuktikan eksekusi browser. |

Build mengeluarkan peringatan anotasi komentar dari dependency Zod; Rollup membuang komentar tersebut, lalu build selesai dengan exit 0. Tidak ada error lint/typecheck atau tes unit yang tersisa.

## Pemetaan acceptance M1

| ID | Bukti yang sudah berjalan | Yang belum terverifikasi |
| --- | --- | --- |
| A01 | Fungsi edit menolak kategori salah, papan tidak berubah. | Interaksi drag nyata. |
| A02 | Komponen menyelesaikan pemasangan melalui keyboard Enter dan tombol tanpa drag. | Touch, focus native, dan layout pada browser 360 px. |
| A03 | Generator dan komponen mempertahankan jeans terkunci, atasan putih, tersedia, milik owner. | Pengulangan di browser nyata. |
| A04 | Tes domain mempertahankan dua slot berisi meski tidak dikunci. | Browser nyata. |
| A05 | Domain dan komponen membatasi perubahan ke sepatu, mengeluarkan sepatu lama. | Browser nyata. |
| A06 | Konflik navy terkunci vs wajib putih ditampilkan dan papan tidak berubah, diuji domain/komponen. | Browser nyata. |
| A07 | Tes domain nol/satu kandidat: tidak ada hasil palsu atau duplikat. | Browser nyata. |
| A08 | Domain memeriksa revision/katalog/konteks; komponen diedit saat rekomendasi berlangsung dan menandai hasil usang. | Browser nyata pada jaringan lambat; rekomendasi M1 tidak memakai jaringan. |
| A09 | Snapshot tersimpan tidak berubah, reload komponen mempertahankan outfit, Undo/Redo bekerja hanya sesi aktif. | Reload browser nyata. |

Tambahan tes: CRUD, laundry/arsip, konfirmasi hapus semua, reset lock, manual menyimpan draft yang bertentangan dengan dress code, item terhapus tetap memiliki snapshot lama, pemilik lain ditolak, gading/null tidak memenuhi putih wajib, output adapter NaN/ID tambahan kembali ke baseline, pencarian terbatas, data lokal invalid tidak ditimpa, token tab lama ditolak, dan error kuota disampaikan sebagai kegagalan simpan.

## Batas yang masih terbuka

- Belum ada QA visual, screenshot, drag, touch, pengukuran fokus native, atau overflow 360 px dari browser sebenarnya. CSS dan suite pengujiannya tersedia; belum boleh disebut lolos.
- Tidak ada auth/RLS, penyimpanan cloud, upload foto, NLP, model training, data tren, atau evaluasi estetika pengguna. Semuanya berada di milestone berikutnya.
- Persistence memakai storage browser, bukan transaksi multiakun. Token hanya proteksi optimistis antartab; race yang tepat bersamaan tetap mungkin.
- Log aksi lokal belum menjadi ledger impression/feedback produksi atau dataset training. Cadangan dapat diunduh, tetapi impor belum tersedia.
- Audit statis memastikan resource HTML inline; fitur di browser `file://` belum diverifikasi. Server localhost direkomendasikan.

## Reproduksi tersisa pada komputer lokal

```bash
npm ci
npx playwright install chromium
npm run test:e2e
```

Jangan menganggap discovery 8 tes sebagai 8 tes lulus. Milestone 1 telah diimplementasikan dan lolos pemeriksaan di atas; gate browser nyata masih terbuka.
