# Outfit Puzzle · Studio lokal v0.1

Implementasi awal Milestone 1 dari brief: lemari → rakit → kunci → rekomendasi form → pratinjau → terapkan → simpan → tandai dipakai. Antarmuka Bahasa Indonesia, React + TypeScript + Vite, seluruh data runtime di browser. Tidak ada akun, secret, panggilan API, foto eksternal, model terlatih, atau deployment.

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

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Build menghasilkan **satu `dist/index.html`** dengan JavaScript, CSS, ikon, dan ilustrasi di dalamnya. Berkas `outfit-puzzle-demo.html` pada paket hasil merupakan salinan build tersebut. Bisa dicoba dengan membuka berkas di browser modern; akses penyimpanan pada `file://` mengikuti kebijakan browser. Server lokal di atas adalah cara yang disarankan untuk persistence yang konsisten. Belum ada verifikasi browser nyata di lingkungan pengerjaan; lihat `docs/verification.md`.

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
- Tambah, edit, hapus, pencarian, filter kategori, dan status pakaian. Foto belum diunggah; thumbnail SVG dibuat sendiri.
- Empat slot semantik, pembatasan kategori/kepemilikan, kunci, lepas, reset slot terbuka, konfirmasi hapus semua jika ada lock.
- Riwayat Undo/Redo maksimal 50 aksi di sesi aktif. Draft, konteks, lemari, dan outfit tetap ada setelah reload.
- Tiga mode rekomendasi, warna wajib, formalitas/palet sebagai preferensi, konflik eksplisit, tanpa kandidat palsu.
- Pratinjau non-destruktif dan revalidasi sebelum apply. Revision papan, katalog, dan konteks menjaga hasil lama tetap ditandai usang.
- Outfit tersimpan dengan snapshot item, duplikasi, favorit, arsip/pulihkan, dan tandai dipakai sekali per outfit per tanggal perangkat.
- Skema penyimpanan tervalidasi, mode sementara saat data rusak/penyimpanan diblokir, download cadangan JSON, serta deteksi perubahan dari tab lain.

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
packages/domain/      tipe + skema Zod, aturan editor, fixture, repository lokal, tes
packages/recommender/ generator legal, ranker deterministik, rerank keragaman
tests/e2e/            suite Playwright desktop dan mobile
docs/                 keputusan, data dictionary, hasil verifikasi, langkah berikut
```

`CompatibilityRanker` hanya memberi skor untuk ID kandidat legal. Domain yang sama dipakai UI, generator, adapter, validasi apply, dan tes. Backend, RLS, Supabase, Gemini, dan pipeline training belum dibuat; ini bukan batas keamanan multiakun.

## Batasan data

Data hanya berada di browser pada origin tersebut. Menghapus data browser menghapus data aplikasi. Tidak ada sinkronisasi, impor cadangan, migrasi ke akun, atau training otomatis. Download cadangan lewat ikon bantuan; berkas JSON berisi data lokal dan perlu disimpan secara pribadi. Mode sementara tidak menimpa penyimpanan yang rusak; cadangkan data lama sebelum reset eksplisit.

Pengecekan token menghindari penimpaan perubahan tab lain yang sudah terdeteksi. `localStorage` tidak menyediakan transaksi antartab: dua penulisan pada saat yang persis sama masih dapat berlomba. Gunakan satu tab untuk mengedit; optimistic locking server menjadi pekerjaan M2.

## Setelah ini

Mulai dari lima keputusan outfit nyata untuk menguji manfaat produk. **Belum memerlukan dataset training atau API key.** Lihat `docs/next-steps.md` untuk persiapan M2 dan dataset M3, serta `docs/model-cards/demo-rules-v1.md` untuk batas rekomendasi demo.
