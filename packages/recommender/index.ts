import { SLOTS, REQUIRED, RecommendationRequestSchema, validateBoard, candidateViolations, fixedSlots, fingerprint, slotLabel, colorLabel, type ClothingItem, type CompatibilityRanker, type LegalCandidate, type RecommendationRequest, type RecommendationResult, type Slot } from '../domain';

// Feature schema baseline-v1: [formality (0 means unknown), neutralColor, warmth].
export function extractFeatures(items: readonly ClothingItem[]): ReadonlyMap<string, readonly number[]> {
  return new Map(items.map(i => [i.id, [i.formality ?? 0, i.primaryColor && ['white', 'ivory', 'black', 'navy', 'cream', 'grey', 'brown'].includes(i.primaryColor) ? 1 : 0, i.layerWarmth ?? 0]]));
}
export const baselineRanker: CompatibilityRanker = {
  version: 'demo-rules-v1',
  async scoreBatch(candidates, features) {
    return new Map(candidates.map(c => {
      const vectors = Object.values(c.slots).filter((id): id is string => !!id).map(id => features.get(id) ?? [0, 0, 0]);
      const levels = vectors.map(v => v[0]).filter(v => v > 0);
      const cohesion = levels.length ? 1 - (Math.max(...levels) - Math.min(...levels)) / 4 : 0.5;
      const neutral = vectors.reduce((n, v) => n + v[1], 0) / vectors.length;
      return [c.id, cohesion * 0.65 + neutral * 0.35];
    }));
  },
};

export async function recommend(raw: RecommendationRequest, items: readonly ClothingItem[], ownerId: string, ranker: CompatibilityRanker = baselineRanker): Promise<RecommendationResult> {
  const result: RecommendationResult = { status: 'ok', boardRevision: raw?.board?.revision ?? 0, rankerVersion: ranker.version, candidates: [], messages: [], searchTruncated: false };
  const parsed = RecommendationRequestSchema.safeParse(raw);
  if (!parsed.success) return { ...result, status: 'invalid_request', messages: ['Permintaan tidak valid. Periksa papan dan pilihan form.'] };
  const request = parsed.data;
  const errors = validateBoard(request.board, items, ownerId);
  if (errors.length) return { ...result, status: 'invalid_request', messages: errors };
  if (request.mode === 'replace_slots' && (!request.targetSlots.length || request.targetSlots.some(s => request.board.lockedSlots.includes(s)))) return { ...result, status: 'needs_clarification', messages: ['Pilih slot pengganti yang tidak terkunci.'] };
  const fixed = fixedSlots(request);
  const own = items.filter(i => i.ownerId === ownerId);
  const rulesFor = (slot: Slot) => request.intent.slotColors.filter(r => r.slot === slot);
  const eligible = (i: ClothingItem, slot: Slot) => i.category === slot && i.status === 'available' && !request.intent.excludedItemIds.includes(i.id) && rulesFor(slot).every(r => i.primaryColor !== null && r.allowed.includes(i.primaryColor));
  for (const slot of fixed) {
    const id = request.board.slots[slot];
    const item = own.find(i => i.id === id);
    if ((id && (!item || !eligible(item, slot))) || (!id && (REQUIRED.includes(slot) || rulesFor(slot).length))) {
      const colors = rulesFor(slot).map(r => r.allowed.map(c => colorLabel[c].toLowerCase()).join('/')).join(' dan ');
      const detail = item && colors ? `Saat ini ${item.primaryColor ? colorLabel[item.primaryColor].toLowerCase() : 'warnanya belum diketahui'}, sementara kamu mewajibkan ${colors}.` : 'Item kosong, tidak tersedia, atau dikecualikan.';
      result.messages.push(`${slotLabel[slot]} ${request.board.lockedSlots.includes(slot) ? 'terkunci' : 'tetap untuk aksi ini'}. ${detail} Buka kunci atau ubah permintaan.`);
    }
  }
  if (result.messages.length) return { ...result, status: 'needs_clarification' };
  const pools = SLOTS.map(slot => {
    if (fixed.includes(slot)) return [request.board.slots[slot]];
    const pool: (string | null)[] = own.filter(i => eligible(i, slot) && !(request.mode === 'replace_slots' && request.targetSlots.includes(slot) && i.id === request.board.slots[slot])).sort((a, b) => {
      const target = request.intent.preferredFormality ?? 2;
      return Math.abs((a.formality ?? target) - target) - Math.abs((b.formality ?? target) - target) || a.id.localeCompare(b.id);
    }).map(i => i.id);
    if (slot === 'outer' && !rulesFor(slot).length && !(request.mode === 'replace_slots' && request.targetSlots.includes(slot) && request.board.slots[slot] === null)) pool.unshift(null);
    // Fill-empty only adds an optional outer when expressly requested.
    if (slot === 'outer' && request.mode === 'fill_empty' && !rulesFor(slot).length) return [null];
    if (!pool.length) result.messages.push(`Belum ada alternatif ${slotLabel[slot].toLowerCase()} yang memenuhi syarat. Ubah warna wajib atau tambahkan item tersedia ke lemari.`);
    return pool;
  });
  if (result.messages.length) return { ...result, status: 'no_candidates' };
  const theoretical = pools.reduce((n, pool) => n * pool.length, 1);
  result.searchTruncated = theoretical > 2000;
  let combinations: (string | null)[][] = [[]];
  for (const pool of pools) {
    const next = combinations.flatMap(prefix => pool.map(id => [...prefix, id]));
    combinations = result.searchTruncated ? next.slice(0, 50) : next;
  }
  const candidates: LegalCandidate[] = combinations.map(ids => ({ id: `candidate-${fingerprint({ top: ids[0], bottom: ids[1], shoes: ids[2], outer: ids[3] })}`, slots: { top: ids[0]!, bottom: ids[1]!, shoes: ids[2]!, outer: ids[3] } })).filter(c => candidateViolations(c, request, own, ownerId).length === 0);
  if (!candidates.length) return { ...result, status: 'no_candidates', messages: [result.searchTruncated ? 'Pencarian terbatas belum menemukan hasil. Persempit syarat dan coba lagi.' : 'Tidak ada kombinasi lengkap yang memenuhi syarat. Tambahkan keping atau ubah permintaan.'] };
  const features = extractFeatures(own);
  let scores: ReadonlyMap<string, number>;
  try {
    scores = await ranker.scoreBatch(candidates, features);
    if (scores.size !== candidates.length || candidates.some(c => !Number.isFinite(scores.get(c.id))) || [...scores.keys()].some(id => !candidates.some(c => c.id === id))) throw new Error('Invalid ranker output');
  } catch {
    scores = await baselineRanker.scoreBatch(candidates, features);
    result.rankerVersion = baselineRanker.version;
    result.messages.push('Ranker tidak tersedia; memakai aturan demo.');
  }
  const ranked = candidates.map(candidate => {
    const chosen = Object.values(candidate.slots).filter(Boolean).map(id => own.find(i => i.id === id)!);
    const target = request.intent.preferredFormality ?? ({ daily: 2, work: 3, presentation: 3, weekend: 1 }[request.intent.occasion]);
    const context = chosen.reduce((sum, i) => sum + (i.formality === null ? 0.5 : 1 - Math.abs(i.formality - target) / 4), 0) / chosen.length;
    const palette = request.intent.palette ? chosen.filter(i => i.primaryColor && ['cream', 'brown', 'olive', 'ivory'].includes(i.primaryColor)).length / chosen.length : 0.5;
    const warmth = candidate.slots.outer && request.intent.weather === 'hot' ? -0.06 : 0;
    return { candidate, score: scores.get(candidate.id)! * 0.55 + context * 0.25 + palette * 0.20 + warmth };
  }).sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
  const shortlist = ranked.slice(0, result.searchTruncated ? 200 : ranked.length);
  const selected: LegalCandidate[] = [];
  while (selected.length < request.limit && shortlist.length) {
    let best = 0;
    let bestScore = -Infinity;
    shortlist.forEach((entry, index) => {
      const similarity = selected.length ? Math.max(...selected.map(c => SLOTS.filter(s => !fixed.includes(s) && c.slots[s] === entry.candidate.slots[s]).length / Math.max(1, SLOTS.length - fixed.length))) : 0;
      const score = entry.score - similarity * 0.12;
      if (score > bestScore) { best = index; bestScore = score; }
    });
    selected.push(shortlist.splice(best, 1)[0].candidate);
  }
  result.candidates = selected.filter(c => !candidateViolations(c, request, own, ownerId).length).map(c => {
    const changedSlots = SLOTS.filter(s => c.slots[s] !== request.board.slots[s]);
    const reasons: string[] = [];
    if (request.intent.slotColors.length) reasons.push('Warna wajib terpenuhi.');
    if (fixed.some(s => !!request.board.slots[s])) reasons.push('Keping yang tetap dipertahankan.');
    const levels = Object.values(c.slots).filter(Boolean).map(id => own.find(i => i.id === id)?.formality).filter((n): n is number => n !== null && n !== undefined);
    if (levels.length && Math.max(...levels) - Math.min(...levels) <= 2) reasons.push('Tingkat formalitas antaritem berdekatan.');
    if (!reasons.length) reasons.push('Semua keping tersedia di lemarimu dan sesuai slot.');
    return { ...c, changedSlots, reasonCodes: [...(request.intent.slotColors.length ? ['DRESS_CODE_MET'] : []), ...(fixed.some(s => request.board.slots[s]) ? ['FIXED_ITEM_KEPT'] : []), 'OWNED_ITEMS_ONLY'], explanation: reasons.join(' ') };
  });
  return result;
}
