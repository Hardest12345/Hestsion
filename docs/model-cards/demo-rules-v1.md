# demo-rules-v1 · baseline deterministik

Ini kumpulan aturan, **bukan model hasil training**. Tidak ada dataset training, metrik prediksi, atau klaim akurasi fashion.

## Kontrak dan fitur

Adapter `CompatibilityRanker.scoreBatch` menerima kandidat legal dan `Map<itemId, features>`. Feature schema awal `[formality, neutralColor, warmth]`, dengan formality 0 sebagai sentinel atribut tidak diketahui, neutralColor 0/1, warmth 0–3. Compatibility baseline memakai cohesion formalitas yang diketahui dan proporsi warna netral. Atribut tidak diketahui tidak memenuhi filter warna wajib.

Compatibility = `0.65 × cohesion + 0.35 × neutralRatio`.

Urutan akhir di orchestrator: `0.55 × compatibility + 0.25 × kedekatan formalitas konteks + 0.20 × preferensi palet`. Palet tidak dipilih memakai prior 0.5. Outer pada cuaca panas mendapat penalti 0.06. Warmth disediakan di kontrak fitur tetapi belum dipakai pada skor compatibility. Cuaca tidak memprediksi kenyamanan, ketahanan hujan, atau ukuran. Jika target formalitas eksplisit kosong, kegiatan menentukan target default.

Bobot dipilih sebagai baseline yang dapat direvisi, bukan hasil fitting. Earth tone dipetakan ke cream/brown/olive/ivory. Tidak ada sinyal tren. Hasil maksimum tiga kombinasi berbeda dengan penalti kemiripan pada slot editable 0.12.

## Legalitas sebelum skor

Pool hanya item pemilik yang available, sesuai kategori dan seluruh filter ketat. Locks, slot terisi pada fill_empty, dan slot nontarget pada replace_slots bersifat tetap. Item lama dikeluarkan dari pool slot pengganti. Outer default tidak ditambahkan pada fill_empty kecuali diwajibkan. Semua hasil lengkap dan divalidasi ulang sebelum dikirim serta diterapkan.

Kombinasi teoretis ≤2.000 dieksplorasi penuh. Di atas batas tersebut, pool diurutkan berdasarkan target formalitas dan ID, lalu ekspansi dibatasi 50 prefix per tingkat dan shortlist maksimal 200. Ini pencarian deterministik terbatas, belum beam search berbasis skor parsial penuh. `searchTruncated` ditampilkan; tidak ada klaim bahwa hasil yang tidak ditemukan mustahil.

Output adapter harus memiliki tepat satu skor finite per kandidat tanpa ID tambahan. Output invalid/error kembali ke baseline. Adapter remote, timeout layanan, feature mismatch artefak, dan shadow scoring model terlatih berada di luar M1.

## Batas dan evaluasi

Baseline tidak memahami potongan, ukuran, tubuh pengguna, material, pola, selera personal terlatih, visual foto, atau konteks budaya rinci. Kualitas estetika belum dievaluasi oleh pengguna. Tes memeriksa legalitas, semantik mode, determinisme, kelengkapan, fallback, dan penyimpanan; hasilnya ada di `docs/verification.md`. Tidak ada benchmark latency 100 item atau holdout fashion yang diklaim pada M1.
