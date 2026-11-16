import { useEffect, useRef, type ReactNode } from 'react';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import { CATEGORIES, COLORS, categoryLabel, colorLabel, type ClothingItem } from '../../../packages/domain';
import { DEMO_OWNER } from '../../../packages/domain/fixtures';

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} className="modal" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="dialog-title">
    <div className="modal-head"><h2 id="dialog-title">{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Tutup dialog"><X size={20}/></button></div>{children}
  </dialog>;
}
export function ItemForm({ item, onSubmit, onClose, error }: { item?: ClothingItem; onSubmit: (item: ClothingItem) => void; onClose: () => void; error?: string }) {
  return <Modal title={item ? 'Edit keping pakaian' : 'Tambah ke lemarimu'} onClose={onClose}>
    <p className="muted">Mulai dengan nama, kategori, dan warna. Foto asli menyusul pada tahap berikutnya.</p>
    {error && <p className="warning" role="alert">{error}</p>}
    <form className="form-stack" onSubmit={e => {
      e.preventDefault(); const form = new FormData(e.currentTarget);
      onSubmit({ id: item?.id ?? crypto.randomUUID(), ownerId: DEMO_OWNER, name: String(form.get('name')).trim(), category: String(form.get('category')) as ClothingItem['category'], primaryColor: (form.get('color') || null) as ClothingItem['primaryColor'], formality: form.get('formality') ? Number(form.get('formality')) : null, status: String(form.get('status')) as ClothingItem['status'], styleTags: String(form.get('tags')).split(',').map(s => s.trim()).filter(Boolean), layerWarmth: form.get('warmth') ? Number(form.get('warmth')) : null, ...(item?.illustration && item.category === form.get('category') ? { illustration: item.illustration } : {}) });
    }}>
      <label>Nama pakaian<input name="name" required maxLength={80} defaultValue={item?.name} placeholder="Misalnya: Kemeja linen putih" autoFocus/></label>
      <div className="form-row"><label>Kategori<select name="category" defaultValue={item?.category ?? 'top'}>{CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel[c]}</option>)}</select></label><label>Warna utama<select name="color" defaultValue={item?.primaryColor ?? ''}><option value="">Belum diketahui</option>{COLORS.map(c => <option key={c} value={c}>{colorLabel[c]}</option>)}</select></label></div>
      <div className="form-row"><label>Formalitas<select name="formality" defaultValue={item?.formality ?? ''}><option value="">Belum diketahui</option>{[1, 2, 3, 4, 5].map(n => <option value={n} key={n}>{n} · {['', 'Santai', 'Kasual rapi', 'Smart casual', 'Formal', 'Sangat formal'][n]}</option>)}</select></label><label>Status<select name="status" defaultValue={item?.status ?? 'available'}><option value="available">Tersedia</option><option value="unavailable">Tidak tersedia / laundry</option><option value="archived">Diarsipkan</option></select></label></div>
      <label>Tag gaya (pisahkan dengan koma)<input name="tags" maxLength={120} placeholder="earth_tone, smart_casual" defaultValue={item?.styleTags.join(', ')}/></label>
      <label>Kehangatan<select name="warmth" defaultValue={item?.layerWarmth ?? ''}><option value="">Belum diketahui</option><option value="0">Ringan</option><option value="1">Sedang</option><option value="2">Hangat</option><option value="3">Sangat hangat</option></select></label>
      <p className="fine-print">Terusan, penutup kepala, dan aksesori bisa dicatat. Template papan awal mendukung atasan, bawahan, sepatu, dan luaran.</p>
      <button className="primary" type="submit"><Plus size={16}/>{item ? 'Simpan perubahan' : 'Tambah keping'}</button>
    </form>
  </Modal>;
}
export function ItemTools({ item, onEdit, onDelete }: { item: ClothingItem; onEdit: (item: ClothingItem) => void; onDelete: (item: ClothingItem) => void }) {
  return <div className="item-tools"><button className="icon-btn" aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}><Pencil size={13}/></button><button className="icon-btn" aria-label={`Hapus ${item.name}`} onClick={() => onDelete(item)}><Trash2 size={13}/></button></div>;
}
