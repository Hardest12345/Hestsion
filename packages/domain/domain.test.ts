import { describe, it, expect } from 'vitest';
import { emptyBoard, editBoard, defaultIntent, candidateViolations, type RecommendationRequest, type SlotMap, type CompatibilityRanker } from './index';
import { DEMO_OWNER, demoItems } from './fixtures';
import { recommend } from '../recommender';
import { freshData, readLocal, writeLocal, saveOutfit, isResultStale, STORAGE_KEY, type KeyValueStorage } from './repository';

const request = (slots: Partial<SlotMap> = {}, extra: Partial<RecommendationRequest> = {}): RecommendationRequest => ({ board: { ...emptyBoard(), slots: { ...emptyBoard().slots, ...slots } }, mode: 'fill_empty', targetSlots: [], intent: defaultIntent(), limit: 3, ...extra });
const run = (r: RecommendationRequest, items = demoItems) => recommend(r, items, DEMO_OWNER);
class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>();
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, v: string) { this.values.set(k, v); }
}
describe('Editor dan invariant domain', () => {
  it('A01 menolak kategori salah tanpa mengubah papan', () => {
    const board = emptyBoard(); const result = editBoard(board, { type: 'place', slot: 'bottom', itemId: 'shirt-white' }, demoItems, DEMO_OWNER);
    expect(result.changed).toBe(false); expect(result.board).toBe(board); expect(result.message).toContain('Salah kategori');
  });
  it('lock menolak ganti/hapus dan reset mempertahankan keping terkunci', () => {
    const board = { ...emptyBoard(), slots: { ...emptyBoard().slots, top: 'shirt-white', bottom: 'jeans-black' }, lockedSlots: ['bottom' as const] };
    expect(editBoard(board, { type: 'remove', slot: 'bottom' }, demoItems, DEMO_OWNER).changed).toBe(false);
    expect(editBoard(board, { type: 'place', slot: 'bottom', itemId: 'jeans-blue' }, demoItems, DEMO_OWNER).changed).toBe(false);
    expect(editBoard(board, { type: 'reset' }, demoItems, DEMO_OWNER).board.slots).toEqual({ top: null, bottom: 'jeans-black', shoes: null, outer: null });
    expect(editBoard(board, { type: 'clear', confirmed: false }, demoItems, DEMO_OWNER).changed).toBe(false);
    expect(editBoard(board, { type: 'clear', confirmed: true }, demoItems, DEMO_OWNER).board.lockedSlots).toEqual([]);
  });
  it('menolak kepemilikan berbeda, status tidak tersedia, dan kategori template lain', () => {
    for (const id of ['foreign', 'shirt-laundry', 'dress-burgundy']) expect(editBoard(emptyBoard(), { type: 'place', slot: 'top', itemId: id }, [...demoItems, { ...demoItems[0], id: 'foreign', ownerId: 'another-user' }], DEMO_OWNER).changed).toBe(false);
  });
});
describe('Rekomendasi legal', () => {
  it('A03 jeans hitam terkunci, atasan wajib putih, semua hasil legal', async () => {
    const r = request({ bottom: 'jeans-black' }); r.board.lockedSlots = ['bottom']; r.intent.slotColors = [{ slot: 'top', allowed: ['white'] }];
    const result = await run(r);
    expect(result.status).toBe('ok'); expect(result.candidates.length).toBeGreaterThan(0); expect(result.candidates.length).toBeLessThanOrEqual(3);
    for (const c of result.candidates) { expect(c.slots.bottom).toBe('jeans-black'); expect(demoItems.find(i => i.id === c.slots.top)?.primaryColor).toBe('white'); expect(candidateViolations(c, r, demoItems, DEMO_OWNER)).toEqual([]); }
  });
  it('A04 fill_empty mempertahankan dua slot berisi tanpa lock', async () => {
    const r = request({ top: 'shirt-navy', bottom: 'trousers-cream' });
    const result = await run(r); expect(result.status).toBe('ok');
    for (const c of result.candidates) { expect(c.slots.top).toBe('shirt-navy'); expect(c.slots.bottom).toBe('trousers-cream'); }
  });
  it('A05 mengganti sepatu saja dan tidak mengulang sepatu lama', async () => {
    const r = request({ top: 'shirt-white', bottom: 'jeans-black', shoes: 'sneakers-white', outer: 'jacket-brown' }, { mode: 'replace_slots', targetSlots: ['shoes'] });
    const result = await run(r); expect(result.status).toBe('ok');
    for (const c of result.candidates) { expect(c.slots.shoes).not.toBe('sneakers-white'); expect(c.slots.top).toBe(r.board.slots.top); expect(c.slots.bottom).toBe(r.board.slots.bottom); expect(c.slots.outer).toBe(r.board.slots.outer); }
  });
  it('A06 konflik atasan navy terkunci vs wajib putih bersifat eksplisit', async () => {
    const r = request({ top: 'shirt-navy' }); r.board.lockedSlots = ['top']; r.intent.slotColors = [{ slot: 'top', allowed: ['white'] }];
    const result = await run(r); expect(result.status).toBe('needs_clarification'); expect(result.candidates).toEqual([]); expect(result.messages.join(' ')).toMatch(/navy.*putih/); expect(r.board.slots.top).toBe('shirt-navy');
  });
  it('A07 nol atasan putih tidak dibuat-buat, satu outfit legal hanya satu hasil', async () => {
    const r = request(); r.intent.slotColors = [{ slot: 'top', allowed: ['white'] }];
    const missing = await run(r, demoItems.filter(i => i.primaryColor !== 'white' || i.category !== 'top'));
    expect(missing.status).toBe('no_candidates'); expect(missing.candidates).toHaveLength(0);
    const single = await run(r, demoItems.filter(i => ['shirt-white', 'jeans-black', 'sneakers-white'].includes(i.id)));
    expect(single.status).toBe('ok'); expect(single.candidates).toHaveLength(1);
  });
  it('warna gading dan warna tidak diketahui tidak lolos syarat putih', async () => {
    const r = request(); r.intent.slotColors = [{ slot: 'top', allowed: ['white'] }];
    const items = demoItems.filter(i => i.category !== 'top').concat([{ ...demoItems[0], primaryColor: null }, demoItems[1]]);
    expect((await run(r, items)).status).toBe('no_candidates');
  });
  it('compose mengizinkan perubahan hanya pada slot terbuka', async () => {
    const r = request({ top: 'shirt-navy', bottom: 'jeans-black' }, { mode: 'compose' }); r.board.lockedSlots = ['bottom'];
    const result = await run(r); expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every(c => c.slots.bottom === 'jeans-black')).toBe(true);
  });
  it('penggantian terkunci/tanpa target ditolak dan tanpa alternatif tidak mengulang item', async () => {
    const r = request({ top: 'shirt-white', bottom: 'jeans-black', shoes: 'sneakers-white' }, { mode: 'replace_slots', targetSlots: [] });
    expect((await run(r)).status).toBe('needs_clarification');
    r.targetSlots = ['shoes']; r.board.lockedSlots = ['shoes']; expect((await run(r)).status).toBe('needs_clarification');
    r.board.lockedSlots = []; expect((await run(r, demoItems.filter(i => i.category !== 'shoes' || i.id === 'sneakers-white'))).status).toBe('no_candidates');
  });
  it('hasil unik dan deterministik, tidak memakai item pengguna lain atau unavailable', async () => {
    const r = request({}, { mode: 'compose' }); const items = [...demoItems, { ...demoItems[0], id: 'foreign', ownerId: 'other' }];
    const a = await run(r, items); const b = await run(r, items);
    expect(a).toEqual(b); expect(new Set(a.candidates.map(c => c.id)).size).toBe(a.candidates.length);
    for (const c of a.candidates) expect(candidateViolations(c, r, items, DEMO_OWNER)).toEqual([]);
  });
  it('validator menolak item duplikat, slot tetap berubah dan exclusions', async () => {
    const r = request({ bottom: 'jeans-black' }); const valid = (await run(r)).candidates[0];
    expect(candidateViolations({ ...valid, slots: { ...valid.slots, bottom: 'jeans-blue' } }, r, demoItems, DEMO_OWNER).length).toBeGreaterThan(0);
    r.intent.excludedItemIds = [valid.slots.top]; expect(candidateViolations(valid, r, demoItems, DEMO_OWNER).length).toBeGreaterThan(0);
    expect(candidateViolations({ ...valid, slots: { ...valid.slots, shoes: valid.slots.top } }, r, demoItems, DEMO_OWNER).length).toBeGreaterThan(0);
    expect(candidateViolations({ ...valid, slots: { ...valid.slots, top: '' } }, r, demoItems, DEMO_OWNER).length).toBeGreaterThan(0);
  });
  it('output ranker NaN/ID tambahan fallback tanpa melonggarkan syarat', async () => {
    const broken: CompatibilityRanker = { version: 'broken', async scoreBatch() { return new Map([['extra', NaN]]); } };
    const r = request(); const result = await recommend(r, demoItems, DEMO_OWNER, broken);
    expect(result.rankerVersion).toBe('demo-rules-v1'); expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) expect(candidateViolations(c, r, demoItems, DEMO_OWNER)).toEqual([]);
  });
  it('lemari besar memakai pencarian terbatas dan tetap legal', async () => {
    const items = Array.from({ length: 12 }, (_, n) => demoItems.map(i => ({ ...i, id: `${i.id}-${n}` }))).flat();
    const r = request({}, { mode: 'compose' }); const result = await run(r, items);
    expect(result.searchTruncated).toBe(true); expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) expect(candidateViolations(c, r, items, DEMO_OWNER)).toEqual([]);
  });
});
describe('Penyimpanan dan versi', () => {
  it('A08 hasil dianggap usang setelah board, lemari, atau konteks berubah', () => {
    const data = freshData(); const snapshot = { board: data.board, catalogRevision: 0, intent: data.intent };
    expect(isResultStale(data.board, 0, data.intent, snapshot)).toBe(false);
    expect(isResultStale({ ...data.board, revision: 1 }, 0, data.intent, snapshot)).toBe(true);
    expect(isResultStale(data.board, 1, data.intent, snapshot)).toBe(true);
    expect(isResultStale(data.board, 0, { ...data.intent, weather: 'rain' }, snapshot)).toBe(true);
  });
  it('A09 outfit tersimpan bertahan reload dan snapshot tidak ikut diedit', () => {
    const storage = new MemoryStorage(); const data = readLocal(storage).data;
    data.board.slots.top = 'shirt-white'; const outfit = saveOutfit(data, 'Presentasi', 'manual');
    const persisted = writeLocal(storage, data.token, { ...data, outfits: [outfit] });
    persisted.board.slots.top = null;
    expect(readLocal(storage).data.outfits[0].board.slots.top).toBe('shirt-white');
    expect(readLocal(storage).data.outfits[0].itemSnapshots[0].name).toBe('Kemeja putih');
  });
  it('seed tidak kembali ketika lemari sengaja dikosongkan', () => {
    const storage = new MemoryStorage(); const data = readLocal(storage).data;
    writeLocal(storage, data.token, { ...data, items: [] }); expect(readLocal(storage).data.items).toEqual([]);
  });
  it('dua tab menolak write dengan token lama dan data invalid tidak ditimpa', () => {
    const storage = new MemoryStorage(); const a = readLocal(storage).data; const b = readLocal(storage).data;
    writeLocal(storage, a.token, { ...a, catalogRevision: 1 }); expect(() => writeLocal(storage, b.token, b)).toThrow(/tab lain/);
    storage.setItem(STORAGE_KEY, '{invalid'); expect(readLocal(storage).blocked).toBe(true); expect(storage.getItem(STORAGE_KEY)).toBe('{invalid');
  });
  it('error kuota ditampilkan sebagai kegagalan simpan', () => {
    const storage = new MemoryStorage(); const data = readLocal(storage).data;
    storage.setItem = () => { throw new Error('Quota exceeded'); };
    expect(() => writeLocal(storage, data.token, data)).toThrow('Quota exceeded');
  });
});
