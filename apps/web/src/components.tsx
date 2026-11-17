import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import { CATEGORIES, COLORS, categoryLabel, colorLabel, type ClothingItem } from '../../../packages/domain';
import { DEMO_OWNER } from '../../../packages/domain/fixtures';
import { validatePhotoSelection } from '../../../packages/domain/media';
import { ClothingPhoto } from './ClothingPhoto';

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} className="modal" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="dialog-title">
    <div className="modal-head"><h2 id="dialog-title">{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Tutup dialog"><X size={20}/></button></div>{children}
  </dialog>;
}
export function ItemForm({ item, onSubmit, onClose, error, ownerId = DEMO_OWNER, cloudEnabled = false, onRetry }: { item?: ClothingItem; onSubmit: (item: ClothingItem, file: File | null, assetId: string) => void | Promise<void>; onClose: () => void; error?: string; ownerId?: string; cloudEnabled?: boolean; onRetry?: () => Promise<void> }) {
  const itemId = useRef(item?.id ?? crypto.randomUUID());
  const [file, setFile] = useState<File | null>(null);
  const [assetId, setAssetId] = useState(() => crypto.randomUUID());
  const [preview, setPreview] = useState('');
  const [fileError, setFileError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <Modal title={item ? 'Edit keping pakaian' : 'Tambah ke lemarimu'} onClose={() => { if (!submitting) onClose(); }}>
    <p className="muted">{cloudEnabled ? 'Unggah satu foto pakaian. Latar akan dipisahkan dan tampilan dioptimalkan setelah tersimpan.' : 'Tambah metadata untuk demo lokal. Masuk ke cloud untuk mengunggah dan menyimpan foto.'}</p>
    {error && <p className="warning" role="alert">{error}</p>}
    {fileError && <p className="warning" role="alert">{fileError}</p>}
    <form className="form-stack" aria-busy={submitting} onSubmit={async e => {
      e.preventDefault(); const form = new FormData(e.currentTarget);
      if (cloudEnabled && !item && !file) { setFileError('Pilih foto PNG/JPG terlebih dahulu.'); return; }
      setSubmitting(true);
      try {
        await onSubmit({ id: itemId.current, ownerId, name: String(form.get('name')).trim(), category: String(form.get('category')) as ClothingItem['category'], primaryColor: (form.get('color') || null) as ClothingItem['primaryColor'], formality: form.get('formality') ? Number(form.get('formality')) : null, status: String(form.get('status')) as ClothingItem['status'], styleTags: String(form.get('tags')).split(',').map(s => s.trim()).filter(Boolean), layerWarmth: form.get('warmth') ? Number(form.get('warmth')) : null, ...(item?.illustration && item.category === form.get('category') ? { illustration: item.illustration } : {}), ...(item?.photoRef ? { photoRef: item.photoRef } : {}) }, file, assetId);
      } finally { setSubmitting(false); }
    }}>
      <fieldset className="photo-form-fields" disabled={submitting}>
      {cloudEnabled && <div className="upload-section"><label>Foto pakaian (PNG/JPG, maksimal 10 MB)<input name="image" type="file" accept="image/png,image/jpeg" required={!item} onChange={e => {
        const selected = e.target.files?.[0] ?? null; setFileError('');
        if (selected) { const problem = validatePhotoSelection(selected); if (problem) { setFileError(problem); e.target.value = ''; setFile(null); return; } }
        setFile(selected); setAssetId(crypto.randomUUID());
      }}/></label>{file && preview && <img className="upload-preview" src={preview} alt="Pratinjau foto sebelum diproses"/>}<p className="fine-print">Foto asli tetap disimpan. Hasil olahan mempertahankan transparansi; foto buram mungkin tetap kehilangan detail.</p></div>}
      {item?.photoRef && <div className="photo-comparison"><div><span>Foto asli</span><ClothingPhoto key={`${item.photoRef.assetId}-original`} item={item} variant="original"/></div><div><span>Hasil tanpa latar</span>{item.photoRef.status === 'ready' ? <ClothingPhoto key={`${item.photoRef.assetId}-cutout`} item={item} variant="cutout"/> : <p className="fine-print">{item.photoRef.status === 'failed' ? 'Belum berhasil. Foto asli tetap aman.' : 'Masih menunggu hasil pemrosesan.'}</p>}</div>{item.photoRef.status === 'failed' && onRetry && <button className="secondary" type="button" onClick={async () => { setSubmitting(true); try { await onRetry(); } finally { setSubmitting(false); } }}>Coba proses lagi</button>}{item.photoRef.warning === 'low_resolution' && <p className="fine-print">Resolusi sumber rendah. Pembesaran tidak menjamin detail baru.</p>}</div>}
      <label>Nama pakaian<input name="name" required maxLength={80} defaultValue={item?.name} placeholder="Misalnya: Kemeja linen putih" autoFocus/></label>
      <div className="form-row"><label>Kategori<select name="category" defaultValue={item?.category ?? 'top'}>{CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel[c]}</option>)}</select></label><label>Warna utama<select name="color" defaultValue={item?.primaryColor ?? ''}><option value="">Belum diketahui</option>{COLORS.map(c => <option key={c} value={c}>{colorLabel[c]}</option>)}</select></label></div>
      <div className="form-row"><label>Formalitas<select name="formality" defaultValue={item?.formality ?? ''}><option value="">Belum diketahui</option>{[1, 2, 3, 4, 5].map(n => <option value={n} key={n}>{n} · {['', 'Santai', 'Kasual rapi', 'Smart casual', 'Formal', 'Sangat formal'][n]}</option>)}</select></label><label>Status<select name="status" defaultValue={item?.status ?? 'available'}><option value="available">Tersedia</option><option value="unavailable">Tidak tersedia / laundry</option><option value="archived">Diarsipkan</option></select></label></div>
      <label>Tag gaya (pisahkan dengan koma)<input name="tags" maxLength={120} placeholder="earth_tone, smart_casual" defaultValue={item?.styleTags.join(', ')}/></label>
      <label>Kehangatan<select name="warmth" defaultValue={item?.layerWarmth ?? ''}><option value="">Belum diketahui</option><option value="0">Ringan</option><option value="1">Sedang</option><option value="2">Hangat</option><option value="3">Sangat hangat</option></select></label>
      <p className="fine-print">Terusan, penutup kepala, dan aksesori bisa dicatat. Template papan awal mendukung atasan, bawahan, sepatu, dan luaran.</p>
      <button className="primary" type="submit"><Plus size={16}/>{submitting ? 'Menyimpan foto dan pakaian…' : item ? 'Simpan perubahan' : 'Tambah keping'}</button>
      </fieldset>
    </form>
  </Modal>;
}
export function ItemTools({ item, onEdit, onDelete }: { item: ClothingItem; onEdit: (item: ClothingItem) => void; onDelete: (item: ClothingItem) => void }) {
  return <div className="item-tools"><button className="icon-btn" aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}><Pencil size={13}/></button><button className="icon-btn" aria-label={`Hapus ${item.name}`} onClick={() => onDelete(item)}><Trash2 size={13}/></button></div>;
}
