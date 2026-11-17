import { z } from 'zod';
import { PhotoRefSchema } from './media';

export const SLOTS = ['top', 'bottom', 'shoes', 'outer'] as const;
export type Slot = typeof SLOTS[number];
export const REQUIRED: Slot[] = ['top', 'bottom', 'shoes'];
export const CATEGORIES = [...SLOTS, 'one_piece', 'headwear', 'accessory'] as const;
export const COLORS = ['white', 'ivory', 'black', 'navy', 'blue', 'cream', 'brown', 'olive', 'grey', 'burgundy'] as const;
export type Color = typeof COLORS[number];
export const slotLabel: Record<Slot, string> = { top: 'Atasan', bottom: 'Bawahan', shoes: 'Sepatu', outer: 'Luaran' };
export const categoryLabel: Record<typeof CATEGORIES[number], string> = { ...slotLabel, one_piece: 'Terusan', headwear: 'Penutup kepala', accessory: 'Aksesori' };
export const colorLabel: Record<Color, string> = { white: 'Putih', ivory: 'Gading', black: 'Hitam', navy: 'Navy', blue: 'Biru', cream: 'Krem', brown: 'Cokelat', olive: 'Olive', grey: 'Abu-abu', burgundy: 'Burgundy' };
export const colorHex: Record<Color, string> = { white: '#faf9f5', ivory: '#e9e1ce', black: '#30302e', navy: '#293d50', blue: '#698ba8', cream: '#cfbf9f', brown: '#956f4c', olive: '#77806a', grey: '#a5a39c', burgundy: '#763947' };
export const ClothingItemSchema = z.object({
  id: z.string().min(1), ownerId: z.string().min(1), name: z.string().trim().min(1).max(80),
  category: z.enum(CATEGORIES), primaryColor: z.enum(COLORS).nullable(), status: z.enum(['available', 'unavailable', 'archived']),
  formality: z.number().int().min(1).max(5).nullable(), styleTags: z.array(z.string().max(40)).max(12),
  layerWarmth: z.number().min(0).max(3).nullable(), illustration: z.enum(['shirt', 'tee', 'knit', 'trousers', 'jeans', 'sneakers', 'loafers', 'jacket', 'dress', 'scarf']).optional(),
  photoRef: PhotoRefSchema.optional(),
});
export type ClothingItem = z.infer<typeof ClothingItemSchema>;
export const SlotMapSchema = z.object({ top: z.string().min(1).nullable(), bottom: z.string().min(1).nullable(), shoes: z.string().min(1).nullable(), outer: z.string().min(1).nullable() });
export type SlotMap = z.infer<typeof SlotMapSchema>;
export const BoardDraftSchema = z.object({ templateId: z.literal('separates_v1'), revision: z.number().int().nonnegative(), slots: SlotMapSchema, lockedSlots: z.array(z.enum(SLOTS)).max(4) }).superRefine((b, ctx) => {
  if (new Set(b.lockedSlots).size !== b.lockedSlots.length || b.lockedSlots.some(s => !b.slots[s])) ctx.addIssue({ code: 'custom', message: 'Kunci harus unik dan slot harus berisi.' });
  const ids = Object.values(b.slots).filter(Boolean);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Satu item hanya boleh menempati satu slot.' });
});
export type BoardDraft = z.infer<typeof BoardDraftSchema>;
export const StyleIntentSchema = z.object({ schemaVersion: z.literal(1), occasion: z.enum(['daily', 'work', 'presentation', 'weekend']), slotColors: z.array(z.object({ slot: z.enum(SLOTS), allowed: z.array(z.enum(COLORS)).min(1) })).max(4), excludedItemIds: z.array(z.string()), preferredFormality: z.number().int().min(1).max(5).nullable(), palette: z.enum(['earth_tone']).nullable(), weather: z.enum(['hot', 'cool', 'cold', 'rain']), trendMode: z.literal('off') });
export type StyleIntent = z.infer<typeof StyleIntentSchema>;
export const defaultIntent = (): StyleIntent => ({ schemaVersion: 1, occasion: 'daily', slotColors: [], excludedItemIds: [], preferredFormality: 2, palette: null, weather: 'hot', trendMode: 'off' });
export const emptyBoard = (revision = 0): BoardDraft => ({ templateId: 'separates_v1', revision, slots: { top: null, bottom: null, shoes: null, outer: null }, lockedSlots: [] });
export type BoardAction = { type: 'place'; slot: Slot; itemId: string } | { type: 'remove'; slot: Slot } | { type: 'lock'; slot: Slot } | { type: 'reset' } | { type: 'clear'; confirmed: boolean };
export function validateBoard(board: BoardDraft, items: readonly ClothingItem[], ownerId: string): string[] {
  const parsed = BoardDraftSchema.safeParse(board);
  if (!parsed.success) return parsed.error.issues.map(i => i.message);
  return SLOTS.flatMap(slot => {
    const id = board.slots[slot];
    if (!id) return [];
    const item = items.find(i => i.id === id && i.ownerId === ownerId);
    return !item ? [`${slotLabel[slot]} tidak lagi tersedia di lemari ini.`] : item.category !== slot ? [`Kategori item tidak sesuai slot ${slotLabel[slot].toLowerCase()}.`] : [];
  });
}
export function editBoard(board: BoardDraft, action: BoardAction, items: readonly ClothingItem[], ownerId: string): { board: BoardDraft; message: string; changed: boolean } {
  const next: BoardDraft = structuredClone(board);
  const reject = (message: string) => ({ board, message, changed: false });
  if ('slot' in action && board.lockedSlots.includes(action.slot) && action.type !== 'lock') return reject(`${slotLabel[action.slot]} terkunci. Buka kunci terlebih dahulu.`);
  if (action.type === 'place') {
    const item = items.find(i => i.id === action.itemId && i.ownerId === ownerId);
    if (!item || item.status !== 'available') return reject('Item tidak tersedia di lemari ini.');
    if (item.category !== action.slot) return reject(`Salah kategori: ${item.name} tidak dapat dipasang ke ${slotLabel[action.slot].toLowerCase()}.`);
    if (board.slots[action.slot] === item.id) return reject('Item sudah terpasang.');
    if (Object.values(board.slots).includes(item.id)) return reject('Item sudah terpasang di slot lain.');
    next.slots[action.slot] = item.id;
  } else if (action.type === 'remove') {
    if (!next.slots[action.slot]) return reject('Slot sudah kosong.');
    next.slots[action.slot] = null;
  } else if (action.type === 'lock') {
    if (!next.slots[action.slot]) return reject('Pasang keping sebelum mengunci.');
    next.lockedSlots = next.lockedSlots.includes(action.slot) ? next.lockedSlots.filter(s => s !== action.slot) : [...next.lockedSlots, action.slot];
  } else if (action.type === 'reset') {
    for (const slot of SLOTS) if (!next.lockedSlots.includes(slot)) next.slots[slot] = null;
  } else {
    if (next.lockedSlots.length && !action.confirmed) return reject('Konfirmasi diperlukan untuk menghapus keping terkunci.');
    next.slots = emptyBoard().slots; next.lockedSlots = [];
  }
  if (JSON.stringify(next) === JSON.stringify(board)) return reject('Tidak ada perubahan.');
  next.revision = board.revision + 1;
  return { board: next, message: action.type === 'lock' ? 'Status kunci diperbarui.' : 'Papan diperbarui.', changed: true };
}
export const fingerprint = (slots: SlotMap): string => JSON.stringify(SLOTS.map(s => slots[s]));
export function manualWarnings(board: BoardDraft, items: ClothingItem[], intent: StyleIntent): string[] {
  return intent.slotColors.flatMap(rule => {
    const item = items.find(i => i.id === board.slots[rule.slot]);
    return item && (item.primaryColor === null || !rule.allowed.includes(item.primaryColor)) ? [`${slotLabel[rule.slot]} tidak memenuhi warna wajib. Rakitan manual tetap boleh disimpan.`] : [];
  });
}
export const LegalCandidateSchema = z.object({ id: z.string().min(1), slots: z.object({ top: z.string().min(1), bottom: z.string().min(1), shoes: z.string().min(1), outer: z.string().min(1).nullable() }) });
export type LegalCandidate = z.infer<typeof LegalCandidateSchema>;
export interface CompatibilityRanker { readonly version: string; scoreBatch(candidates: readonly LegalCandidate[], features: ReadonlyMap<string, readonly number[]>): Promise<ReadonlyMap<string, number>> }
export type RecommendationMode = 'fill_empty' | 'compose' | 'replace_slots';
export const RecommendationRequestSchema = z.object({ board: BoardDraftSchema, mode: z.enum(['fill_empty', 'compose', 'replace_slots']), targetSlots: z.array(z.enum(SLOTS)), intent: StyleIntentSchema, limit: z.number().int().min(1).max(3) });
export type RecommendationRequest = z.infer<typeof RecommendationRequestSchema>;
export type OutfitCandidate = LegalCandidate & { changedSlots: Slot[]; reasonCodes: string[]; explanation: string };
export interface RecommendationResult { status: 'ok' | 'needs_clarification' | 'no_candidates' | 'invalid_request'; boardRevision: number; rankerVersion: string; candidates: OutfitCandidate[]; messages: string[]; searchTruncated: boolean }
export function fixedSlots(request: RecommendationRequest): Slot[] {
  return SLOTS.filter(s => request.board.lockedSlots.includes(s) || (request.mode === 'fill_empty' && !!request.board.slots[s]) || (request.mode === 'replace_slots' && !request.targetSlots.includes(s)));
}
export function candidateViolations(candidate: LegalCandidate, request: RecommendationRequest, items: readonly ClothingItem[], ownerId: string): string[] {
  const errors = validateBoard({ ...request.board, slots: candidate.slots }, items, ownerId);
  if (!LegalCandidateSchema.safeParse(candidate).success) errors.push('Kandidat belum lengkap.');
  for (const slot of SLOTS) {
    const id = candidate.slots[slot];
    const item = items.find(i => i.id === id && i.ownerId === ownerId);
    if (id && (!item || item.status !== 'available' || request.intent.excludedItemIds.includes(id))) errors.push(`${slotLabel[slot]} tidak tersedia atau dikecualikan.`);
    if (fixedSlots(request).includes(slot) && id !== request.board.slots[slot]) errors.push(`${slotLabel[slot]} tetap tidak boleh berubah.`);
    const rules = request.intent.slotColors.filter(r => r.slot === slot);
    if (rules.some(rule => !item || item.primaryColor === null || !rule.allowed.includes(item.primaryColor))) errors.push(`${slotLabel[slot]} tidak memenuhi warna wajib.`);
    if (request.mode === 'replace_slots' && request.targetSlots.includes(slot) && request.board.slots[slot] && id === request.board.slots[slot]) errors.push('Penggantian harus memakai item alternatif.');
  }
  return errors;
}
