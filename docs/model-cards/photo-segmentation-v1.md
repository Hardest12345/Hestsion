# Photo segmentation · birefnet-lite-alpha-lanczos-v1

## Tujuan dan provenance

Memisahkan latar satu foto pakaian milik pengguna untuk ditampilkan sebagai keping visual. Segmentation memakai pretrained `birefnet-general-lite` dari rembg 2.0.76, dengan alpha matting berbasis pymatting; tidak ada training baru atau pengumpulan dataset. Model card BiRefNet upstream menyatakan MIT. Salinan atribusi rembg/BiRefNet ada di `docs/licenses/`.

- [Model card BiRefNet](https://huggingface.co/ZhengPeng7/BiRefNet)
- [Implementasi rembg Lite](https://github.com/danielgatis/rembg/blob/main/rembg/sessions/birefnet_general_lite.py)
- [BiRefNet license](https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE)

Bobot ONNX default Lite sekitar 224 MB; rembg memvalidasi checksum unduhan yang ada pada versi paket. Bobot tidak didistribusikan dalam repo. Jangan menonaktifkan pengecekan checksum untuk setup normal.

## Preprocessing dan output

API menerima PNG/JPG, satu gambar 10 MB, 32 px minimal per sisi dan 24 MP maksimal. Decode/re-encode PNG ke sRGB dengan orientasi benar membuang EXIF/GPS. Original yang dinormalisasi disimpan privat.

Worker membatasi sisi panjang kerja sampai 4.096 px. Encoder BiRefNet membuat mask, alpha matting memakai threshold foreground 240/background 10 dan erosi 5. Foto sampai 1.024 px dimatting langsung; foto lebih besar dimatting per core tile 512 dengan konteks 64 di tepi, tanpa downsampling khusus per tile. Tile known background/foreground dipertahankan; konteks trimap yang tidak memadai menggagalkan job. Transparansi input dikalikan dengan alpha hasil, bukan ditimpa.

Lanczos memperbesar maksimal 2× dan menjaga sisi panjang ≤4.096 px, kemudian sharpening RGB ringan. Alpha tidak ditajamkan. Cutout/thumbnail memakai WebP lossless, aspect ratio dipertahankan. Tidak ada model generative enhancement atau super-resolution pada versi ini. Pembesaran tidak mengembalikan detail yang sudah hilang.

## Bukti dan batas

Uji unit, smoke model sungguhan pada dua ukuran contoh buatan sendiri, serta jalur upload/worker/download/delete dengan dua akun Supabase sudah dijalankan. Laporan ada di `docs/verification-photos.md`. Belum ada eval dataset pakaian nyata atau ground-truth mask; tidak ada klaim akurasi/hairline/fit.

Model penuh menyebabkan OOM pada limit 8 GiB sehingga tidak menjadi default. Lite dengan konfigurasi memori yang dipakai mencapai sekitar 6,7 GiB pada contoh yang diuji. CPU inference tidak cocok diasumsikan berjalan dalam Supabase Edge Function atau server ber-RAM kecil. Benchmark mesin dan foto target sebelum pilot.

BiRefNet adalah salient-object segmentation, bukan segmenter kategori pakaian yang dilatih khusus aplikasi ini. Foto dengan beberapa pakaian, orang, hanger, kain transparan, atau latar mirip dapat menghasilkan mask yang perlu diperiksa. Alpha matting per tile dapat menunjukkan perbedaan tepi lokal; sediakan original/hasil untuk review. Kegagalan tidak menggantikan original atau berpura-pura menghasilkan foto siap.

## Privasi dan lifecycle

User memilih upload. Worker sendiri memproses original privat dan tidak mengirim foto ke penyedia generatif atau dataset training. ONNX telemetry dinonaktifkan. API biasa memakai JWT user + RLS, secret server hanya untuk worker/fixture test. Signed URL pendek tidak masuk localStorage. Hasil per lease tidak dapat menimpa output lease baru; penghapusan item menghapus file original dan turunannya melalui API.
