# 001 · Batas implementasi Studio lokal

Status: diterapkan. Tanggal: 16 November 2026 (Asia/Jakarta, tanggal brief).

Brief diperlakukan sebagai spesifikasi produk untuk permintaan pengguna memulai eksekusi. Roadmap M2–M5 bukan pekerjaan aktif. Workspace awal kosong dan tidak memiliki konvensi repo atau AGENTS.md yang ditemukan dalam workspace.

## Keputusan

1. React + TypeScript + Vite, satu `package.json` dan satu `package-lock.json`. Direktori domain/recommender sesuai brief, tanpa workspace package-manager atau microservice yang belum diperlukan.
2. Tiga layar memakai tab state lokal; URL rute yang ada di brief bersifat usulan. Auth/settings cloud belum dibuat. Form konteks disimpan bersama draft.
3. Template `separates_v1` memiliki tiga slot wajib dan luaran opsional. Tap pada pakaian otomatis menarget kategori yang sesuai, atau slot yang telah dipilih; keyboard memakai tombol native. Desktop mendapat native drag-and-drop tanpa library tambahan.
4. SVG thumbnail buatan sendiri berada di komponen `Garment`. Semuanya ilustrasi demo, bukan foto asli atau gambar dari penyedia AI. Tidak ada unduhan data, font web, analitik, atau aset pihak ketiga pada runtime.
5. Metadata demo diberi `ownerId=demo-local-user` untuk menegakkan kontrak ownership di domain. Ini bukan login maupun isolasi akun sungguhan. API/auth/RLS akan dibuat pada M2.
6. Semua rekomendasi melalui form dan memakai ranker `demo-rules-v1`, tanpa angka persentase kecocokan. NLP, custom ranker, tren, autotag, generasi gambar, dan bandit tidak dipasang. `trendMode` hanya menerima `off`.
7. Seluruh alternatif harus dipratinjau lalu diterapkan. Aksi manual membatalkan pratinjau. Hasil memeriksa revision papan, revision katalog, dan konteks, lalu memvalidasi kandidat lagi saat apply.
8. Penyimpanan satu dokumen JSON berskema versi 1, sekali `setItem` per perubahan data. Saved outfits memiliki snapshot immutable; setiap simpan membuat ID baru. Mengubah nama/kategori/status pakaian tidak menulis ulang snapshot outfit lama. Kategori item di papan harus dilepas dahulu sebelum diubah; penghapusan item di papan juga memerlukan pelepasan eksplisit.
9. Draft belum lengkap diperbolehkan. Aturan warna tidak membatasi save manual; warning ditampilkan. Availability yang berubah tidak diam-diam menghapus slot atau lock. Rekomendasi menolak item tersebut, outfit lama tetap dapat ditampilkan melalui snapshot.
10. Undo/Redo dibatasi 50 snapshot dan hanya hidup di sesi aktif. Reload mempertahankan draft/outfit, tetapi menghapus riwayat undo. Sumber draft ikut disimpan; edit/undo/redo setelah rekomendasi mencatat `mixed` tanpa memberi kredit kandidat penuh.
11. Event lokal mencatat preview, apply, save, worn. Worn dideduplikasi per outfit per tanggal perangkat, terpisah dari favorit. Log ini bukan impression/feedback ledger produksi dan tidak otomatis menjadi data training.
12. Token penyimpanan + event `storage` mendeteksi perubahan tab lain secara optimistis. Race tepat bersamaan belum dijamin transaksional; satu tab edit disarankan pada demo. M2 memakai expectedVersion + transaksi database.
13. Data tidak valid tidak ditimpa atau di-seed ulang. Mode sementara dimulai dengan lemari kosong. Reset ke demo memerlukan tindakan eksplisit; cadangan raw data lama dapat diunduh. Impor cadangan belum dibuat.
14. Build single-file ditambahkan untuk handoff offline. Server dev lokal tetap cara utama karena perilaku `localStorage` untuk `file://` bervariasi antarbrowser.

## Batas verifikasi lingkungan

Skill Sites tersedia sebagai sumber cloud, tetapi helper filesystem installer tidak terpasang, sehingga dependency diinstal dengan npm pada checkout dan cache workspace. Profil managed aktif, CLI preview ada, tetapi tool browser `cua_repl.js` tidak ditawarkan dalam sesi ini. Mengikuti panduan Sites, tidak ada server preview, instalasi browser, atau jalur kontrol browser alternatif yang dijalankan. Unit/component, lint, typecheck, build, serta discovery suite Playwright dapat diperiksa; E2E aktual, visual 360 px, native focus, dan drag belum terverifikasi. Tidak ada Site yang diregistrasikan atau dipublikasikan karena cakupan lokal.
