import { z } from 'zod';
import { BoardDraftSchema, ClothingItemSchema, StyleIntentSchema, emptyBoard, defaultIntent, validateBoard, type BoardDraft, type StyleIntent } from './index';
import { DEMO_OWNER, demoItems } from './fixtures';

export const STORAGE_KEY = 'outfit-puzzle.local.v1';
const OriginSchema = z.enum(['manual', 'recommendation', 'mixed']);
const OutfitSchema = z.object({ id: z.string().min(1), title: z.string().trim().min(1).max(80), version: z.number().int().positive(), board: BoardDraftSchema, itemSnapshots: z.array(ClothingItemSchema), createdAt: z.iso.datetime(), favorite: z.boolean(), archived: z.boolean(), source: OriginSchema });
export type SavedOutfit = z.infer<typeof OutfitSchema>;
const EventSchema = z.object({ id: z.string().min(1), type: z.enum(['saved', 'worn', 'preview', 'applied']), outfitId: z.string().nullable(), fingerprint: z.string(), at: z.iso.datetime(), source: OriginSchema, candidateId: z.string().nullable() });
export const RepositorySchema = z.object({ schemaVersion: z.literal(1), token: z.string().min(1), catalogRevision: z.number().int().nonnegative(), items: z.array(ClothingItemSchema), board: BoardDraftSchema, intent: StyleIntentSchema, draftSource: OriginSchema.default('manual'), draftCandidateId: z.string().nullable().default(null), outfits: z.array(OutfitSchema), events: z.array(EventSchema) }).superRefine((r, ctx) => {
  if (new Set(r.items.map(i => i.id)).size !== r.items.length || r.items.some(i => i.ownerId !== DEMO_OWNER)) ctx.addIssue({ code: 'custom', message: 'Lemari tidak valid.' });
  if (new Set(r.outfits.map(o => o.id)).size !== r.outfits.length) ctx.addIssue({ code: 'custom', message: 'ID outfit duplikat.' });
});
export type LocalData = z.infer<typeof RepositorySchema>;
export interface KeyValueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const freshData = (): LocalData => ({ schemaVersion: 1, token: crypto.randomUUID(), catalogRevision: 0, items: structuredClone(demoItems), board: emptyBoard(), intent: defaultIntent(), draftSource: 'manual', draftCandidateId: null, outfits: [], events: [] });
export function readLocal(storage: KeyValueStorage): { data: LocalData; warning: string; blocked: boolean } {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) {
      const data = freshData(); storage.setItem(STORAGE_KEY, JSON.stringify(data));
      return { data, warning: '', blocked: false };
    }
    const data = RepositorySchema.parse(JSON.parse(raw));
    return { data, warning: '', blocked: false };
  } catch {
    const temporary = freshData(); temporary.items = [];
    return { data: temporary, warning: 'Data lokal tidak bisa dibaca atau penyimpanan diblokir. Mode sementara aktif; data lama tidak ditimpa. Unduh cadangan sebelum mereset.', blocked: true };
  }
}
export function writeLocal(storage: KeyValueStorage, previousToken: string, next: LocalData): LocalData {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw !== null) {
    const current = RepositorySchema.parse(JSON.parse(raw));
    if (current.token !== previousToken) throw new Error('Data berubah di tab lain. Muat ulang untuk memakai perubahan terbaru.');
  } else throw new Error('Data lokal telah dihapus di tab lain. Muat ulang terlebih dahulu.');
  const saved = RepositorySchema.parse({ ...next, token: crypto.randomUUID() });
  storage.setItem(STORAGE_KEY, JSON.stringify(saved));
  return saved;
}
export function saveOutfit(data: LocalData, title: string, source: SavedOutfit['source']): SavedOutfit {
  if (!title.trim() || title.trim().length > 80) throw new Error('Nama outfit wajib diisi, maksimal 80 karakter.');
  if (!Object.values(data.board.slots).some(Boolean)) throw new Error('Pasang minimal satu keping sebelum menyimpan.');
  const errors = validateBoard(data.board, data.items, DEMO_OWNER);
  if (errors.length) throw new Error(errors.join(' '));
  return { id: crypto.randomUUID(), title: title.trim(), version: 1, board: structuredClone(data.board), itemSnapshots: structuredClone(data.items.filter(i => Object.values(data.board.slots).includes(i.id))), createdAt: new Date().toISOString(), favorite: false, archived: false, source };
}
export function advanceBoard(current: BoardDraft, next: BoardDraft): BoardDraft { return { ...structuredClone(next), revision: current.revision + 1 }; }
export function isResultStale(board: BoardDraft, catalogRevision: number, intent: StyleIntent, snapshot: { board: BoardDraft; catalogRevision: number; intent: StyleIntent }): boolean {
  return board.revision !== snapshot.board.revision || catalogRevision !== snapshot.catalogRevision || JSON.stringify(intent) !== JSON.stringify(snapshot.intent);
}
