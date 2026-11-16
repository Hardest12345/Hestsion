# Langkah berikut dan bantuan yang diperlukan

## Sekarang: validasi alur, belum training

Tidak perlu menyiapkan dataset besar, API key, atau akun berbayar untuk menjalankan Studio ini. Masukkan lima pakaian nyata sebagai metadata, lalu coba lima keputusan outfit sungguhan. Catat konteks, keping yang wajib, waktu sampai memilih, alternatif yang diterima/ditolak, alasan penolakan, dan apakah benar dipakai. Angka lima adalah ukuran eksplorasi pribadi, bukan minimum untuk melatih model.

Bantuan pemilik produk yang paling berguna: berikan temuan dari alur tersebut, jenis acara yang paling sering, dan apakah template atasan/bawahan/sepatu/luaran cukup. Kebutuhan dress, hijab, atau aksesori menentukan template lanjutan; kategori itu belum bisa dipasang pada papan awal.

## Berikutnya: M2 secara bertahap

Langkah terkecil adalah menambahkan satu backend TypeScript dan repository Supabase untuk wardrobe, lalu membuktikan isolasi dua akun test dengan RLS sebelum migrasi data nyata. Setelah boundary itu stabil, tambah penyimpanan outfit atomik, foto privat, dan terakhir Gemini intent terstruktur dengan fallback form.

Pada tahap itu diperlukan project Supabase development, dua akun test, dan keputusan batas biaya/retensi log. Gemini API key baru diperlukan saat integrasi NLP dimulai. Secret harus dimasukkan lewat konfigurasi server yang aman, tidak perlu dikirim di chat atau ditaruh pada `VITE_*`. Data demo tidak diunggah otomatis.

## M3: persiapan dataset ketika memang mulai dibutuhkan

Gunakan koleksi outfit yang hak penggunaannya jelas: kurasi milik sendiri atau kontribusi sukarela dengan izin tertulis yang menyebut tujuan training. Foto pribadi, feedback runtime, dan fixture demo bukan dataset training otomatis. Belum ada data eksternal yang dikumpulkan pada pekerjaan ini.

Rancangan tabel yang nanti perlu disepakati:

| Berkas | Kolom awal yang disarankan |
| --- | --- |
| items.csv | item_id, category, primary_color, formality_nullable, style_tags, asset_id_nullable |
| outfits.csv | outfit_id, top_id, bottom_id, shoes_id, outer_id_nullable, occasion, label_type, curator_id_pseudonymous |
| judgments.csv | outfit_id, context_id, label/relative_rank, reason, annotator_id_pseudonymous, label_provenance |
| rights_manifest.csv | source_id, asset_id, rights_holder, allowed_uses, attribution, consent_version, collected_at, checksum, restrictions |

Jangan menganggap semua kombinasi yang tidak dipilih sebagai negatif. Alternatif yang mengganti satu item dalam kategori sama perlu dinilai; simpan weak label jika memang sintetis. Pecah data berdasarkan outfit dan kelompok item yang sama/mirip untuk menghindari kebocoran, sisakan holdout sebelum tuning. Feedback personal memakai split waktu.

Jumlah data ditentukan dari keragaman lemari/konteks dan learning curve, bukan angka minimum yang ditebak. Mulai model metadata sederhana, bandingkan dengan baseline pada holdout yang sama, dan pertahankan shadow jika bukti belum cukup. Data card/model card, lisensi, parity train–serve, dan 0 pelanggaran aturan menjadi gate. Polyvore atau dataset publik lain perlu audit hak metadata dan gambar untuk tujuan yang dipilih, bukan langsung dipakai secara komersial.

Keputusan tersebut adalah persiapan roadmap. Tidak ada pipeline training, scraping, bandit, atau layanan cloud yang dijalankan pada M1.
