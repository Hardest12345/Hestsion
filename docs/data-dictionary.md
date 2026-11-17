# Data dictionary · local.v1

| Entitas | Data dan aturan |
| --- | --- |
| ClothingItem | ID fisik unik, owner demo, nama, kategori, warna kanonis atau `null`, status, formalitas 1–5 atau `null`, warmth 0–3 atau `null`, styleTags, jenis ilustrasi opsional. |
| BoardDraft | Template `separates_v1`, revision monoton, empat referensi item nullable, daftar lock unik pada slot berisi. Satu item tidak boleh duplikat. |
| StyleIntent | Kegiatan, cuaca manual, warna wajib per slot, ID yang dikecualikan (kontrak domain), target formalitas, palet opsional, tren off. Form tidak mengekspos exclusions pada versi ini. |
| RecommendationRequest | Snapshot papan + intent, mode, targetSlots untuk replace, limit 1–3. Ownership dari parameter repository demo, bukan prompt. |
| OutfitCandidate | Tiga slot wajib berisi ID legal, outer nullable, ID kandidat deterministik, changedSlots, reasonCodes, penjelasan template. Skor internal bukan probabilitas. |
| SavedOutfit | ID, nama, version 1, snapshot papan/item, timestamp ISO UTC, favorit dan arsip terpisah, source manual/recommendation/mixed. Save baru tidak menimpa versi lama. |
| Local event | ID, jenis preview/applied/saved/worn, outfitId opsional, fingerprint slot, timestamp UTC, source, candidateId opsional. Belum ada log exposure atau propensity. |
| LocalData | schemaVersion 1, token optimistic, catalogRevision, items, board, intent, draftSource/draftCandidateId, outfits, events. Ditulis ke `outfit-puzzle.local.v1`. |

Tanggal dipakai memakai zona waktu perangkat/browser. Tidak ada transfer data ke server atau consent training pada versi ini. Kontrak multiakun dan logging produksi tetap mengikuti roadmap M2, bukan data lokal ini.

## Ekstensi foto/cloud v0.2

Mode cloud sekarang menyimpan pakaian dan foto melalui Supabase. Paragraf local.v1 di atas menggambarkan demo awal; outfit/wear log tetap lokal dan bukan ledger produksi.

`ClothingItem.photoRef` opsional memuat `assetId`, `status` queued/processing/ready/failed, `originalKey`, `cutoutKey`, `thumbnailKey`, dimensi output nullable, warning `low_resolution`, `errorCode`, dan `pipelineVersion`. Tidak ada byte foto atau signed URL dalam cache lokal. Cache per akun memakai `outfit-puzzle.local.v1.account.<userId>`; demo memakai key awal dan tidak di-seed pada akun cloud.

`clothing_items` cloud berkey komposit user_id/id dan menyimpan metadata tervalidasi + pointer aset aktif. `clothing_assets` memuat original dan output per lease, status job, attempts, lease token/expiry, dimensi, dan warning. Pointer FK mengikat owner/item yang sama. Metadata foto lama dipertahankan pada snapshot outfit; bila aset aslinya telah dihapus, tampilkan foto tidak tersedia, bukan meminjam aset akun lain.
