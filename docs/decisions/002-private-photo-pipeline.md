# 002 · Foto pakaian, segmentasi, dan Supabase

Status: implementasi dan koneksi development terverifikasi; deployment belum dilakukan. Tanggal: 17 November 2026.

Permintaan baru pengguna memperluas batas M1 untuk upload PNG/JPG, remove background dengan masking detail, peningkatan tampilan, dan Storage Supabase. Ini mengizinkan implementasi media/auth yang dibutuhkan, bukan seluruh roadmap NLP/ML/tren. Pengguna telah memberikan URL project dan secret key server; nilainya hanya disimpan pada environment worker privat yang diabaikan Git. Publishable key diterima terpisah; rotasi secret yang dibagikan di chat disarankan. Pengguna menjalankan migration melalui SQL Editor; hanya migration SQL dipublikasikan pada checkpoint pertama. Preferensi unggah source ke `Hardest12345/Hestsion` tetap berlaku.

## Alur

Browser → backend terautentikasi → decode/re-encode PNG → Storage privat → enqueue transaksi → worker Python → BiRefNet-general-lite mask → alpha matting → Lanczos/sharpening → lossless WebP + thumbnail → finalisasi lease → thumbnail di lemari/papan/outfit.

Foto asli dinormalisasi tanpa EXIF/GPS dan disimpan terpisah. Form memakai metadata yang dikonfirmasi pengguna; belum ada autotag. File dan signed URL tidak masuk localStorage. Metadata foto berisi storage key, ID aset, status, versi pipeline, dimensi, dan catatan kualitas.

## Pilihan teknis

- Fastify + Supabase JS untuk backend. JWT diverifikasi dengan Auth `getUser`; client database membawa JWT yang sama. Tidak memakai service role untuk jalur pengguna.
- Supabase Auth email/password adalah boundary minimum sebelum mengaktifkan foto privat. Demo terpisah, tanpa migrasi otomatis. Cache/draft/outfit dipisahkan menurut user ID. Outfit/wear log belum disinkronkan ke cloud.
- Sharp memvalidasi magic bytes, MIME, decode, dimensi (minimal 32 px, maksimal 24 MP), file tunggal maksimal 10 MB, orientasi dan metadata. SVG/GIF/HEIC bukan format input versi ini. Nama file pengguna tidak menjadi storage path.
- Bucket `wardrobe-images` privat, path `<user>/<item>/<asset>/original.png`. Derived output memakai `<user>/<item>/<asset>/runs/<lease>/...`, sehingga lease kedaluwarsa tidak menulis ulang output worker baru.
- RLS membatasi pakaian/aset/folder owner. FK komposit mengikat pointer foto ke owner dan item yang sama. User tidak dapat memperbarui status worker atau menjalankan RPC claim/finalize.
- Queue tersimpan di Postgres melalui tabel aset. Claim memakai `FOR UPDATE SKIP LOCKED`, lease token, timeout 10 menit, maksimal tiga percobaan otomatis. Retry eksplisit tersedia untuk aset gagal.
- BiRefNet-general-lite dipakai sebagai model segmentasi pretrained melalui rembg CPU. Tidak ada training atau kebutuhan dataset pengguna. Model card upstream menyatakan MIT; atribusi rembg dan BiRefNet disertakan. Bobot tidak ditaruh dalam repo.
- Alpha matting dipanggil langsung, bukan fallback diam-diam ke hard mask. Error menjadi job gagal dengan original tetap tersedia. Transparansi sumber dipertahankan dengan perkalian alpha.
- Peningkatan awal adalah resampling Lanczos maksimal 2×/sisi 4.096 px dan UnsharpMask ringan pada RGB. Alpha tidak ditajamkan. WebP lossless menjaga alpha dan menghindari encoding berulang yang merusak. Ini bukan model super-resolution dan tidak menjanjikan pemulihan detail blur atau mengarang motif/tekstur baru.
- UI memperlihatkan preview sumber, antre/proses/siap/gagal, retry, dan perbandingan asli/hasil. Hasil job hanya mengubah foto aset yang sama; tidak mengganti ID pakaian di papan.
- ONNX Runtime telemetry dinonaktifkan pada adapter segmentasi. Foto diproses di worker sendiri, tidak dikirim untuk training atau ke API generatif.

## Verifikasi dan batas

Tes Node/DOM/Sharp dan Python mencakup input rusak/palsu, auth guard, path, pemisahan akun cache, antrean, lease, transparansi, alpha preservation, dan hasil lama. Harness PostgreSQL menjalankan migration serta menguji RLS/FK dengan role A/B; auth/storage helpers adalah stand-in, belum instance Supabase live. Smoke inference Lite dan dua akun Supabase live sudah lulus; batas browser dicatat pada laporan terbaru.

URL/publishable key tersedia dan konfigurasi lokal privat terpasang. Pengguna telah menerapkan migration sendiri melalui SQL Editor karena Data API secret tidak dapat menjalankan DDL. Uji live membuat dua akun sementara tanpa email, melakukan operasi aplikasi menggunakan JWT mereka, lalu membersihkan seluruh akun dan foto uji. Tidak ada data pengguna lama yang dibaca untuk pengujian. Belum ada deployment atau layanan berbayar yang diaktifkan. Uji dua akun Supabase nyata sudah berhasil. Kualitas mask pada foto nyata (termasuk tepi renda/warna mirip latar), kapasitas CPU, retensi, dan rekonsiliasi objek sementara masih perlu dilakukan sebelum pilot.

Uji runtime menemukan varian penuh BiRefNet-general (bobot sekitar 973 MB) menyebabkan OOM/exit 137 pada environment 8 GiB saat pemuatan/inferensi. Default diganti secara eksplisit ke BiRefNet-general-lite dan pipeline diberi versi `birefnet-lite-alpha-lanczos-v1`; alpha matting, resampling, dan format lossless tetap sama. Kualitas mask pada foto nyata belum dinyatakan setara dengan varian penuh. Hasil smoke varian Lite dilaporkan terpisah, bukan diasumsikan berhasil.

Pengaturan ONNX menonaktifkan CPU memory arena/pattern, membatasi thread, dan memakai eksekusi sequential; fixture yang sama turun dari peak RSS sekitar 7,7 GiB menjadi 6,7 GiB. Input besar memakai alpha matting tile 512 px dengan padding 64 px agar tidak membangun satu sparse solve sebesar foto penuh; core tile dirakit kembali tanpa menurunkan resolusi piksel foto. Job gagal bila konteks trimap tidak memadai, bukan diam-diam dinyatakan siap. Angka ini berasal dari contoh buatan sendiri, bukan SLA, p95, atau jaminan memori semua foto.
