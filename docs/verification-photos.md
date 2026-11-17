# Verifikasi foto privat dan Supabase · v0.2

Perubahan ini mencakup upload PNG/JPG, validasi gambar, Auth/lemari/Storage privat, antrean worker, segmentasi pretrained, alpha matting dan optimalisasi lossless. Ini bukan seluruh M2: sinkronisasi outfit, Gemini NLP, autotag, dan model rekomendasi hasil training belum diimplementasikan.

## Pemeriksaan yang dijalankan

| Pemeriksaan | Hasil |
| --- | --- |
| Lint + TypeScript | Lulus. |
| Vitest domain, API boundary, komponen | 45 tes lulus; default tests tidak menghubungi project Supabase meski `.env` tersedia. |
| Python worker/pipeline | 11 tes lulus; alpha dipertahankan, empty mask ditolak, matting tile dibatasi, lease usang dibersihkan, outcome finalisasi tak diketahui tidak menghapus hasil yang mungkin sudah commit. |
| Migration dan isolation PostgreSQL 17 | Lulus pada database sementara: owner RLS, penolakan write/claim worker oleh user, penolakan akses B ke A, FK owner/item, claim/lease/finalize, cascade delete. Stand-in auth/storage dinyatakan eksplisit. |
| Inference BiRefNet Lite sungguhan | Lulus untuk satu contoh pakaian buatan sendiri pada dua ukuran; tidak menggunakan dataset atau foto pribadi. Lihat JSON smoke. |
| Uji Supabase live dengan dua akun | Lulus pada project pengguna setelah pemilik menjalankan migration. Akun/file/record sementara telah dihapus. |
| Build mode cloud dan demo lokal | Build diperiksa terpisah. Demo yang dikomit tidak memuat konfigurasi project atau key, dan seluruh aset HTML inline. |
| E2E browser | Belum terverifikasi: tool browser `cua_repl.js` tidak tersedia. Suite yang ada dapat ditemukan, tetapi discovery bukan eksekusi browser. Tidak ada server preview/browser alternatif yang dibuat. |

Log terkurasi berada di `docs/checks/photos/`. File environment, token/JWT, password, signed URL, foto pribadi, model cache, dan virtualenv tidak dimasukkan ke repository.

## Hasil live Supabase

Uji eksplisit `scripts/smoke-supabase.ts` membuat dua akun terkonfirmasi menggunakan Admin API tanpa mengirim email, kemudian menjalankan operasi aplikasi dengan JWT masing-masing. Urutan yang berhasil:

1. Dua akun sementara dibuat dan masuk melalui Supabase Auth.
2. API memverifikasi JWT, mendecode/re-encode foto PNG, menyimpan original privat, dan mengantrekan aset.
3. Akun B tidak melihat row pakaian A, tidak mendapat signed URL foto A, dan tidak bisa menghapus pakaian A. Akun biasa ditolak saat memanggil RPC worker.
4. Worker Python memakai secret hanya pada server, mengklaim job, menjalankan model/alpha matting, menyimpan cutout dan thumbnail, lalu memfinalisasi lease. User A mengunduh WebP ber-alpha melalui signed URL 60 detik.
5. Penghapusan melalui API menghapus original, cutout, thumbnail, dan row aset. Kedua akun uji juga dihapus. Laporan akhir `temporaryAccountsDeleted: 2` dan `temporaryImagesDeleted: true`.

Ini menguji Auth/PostgREST/Storage asli, handler API via Fastify inject, dan worker Python, tanpa browser UI. Tidak ada data pengguna lama yang dipakai untuk tes. URL project/key hanya disimpan pada konfigurasi lokal yang diabaikan Git.

## Inference dan penggunaan memori

Varian BiRefNet penuh menyebabkan OOM/exit 137 pada limit 8 GiB. Default secara eksplisit dipilih **BiRefNet-general-lite**, tetap memakai alpha matting, lalu ONNX CPU memory arena/pattern dimatikan dan thread dibatasi.

| Contoh buatan sendiri | Output | Durasi inference + pipeline* | Peak RSS* |
| --- | --- | --- | --- |
| 768 × 896 | 1.536 × 1.792, transparan | sekitar 7,7 detik | sekitar 6,7 GiB |
| 1.536 × 1.792, matting tiled | 3.072 × 3.584, transparan | sekitar 11,3 detik | sekitar 6,7 GiB |

\* Satu run per ukuran pada CPU dua thread, model cache tersedia; bukan p95, SLA, perbandingan model, atau jaminan memori semua foto. Output memiliki alpha 0–255 dan core pakaian tetap foreground. Tidak ada metrik akurasi mask, kualitas foto nyata, atau detail blur yang diklaim. Tile 512 px + padding 64 membatasi sparse solve pada foto besar; data RGB tidak direkonstruksi generatif.

## Hal yang masih perlu diuji sebelum pilot

- Alur browser nyata: unggah, sesi habis, touch/keyboard, layout 360 px, foto gagal/muat ulang, serta pendaftaran dan pengiriman konfirmasi email untuk akun nyata.
- Kualitas pada foto pakaian asli: kain tipis/renda, warna mirip latar, hanger/manusia dalam foto, gambar blur/noisy, dan batas sambungan tile. Preview original/hasil tersedia untuk review; sumber beresolusi rendah diberi catatan.
- Mesin backend/worker yang akan berjalan terus, kebutuhan RAM untuk foto target, latency/budget, retensi dan rekonsiliasi file sementara bila worker crash.
- Model kompatibilitas fashion tetap rules demo; model segmentasi tidak menjamin ukuran, fit, atau kebenaran warna/foto.

Tidak ada deployment atau layanan berbayar yang diaktifkan. Worker memerlukan proses Python tersendiri; Supabase menyimpan database/foto, bukan menjalankan model Python ini.
