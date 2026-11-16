import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, CheckCheck, ChevronRight, CircleHelp, Download, Heart, Layers, Leaf, LockKeyhole, LockKeyholeOpen, Plus, Puzzle, Redo2, Search, Shirt, SlidersHorizontal, Sparkles, Trash2, Undo2, X, Archive, RotateCcw } from 'lucide-react';
import { ClothingItemSchema, SLOTS, REQUIRED, COLORS, colorHex, colorLabel, slotLabel, categoryLabel, candidateViolations, manualWarnings, type ClothingItem, type Slot, type RecommendationMode, type RecommendationRequest, type RecommendationResult, type BoardDraft } from '../../../packages/domain';
import { DEMO_OWNER } from '../../../packages/domain/fixtures';
import { STORAGE_KEY, freshData, isResultStale, saveOutfit, type SavedOutfit } from '../../../packages/domain/repository';
import { recommend } from '../../../packages/recommender';
import { useStudio } from './useStudio';
import { Garment } from './Garment';
import { ItemForm, ItemTools, Modal } from './components';

type ResultState = { response: RecommendationResult; request: RecommendationRequest; catalogRevision: number };
type Confirmation = { title: string; description: string; action: () => void };
const occasionLabel = { daily: 'Sehari-hari', work: 'Ke kantor', presentation: 'Presentasi', weekend: 'Akhir pekan' } as const;
const today = (at = new Date().toISOString()) => new Intl.DateTimeFormat('sv-SE').format(new Date(at));

export function App() {
  const studio = useStudio();
  const { data, current, persist, message, setMessage, act, replaceBoard } = studio;
  const [page, setPage] = useState<'studio' | 'wardrobe' | 'outfits'>('studio');
  const [mobilePanel, setMobilePanel] = useState<'board' | 'wardrobe' | 'ideas'>('board');
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [itemEditor, setItemEditor] = useState<ClothingItem | 'new' | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<RecommendationMode>('fill_empty');
  const [targetSlots, setTargetSlots] = useState<Slot[]>(['shoes']);
  const [showArchived, setShowArchived] = useState(false);
  const requestCount = useRef(0);
  const [externalChange, setExternalChange] = useState(false);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) { setExternalChange(true); setMessage('Data berubah di tab lain. Muat ulang sebelum melanjutkan agar perubahanmu tidak menimpa data terbaru.'); } };
    window.addEventListener('storage', onStorage); return () => window.removeEventListener('storage', onStorage);
  }, [setMessage]);
  const stale = result ? isResultStale(data.board, data.catalogRevision, data.intent, { board: result.request.board, catalogRevision: result.catalogRevision, intent: result.request.intent }) : false;
  const preview = !stale ? result?.response.candidates.find(c => c.id === previewId) : undefined;
  const visibleBoard = preview ? { ...data.board, slots: preview.slots } : data.board;
  const warnings = manualWarnings(data.board, data.items, data.intent);
  const filled = REQUIRED.filter(s => !!data.board.slots[s]).length;
  const selectedItems = data.items.filter(i => Object.values(data.board.slots).includes(i.id));
  const visibleItems = data.items.filter(i => (showUnavailable || i.status === 'available') && (category === 'all' || i.category === category) && `${i.name} ${i.primaryColor ? colorLabel[i.primaryColor] : ''}`.toLowerCase().includes(search.toLowerCase()));
  function place(item: ClothingItem, slot?: Slot) {
    if (!SLOTS.includes(item.category as Slot)) { setMessage('Kategori ini belum didukung pada template awal. Item tetap tersimpan di lemari.'); return; }
    act({ type: 'place', slot: slot ?? activeSlot ?? item.category as Slot, itemId: item.id }); setPreviewId(null);
  }
  function updateItem(item: ClothingItem) {
    const parsed = ClothingItemSchema.safeParse(item);
    setFormError('');
    if (!parsed.success) { setFormError('Data item tidak valid. Periksa nama dan tag (maksimal 12 tag, 40 karakter per tag).'); return; }
    const previous = current.current.items.find(i => i.id === item.id);
    if (previous && previous.category !== item.category && Object.values(current.current.board.slots).includes(item.id)) { setFormError('Lepaskan item dari papan sebelum mengganti kategorinya.'); return; }
    const nextItems = previous ? current.current.items.map(i => i.id === item.id ? parsed.data : i) : [...current.current.items, parsed.data];
    if (persist({ ...current.current, items: nextItems, catalogRevision: current.current.catalogRevision + 1 })) { setItemEditor(null); setMessage(studio.blocked ? 'Lemari diperbarui di mode sementara. Data belum tersimpan permanen.' : 'Lemari diperbarui dan tersimpan di perangkat ini.'); }
    else setFormError('Perubahan belum tersimpan. Penyimpanan gagal atau ada perubahan di tab lain. Tutup dialog dan muat ulang untuk memeriksa data terbaru.');
  }
  function deleteItem(item: ClothingItem) {
    if (Object.values(current.current.board.slots).includes(item.id)) { setMessage('Lepaskan item dari papan terlebih dahulu. Buka kunci jika diperlukan.'); return; }
    setConfirm({ title: 'Hapus item dari lemari?', description: `${item.name} akan dihapus. Outfit lama mempertahankan snapshot dan diberi tanda item tidak tersedia.`, action: () => { if (persist({ ...current.current, items: current.current.items.filter(i => i.id !== item.id), catalogRevision: current.current.catalogRevision + 1 })) setMessage('Item dihapus. Snapshot outfit lama tetap tersimpan.'); } });
  }
  async function requestRecommendations() {
    const n = ++requestCount.current;
    const request: RecommendationRequest = { board: structuredClone(current.current.board), intent: structuredClone(current.current.intent), mode, targetSlots, limit: 3 };
    const catalogRevision = current.current.catalogRevision;
    const items = structuredClone(current.current.items);
    setBusy(true); setPreviewId(null); setResult(null);
    // A local asynchronous boundary exercises revision protection without any network.
    await new Promise(resolve => window.setTimeout(resolve, 300));
    try {
      const response = await recommend(request, items, DEMO_OWNER);
      if (n !== requestCount.current) return;
      setResult({ request, response, catalogRevision });
      const expired = isResultStale(current.current.board, current.current.catalogRevision, current.current.intent, { board: request.board, catalogRevision, intent: request.intent });
      setMessage(expired ? 'Hasil usang: papan atau konteks berubah saat rekomendasi berjalan. Jalankan lagi.' : response.candidates.length ? `${response.candidates.length} alternatif ditemukan. Pilih untuk pratinjau, lalu terapkan.` : response.messages.join(' '));
    } catch { setMessage('Rekomendasi gagal. Coba lagi atau lanjutkan merakit manual.'); }
    finally { if (n === requestCount.current) setBusy(false); }
  }
  function applyPreview() {
    if (!result || !preview) return;
    if (isResultStale(current.current.board, current.current.catalogRevision, current.current.intent, { board: result.request.board, catalogRevision: result.catalogRevision, intent: result.request.intent })) { setMessage('Hasil sudah usang. Jalankan rekomendasi lagi.'); return; }
    const errors = candidateViolations(preview, result.request, current.current.items, DEMO_OWNER);
    if (errors.length) { setMessage(errors.join(' ')); return; }
    const board: BoardDraft = { ...current.current.board, slots: structuredClone(preview.slots) };
    if (replaceBoard(board, 'recommendation', preview.id)) {
      const entry = studio.event('applied', null, 'recommendation', board.slots, preview.id);
      persist({ ...current.current, events: [...current.current.events, entry] });
      setResult(null); setPreviewId(null); setMessage('Alternatif diterapkan. Simpan jika sudah cocok.');
    }
  }
  function save(title: string) {
    setFormError('');
    try {
      const outfit = saveOutfit(current.current, title, studio.source);
      if (persist({ ...current.current, outfits: [outfit, ...current.current.outfits], events: [...current.current.events, studio.event('saved', outfit.id)] })) { setSaveOpen(false); setMessage(studio.blocked ? `“${outfit.title}” disimpan sementara. Data belum tersimpan permanen.` : `“${outfit.title}” tersimpan. Buka tab Outfit untuk memakainya kembali.`); }
      else setFormError('Outfit belum tersimpan. Penyimpanan gagal atau ada perubahan di tab lain. Tutup dialog dan muat ulang untuk memeriksa data terbaru.');
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Outfit gagal disimpan.'); }
  }
  function openOutfit(outfit: SavedOutfit) {
    const perform = () => {
      if (replaceBoard(outfit.board, outfit.source)) { setPage('studio'); setMobilePanel('board'); setPreviewId(null); setResult(null); setMessage(`“${outfit.title}” dibuka. Item yang tidak ada lagi ditampilkan sebagai snapshot.`); }
    };
    if (Object.values(data.board.slots).some(Boolean)) setConfirm({ title: 'Buka outfit ini?', description: 'Papan saat ini akan diganti. Kamu bisa memakai Undo untuk mengembalikannya.', action: perform }); else perform();
  }
  function wear(outfit: SavedOutfit) {
    const existing = current.current.events.some(e => e.type === 'worn' && e.outfitId === outfit.id && today(e.at) === today());
    if (existing) { setMessage('Outfit ini sudah ditandai dipakai hari ini.'); return; }
    const entry = studio.event('worn', outfit.id, outfit.source, outfit.board.slots, null);
    if (persist({ ...current.current, events: [...current.current.events, entry] })) setMessage(`“${outfit.title}” ditandai dipakai hari ini.`);
  }
  function downloadBackup() {
    let raw: string;
    try { raw = window.localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(current.current, null, 2); } catch { raw = JSON.stringify(current.current, null, 2); }
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `outfit-puzzle-cadangan-${today()}.json`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Cadangan diunduh. Simpan berkas ini secara pribadi.');
  }
  const rack = <section className="wardrobe-panel" aria-label="Lemari pakaian">
    <div className="panel-head"><div><span className="eyebrow">01 / KOLEKSI PRIBADI</span><h2>Lemarimu <span className="count">{data.items.filter(i => i.status === 'available').length}</span></h2></div><button className="add-btn" aria-label="Tambah pakaian" onClick={() => setItemEditor('new')}><Plus size={19}/></button></div>
    <div className="search"><Search size={16}/><input aria-label="Cari pakaian" placeholder="Cari keping favoritmu…" value={search} onChange={e => setSearch(e.target.value)}/></div>
    <div className="category-tabs" aria-label="Filter kategori">{(['all', ...SLOTS] as const).map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c === 'all' ? 'Semua' : slotLabel[c]}</button>)}</div>
    <label className="checkbox subtle"><input type="checkbox" checked={showUnavailable} onChange={e => setShowUnavailable(e.target.checked)}/> Tampilkan laundry & arsip</label>
    <p className="rack-hint">{activeSlot ? `Slot dipilih: ${slotLabel[activeSlot]}. Klik pakaian untuk memasang.` : 'Klik pakaian untuk memasang, atau seret ke papan.'}</p>
    <div className="wardrobe-grid">{visibleItems.map(item => {
      const unsupported = !SLOTS.includes(item.category as Slot);
      const inBoard = Object.values(data.board.slots).includes(item.id);
      return <article key={item.id} className={`item-card ${inBoard ? 'in-board' : ''}`}>
        <button className="item-pick" aria-label={`Pasang ${item.name}`} draggable={item.status === 'available' && !unsupported} onDragStart={e => { e.dataTransfer.setData('application/x-outfit-item', item.id); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => place(item)} aria-disabled={item.status !== 'available' || unsupported}>
          <span className="item-image" style={{ backgroundColor: item.primaryColor === 'white' || item.primaryColor === 'ivory' ? '#e9e5dc' : '#efede6' }}><Garment item={item}/>{inBoard && <span className="on-board"><Check size={11}/> Di papan</span>}</span>
          <span className="item-name">{item.name}</span><span className="item-detail"><i style={{ background: item.primaryColor ? colorHex[item.primaryColor] : '#aaa' }}/>{item.primaryColor ? colorLabel[item.primaryColor] : 'Warna belum diketahui'} · {categoryLabel[item.category]}</span>
          {item.status !== 'available' && <span className="item-state">{item.status === 'archived' ? 'Diarsipkan' : 'Tidak tersedia / laundry'}</span>}{unsupported && <span className="item-state">Belum didukung papan ini</span>}
        </button><ItemTools item={item} onEdit={setItemEditor} onDelete={deleteItem}/>
      </article>;
    })}</div>
    {!visibleItems.length && <div className="empty-state"><Shirt size={30}/><h3>{data.items.length ? 'Belum ada yang cocok' : 'Awali dengan satu pakaian'}</h3><p>{data.items.length ? 'Coba kata kunci atau filter lain.' : 'Tambah atasan, bawahan, dan sepatu untuk menyusun outfit.'}</p><button className="secondary" onClick={() => setItemEditor('new')}><Plus size={16}/>Tambah pakaian</button></div>}
    <div className="rack-note"><Leaf size={16}/><span>Lebih banyak kemungkinan,<br/>dari pakaian yang sudah kamu punya.</span></div>
  </section>;

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#studio" onClick={() => setPage('studio')} aria-label="Outfit Puzzle beranda"><span className="brand-mark"><Puzzle size={24}/></span>outfit<span className="brand-light">puzzle</span><span className="beta">STUDIO</span></a>
      <nav aria-label="Navigasi utama">{([['studio', 'Studio'], ['wardrobe', 'Lemari'], ['outfits', 'Outfit']] as const).map(([p, label]) => <button key={p} className={page === p ? 'active' : ''} aria-current={page === p ? 'page' : undefined} onClick={() => setPage(p)}>{label}{p === 'outfits' && data.outfits.filter(o => !o.archived).length > 0 && <span className="nav-count">{data.outfits.filter(o => !o.archived).length}</span>}</button>)}</nav>
      <div className="top-actions"><span className="local-badge"><i/>{studio.blocked ? 'Mode sementara' : 'Demo lokal'}</span><button className="icon-btn help" onClick={() => setHelpOpen(true)} aria-label="Bantuan dan data lokal"><CircleHelp size={21}/></button><span className="avatar" aria-label="Profil lokal">K</span></div>
    </header>
    <main>
      <section className="intro"><div><div className="eyebrow"><span className="tiny-line"/> YOUR WARDROBE, REIMAGINED</div><h1>{page === 'studio' ? <>Baju yang ada. <em>Kemungkinan baru.</em></> : page === 'wardrobe' ? <>Kenali lagi <em>isi lemarimu.</em></> : <>Rakitan kecil. <em>Gaya milikmu.</em></>}</h1><p>{page === 'studio' ? 'Mulai dari satu keping. Rakit sendiri, atau temukan padanan dari lemarimu.' : page === 'wardrobe' ? 'Satu pakaian, banyak cerita. Kelola keping yang benar-benar kamu punya.' : 'Simpan yang kamu suka. Pakai lagi dengan cerita yang berbeda.'}</p></div><div className="intro-note"><span className="note-star">✳</span><span>Gaya baru tak selalu<br/>butuh baju baru.</span></div></section>
      <div className={`notice ${message || externalChange ? '' : 'quiet'}`} role="status" aria-live="polite" aria-atomic="true"><span>{message || 'Semua pakaian adalah data demo fiktif. Rakitan dan perubahan tersimpan hanya di browser ini.'}</span>{externalChange && <button onClick={() => window.location.reload()}>Muat ulang</button>}</div>
      {studio.blocked && <div className="warning">{message || 'Mode sementara: perubahan belum tersimpan permanen.'} <button onClick={downloadBackup}>Unduh cadangan data lama</button><button onClick={() => setConfirm({ title: 'Reset penyimpanan lokal?', description: 'Data lokal lama akan diganti dengan demo baru. Unduh cadangan terlebih dahulu jika ingin menyimpannya.', action: () => { try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData())); window.location.reload(); } catch { setMessage('Penyimpanan masih diblokir oleh browser. Aktifkan penyimpanan atau gunakan browser lain.'); } } })}>Reset setelah cadangkan</button></div>}
      {page === 'studio' && <>
        <div className="mobile-tabs">{([['board', 'Papan'], ['wardrobe', 'Lemari'], ['ideas', 'Saran']] as const).map(([panel, title]) => <button key={panel} className={mobilePanel === panel ? 'active' : ''} onClick={() => setMobilePanel(panel)}>{title}</button>)}</div>
        <div className={`studio-layout mobile-${mobilePanel}`}><div className="rack-column">{rack}</div>
          <section className="board-panel" aria-label="Papan outfit">
            <div className="panel-head board-head"><div><span className="eyebrow">02 / SUSUN CERITAMU</span><h2>Papan outfit <span className="board-status">{preview ? 'Pratinjau' : filled === 3 ? 'Lengkap' : 'Draft'}</span></h2></div><div className="undo-tools"><button className="icon-btn" onClick={() => { studio.undo(); setPreviewId(null); }} disabled={!studio.canUndo} aria-label="Undo"><Undo2 size={17}/></button><button className="icon-btn" onClick={() => { studio.redo(); setPreviewId(null); }} disabled={!studio.canRedo} aria-label="Redo"><Redo2 size={17}/></button></div></div>
            <div className="board-subhead"><span>SEPARATES / 4 SLOT</span><span>{filled}/3 keping wajib <i className={filled === 3 ? 'complete-dot' : ''}/></span></div>
            {preview && <div className="preview-banner"><Sparkles size={15}/>Pratinjau · papan aslimu belum berubah<button onClick={() => setPreviewId(null)} aria-label="Tutup pratinjau"><X size={16}/></button></div>}
            <div className={`puzzle-board ${preview ? 'is-preview' : ''}`}>
              <span className="board-watermark" aria-hidden="true">o / p</span>
              {SLOTS.map((slot, index) => {
                const id = visibleBoard.slots[slot];
                const item = data.items.find(i => i.id === id) ?? data.outfits.flatMap(o => o.itemSnapshots).find(i => i.id === id);
                const locked = data.board.lockedSlots.includes(slot);
                const notAvailable = !!id && !data.items.some(i => i.id === id && i.status === 'available');
                const ghost: ClothingItem = { id: 'ghost', ownerId: DEMO_OWNER, name: slotLabel[slot].toLowerCase(), category: slot, primaryColor: null, formality: null, status: 'available', layerWarmth: null, styleTags: [] };
                return <div className={`puzzle-slot slot-${slot} ${id ? 'filled' : ''} ${locked ? 'locked' : ''} ${activeSlot === slot ? 'selected' : ''}`} key={slot} data-testid={`slot-${slot}`} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={e => { e.preventDefault(); const dropId = e.dataTransfer.getData('application/x-outfit-item'); const dropItem = data.items.find(i => i.id === dropId); if (dropItem) place(dropItem, slot); else setMessage('Item drag tidak dikenali di lemari ini.'); }}>
                  <div className="slot-topline"><span>{String(index + 1).padStart(2, '0')} <b>{slotLabel[slot]}</b></span><span>{locked ? <LockKeyhole size={12}/> : slot === 'outer' ? 'OPSIONAL' : 'WAJIB'}</span></div>
                  <button className="slot-body" onClick={() => { setActiveSlot(activeSlot === slot ? null : slot); setMobilePanel('wardrobe'); }} aria-label={`Pilih slot ${slotLabel[slot]}${locked ? ', terkunci' : ''}`} aria-pressed={activeSlot === slot}>
                    {item ? <><Garment item={item}/><span className="slot-item-name">{item.name}</span>{notAvailable && <span className="unavailable-label">Tidak tersedia · snapshot</span>}</> : id ? <><Shirt size={38}/><span>Item tidak tersedia</span><small>Hanya referensi outfit lama</small></> : <><Garment item={ghost} ghost/><span className="slot-placeholder">{slot === 'outer' ? 'Sedikit lapisan ekstra?' : `Pilih ${slotLabel[slot].toLowerCase()}mu`}</span><small>Klik untuk memilih dari lemari</small></>}
                  </button>
                  {id && <div className="slot-controls"><button className={locked ? 'is-locked' : ''} aria-label={`${locked ? 'Buka kunci' : 'Kunci'} ${slotLabel[slot]}`} aria-pressed={locked} onClick={() => { act({ type: 'lock', slot }); setPreviewId(null); }}>{locked ? <LockKeyhole size={12}/> : <LockKeyholeOpen size={12}/>} {locked ? 'Terkunci' : 'Kunci'}</button><button aria-label={`Lepas ${slotLabel[slot]}`} onClick={() => { act({ type: 'remove', slot }); setPreviewId(null); }}><X size={13}/></button></div>}
                </div>;
              })}
            </div>
            <div className="board-tip"><LockKeyhole size={14}/><span>Kunci keping favoritmu. Saran akan mengikuti.</span></div>
            {warnings.map(w => <p className="warning" key={w}>{w}</p>)}
            {selectedItems.some(i => i.status !== 'available') && <p className="warning">Ada item yang tidak tersedia. Buka kunci lalu ganti atau lepaskan keping tersebut.</p>}
            <div className="board-footer"><div className="reset-actions"><button onClick={() => { act({ type: 'reset' }); setPreviewId(null); }}><RotateCcw size={13}/>Reset</button><button onClick={() => {
              if (data.board.lockedSlots.length) setConfirm({ title: 'Hapus semua keping?', description: 'Semua slot, termasuk keping yang terkunci, akan dikosongkan. Kamu bisa memakai Undo.', action: () => { act({ type: 'clear', confirmed: true }); setPreviewId(null); } }); else { act({ type: 'clear', confirmed: true }); setPreviewId(null); }
            }} aria-label="Hapus semua keping"><Trash2 size={13}/></button></div><button className="primary" onClick={() => { if (preview) { setMessage('Terapkan pratinjau terlebih dahulu sebelum menyimpan.'); return; } setSaveOpen(true); }} disabled={!Object.values(data.board.slots).some(Boolean)}><Plus size={16}/>Simpan outfit</button></div>
          </section>
          <aside className="ideas-panel" aria-label="Form dan saran outfit"><div className="panel-head"><div><span className="eyebrow">03 / TEMUKAN PADANAN</span><h2>Sedikit inspirasi <Sparkles size={17}/></h2></div></div>
            <p className="ideas-intro">Ada rencana apa? Pilih konteksnya,<br/>biar kepingmu menemukan pasangan.</p>
            <form className="recommend-form" onSubmit={e => { e.preventDefault(); void requestRecommendations(); }}>
              <label>Untuk kegiatan apa?<select value={data.intent.occasion} onChange={e => persist({ ...data, intent: { ...data.intent, occasion: e.target.value as typeof data.intent.occasion } })}>{Object.entries(occasionLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <div className="form-row"><label>Cuaca<select value={data.intent.weather} onChange={e => persist({ ...data, intent: { ...data.intent, weather: e.target.value as typeof data.intent.weather } })}><option value="hot">Panas</option><option value="cool">Sejuk</option><option value="cold">Dingin</option><option value="rain">Hujan</option></select></label><label>Kesan<select value={data.intent.preferredFormality ?? ''} onChange={e => persist({ ...data, intent: { ...data.intent, preferredFormality: e.target.value ? Number(e.target.value) : null } })}><option value="">Ikuti kegiatan</option>{[1, 2, 3, 4, 5].map(n => <option value={n} key={n}>{['', 'Santai', 'Kasual rapi', 'Smart casual', 'Formal', 'Sangat formal'][n]}</option>)}</select></label></div>
              <details className="constraints"><summary><SlidersHorizontal size={14}/>Warna wajib & preferensi<ChevronRight size={14}/></summary><div className="constraint-fields">{SLOTS.map(slot => <label key={slot}>Warna {slotLabel[slot].toLowerCase()} wajib<select aria-label={`Warna ${slotLabel[slot].toLowerCase()} wajib`} value={data.intent.slotColors.find(r => r.slot === slot)?.allowed[0] ?? ''} onChange={e => persist({ ...data, intent: { ...data.intent, slotColors: [...data.intent.slotColors.filter(r => r.slot !== slot), ...(e.target.value ? [{ slot, allowed: [e.target.value as typeof COLORS[number]] }] : [])] } })}><option value="">Bebas</option>{COLORS.map(c => <option key={c} value={c}>{colorLabel[c]}</option>)}</select></label>)}
              <label className="checkbox"><input type="checkbox" checked={data.intent.palette === 'earth_tone'} onChange={e => persist({ ...data, intent: { ...data.intent, palette: e.target.checked ? 'earth_tone' : null } })}/>Utamakan palet earth tone</label><p className="fine-print">Warna wajib adalah syarat ketat. Kesan dan palet adalah preferensi.</p></div></details>
              <label>Apa yang ingin dibantu?<select aria-label="Mode rekomendasi" value={mode} onChange={e => { setMode(e.target.value as RecommendationMode); setPreviewId(null); setResult(null); }}><option value="fill_empty">Lengkapi slot kosong</option><option value="compose">Susun outfit baru</option><option value="replace_slots">Ganti slot tertentu</option></select></label>
              {mode === 'replace_slots' && <fieldset className="replace-targets"><legend>Slot yang boleh diganti</legend>{SLOTS.map(s => <label className="checkbox" key={s}><input type="checkbox" checked={targetSlots.includes(s)} disabled={data.board.lockedSlots.includes(s)} onChange={e => { setTargetSlots(e.target.checked ? [...targetSlots, s] : targetSlots.filter(t => t !== s)); setResult(null); setPreviewId(null); }}/>{slotLabel[s]}{data.board.lockedSlots.includes(s) ? ' · terkunci' : ''}</label>)}</fieldset>}
              <button className="primary recommendation-button" type="submit" disabled={busy}><Sparkles size={16}/>{busy ? 'Mencari padanan…' : mode === 'fill_empty' ? 'Lengkapi outfit' : mode === 'compose' ? 'Susun outfit' : 'Cari pengganti'}{!busy && <ArrowRight size={16}/>}</button>
              <p className="demo-label"><span/> Aturan demo · tanpa model AI terlatih</p>
            </form>
            <div className="suggestions" aria-live="polite" aria-busy={busy}>
              {busy && <div className="loading"><span className="spinner"/>Memeriksa keping yang tersedia…</div>}
              {stale && <div className="warning"><b>Hasil usang</b><p>Papan, lemari, atau konteks telah berubah. Jalankan rekomendasi lagi.</p><button className="secondary" onClick={() => void requestRecommendations()}>Cari lagi</button></div>}
              {result && !stale && <>
                <div className="results-heading"><span>{result.response.candidates.length ? `${result.response.candidates.length} PADANAN UNTUKMU` : 'BELUM ADA PADANAN'}</span><Layers size={14}/></div>
                {result.response.messages.map(m => <p className="warning" key={m}>{m}</p>)}
                {result.response.searchTruncated && <p className="fine-print">Pencarian dibatasi untuk lemari besar. Hasil ini bukan semua kemungkinan.</p>}
                {result.response.candidates.map((c, index) => <button className={`candidate ${previewId === c.id ? 'active' : ''}`} key={c.id} aria-label={`Pratinjau alternatif ${index + 1}`} aria-pressed={previewId === c.id} onClick={() => { setPreviewId(c.id); setMobilePanel('board'); const entry = studio.event('preview', null, 'recommendation', c.slots, c.id); persist({ ...current.current, events: [...current.current.events, entry] }); }}><div className="candidate-head"><b>0{index + 1} <span>{index === 0 ? 'Pilihan pertama' : 'Kemungkinan lain'}</span></b><ArrowRight size={15}/></div><div className="candidate-thumbs">{SLOTS.filter(s => !!c.slots[s]).map(s => { const item = data.items.find(i => i.id === c.slots[s])!; return <span key={s}><Garment item={item}/></span>; })}</div><p>{c.explanation}</p><span className="candidate-item-list">{SLOTS.flatMap(s => c.slots[s] ? [data.items.find(i => i.id === c.slots[s])?.name] : []).join(' + ')}</span></button>)}
                {preview && <button className="primary apply-button" onClick={applyPreview}><Check size={16}/>Terapkan pratinjau</button>}
              </>}
              {!result && !busy && <div className="suggestion-empty"><span className="sparkle-disc"><Sparkles size={23}/></span><h3>Pasangan yang pas,<br/>sudah ada di lemarimu.</h3><p>Kunci satu keping yang ingin kamu pakai, lalu biarkan kami melengkapi.</p><ArrowDown size={18}/><span>Maksimal 3 alternatif. Kamu yang memilih.</span></div>}
            </div>
          </aside>
        </div>
      </>}
      {page === 'wardrobe' && <div className="wardrobe-page">{rack}</div>}
      {page === 'outfits' && <section className="outfits-page" aria-label="Outfit tersimpan"><div className="outfits-heading"><h2>Outfit tersimpan <span className="count">{data.outfits.filter(o => showArchived || !o.archived).length}</span></h2><label className="checkbox"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}/>Tampilkan arsip</label></div>
        {!data.outfits.filter(o => showArchived || !o.archived).length && <div className="empty-state outfits-empty"><Layers size={35}/><h3>Rakitan pertamamu menunggu.</h3><p>Susun keping di Studio, lalu simpan yang kamu suka.</p><button className="primary" onClick={() => setPage('studio')}>Buka Studio<ArrowRight size={16}/></button></div>}
        <div className="outfit-grid">{data.outfits.filter(o => showArchived || !o.archived).map(outfit => {
          const complete = REQUIRED.every(s => !!outfit.board.slots[s]);
          const unavailable = Object.values(outfit.board.slots).filter(Boolean).some(id => !data.items.some(i => i.id === id && i.status === 'available'));
          const worn = data.events.filter(e => e.type === 'worn' && e.outfitId === outfit.id);
          return <article className="outfit-card" key={outfit.id}><div className="saved-collage">{SLOTS.flatMap(s => { const id = outfit.board.slots[s]; const item = outfit.itemSnapshots.find(i => i.id === id); return item ? [<Garment key={s} item={item}/>] : []; })}<button className={`favorite icon-btn ${outfit.favorite ? 'active' : ''}`} aria-label={`${outfit.favorite ? 'Hapus favorit' : 'Favoritkan'} ${outfit.title}`} aria-pressed={outfit.favorite} onClick={() => persist({ ...data, outfits: data.outfits.map(o => o.id === outfit.id ? { ...o, favorite: !o.favorite } : o) })}><Heart size={19} fill={outfit.favorite ? 'currentColor' : 'none'}/></button></div>
            <div className="outfit-card-body"><span className="eyebrow">{outfit.archived ? 'DIARSIPKAN' : complete ? 'OUTFIT LENGKAP' : 'DRAFT BELUM LENGKAP'}</span><h3>{outfit.title}</h3><p className="fine-print">{new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(outfit.createdAt))} · {outfit.source === 'manual' ? 'Rakitan manual' : outfit.source === 'mixed' ? 'Rakitan campuran' : 'Dari rekomendasi demo'}</p>
              {unavailable && <p className="warning">Ada item tidak tersedia. Kolase memakai snapshot asli.</p>}
              <div className="saved-actions"><button className="secondary" onClick={() => openOutfit(outfit)}>Buka papan<ArrowRight size={14}/></button><button className="wear-button" disabled={!complete} onClick={() => wear(outfit)}><CheckCheck size={15}/>{worn.some(e => today(e.at) === today()) ? 'Dipakai hari ini' : 'Aku pakai ini'}</button></div>
              <div className="outfit-meta"><span>{worn.length ? `${worn.length} hari dipakai` : 'Belum ditandai dipakai'}</span><div><button onClick={() => { const copy = { ...structuredClone(outfit), id: crypto.randomUUID(), title: `${outfit.title.slice(0, 70)} (salinan)`, favorite: false, archived: false, createdAt: new Date().toISOString() }; if (persist({ ...data, outfits: [copy, ...data.outfits] })) setMessage('Salinan outfit dibuat.'); }}>Duplikasi</button><button aria-label={`${outfit.archived ? 'Pulihkan' : 'Arsipkan'} ${outfit.title}`} onClick={() => persist({ ...data, outfits: data.outfits.map(o => o.id === outfit.id ? { ...o, archived: !o.archived } : o) })}><Archive size={14}/>{outfit.archived ? 'Pulihkan' : 'Arsip'}</button></div></div>
            </div></article>;
        })}</div>
      </section>}
      <footer className="page-footer"><span><Puzzle size={14}/> Sedikit keping. Banyak kemungkinan.</span><span>OUTFIT PUZZLE / LOCAL STUDIO · V0.1</span></footer>
    </main>
    {preview && mobilePanel === 'board' && page === 'studio' && <div className="mobile-preview-actions"><button className="secondary" onClick={() => setPreviewId(null)}>Batal</button><button className="primary" onClick={applyPreview}><Check size={15}/>Terapkan pratinjau</button></div>}
    {itemEditor && <ItemForm item={itemEditor === 'new' ? undefined : itemEditor} error={formError} onClose={() => { setItemEditor(null); setFormError(''); }} onSubmit={updateItem}/>}
    {saveOpen && <Modal title="Simpan cerita outfitmu" onClose={() => { setSaveOpen(false); setFormError(''); }}><p className="muted">{filled === 3 ? 'Semua keping wajib sudah ada. Beri nama agar mudah ditemukan lagi.' : 'Papan belum lengkap. Kamu bisa menyimpannya sebagai draft.'}</p>{warnings.map(w => <p className="warning" key={w}>{w}</p>)}{formError && <p className="warning" role="alert">{formError}</p>}<form className="form-stack" onSubmit={e => { e.preventDefault(); save(String(new FormData(e.currentTarget).get('title'))); }}><label>Nama outfit<input name="title" required maxLength={80} placeholder="Misalnya: Presentasi, tetap santai" autoFocus/></label><button className="primary" type="submit"><Check size={16}/>Simpan {filled === 3 ? 'outfit' : 'draft'}</button></form></Modal>}
    {confirm && <Modal title={confirm.title} onClose={() => setConfirm(null)}><p className="muted">{confirm.description}</p><div className="dialog-actions"><button className="secondary" onClick={() => setConfirm(null)}>Batal</button><button className="primary" onClick={() => { confirm.action(); setConfirm(null); }}>Lanjutkan</button></div></Modal>}
    {helpOpen && <Modal title="Studio kecil, kemungkinan besar" onClose={() => setHelpOpen(false)}><div className="help-content"><p>1. Klik pakaian untuk memasang ke slot yang sesuai. Untuk memilih slot sendiri, klik slot terlebih dahulu. Tombol bisa dipakai dengan Tab, Enter, dan Spasi.</p><p>2. Kunci keping yang harus tetap. Lengkapi hanya mengisi slot kosong; Susun dapat mengganti keping terbuka; Ganti slot hanya mengubah pilihanmu.</p><p>3. Pilih alternatif untuk pratinjau, terapkan, lalu simpan. Favorit dan “dipakai” dicatat terpisah di tab Outfit.</p><p><b>Demo lokal.</b> Semua ilustrasi dan pakaian awal adalah fiktif. Rekomendasi memakai aturan sederhana, belum model AI. Tidak ada login, pengiriman data, atau training. Bahasa natural, foto, dan sinkronisasi cloud menyusul.</p><p>Data disimpan di browser/perangkat ini. Menghapus data browser akan menghapus lemarimu. Riwayat Undo/Redo hanya berlaku di sesi aktif. Cadangan JSON berisi data dan riwayat lokal; fitur impor cadangan belum tersedia di versi ini.</p><button className="secondary" onClick={downloadBackup}><Download size={16}/>Unduh cadangan data</button></div></Modal>}
  </div>;
}
