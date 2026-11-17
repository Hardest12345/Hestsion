import { useCallback, useRef, useState } from 'react';
import { editBoard, fingerprint, type BoardAction, type BoardDraft } from '../../../packages/domain';
import { DEMO_OWNER } from '../../../packages/domain/fixtures';
import { advanceBoard, readLocal, writeLocal, type LocalData, type KeyValueStorage, type SavedOutfit } from '../../../packages/domain/repository';

const storage: KeyValueStorage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
export function useStudio(ownerId = DEMO_OWNER) {
  const [initial] = useState(() => readLocal(storage, ownerId));
  const [data, setData] = useState(initial.data);
  const current = useRef(data);
  const [message, setMessage] = useState(initial.warning);
  const [past, setPast] = useState<BoardDraft[]>([]);
  const [future, setFuture] = useState<BoardDraft[]>([]);
  const source = data.draftSource;
  const candidateId = data.draftCandidateId;
  const [blocked] = useState(initial.blocked);
  const persist = useCallback((next: LocalData): boolean => {
    try {
      const saved = blocked ? { ...next, token: crypto.randomUUID() } : writeLocal(storage, current.current.token, next, ownerId);
      current.current = saved; setData(saved); return true;
    } catch (error) { setMessage(`Perubahan belum disimpan. ${error instanceof Error ? error.message : 'Penyimpanan lokal gagal.'}`); return false; }
  }, [blocked, ownerId]);
  const syncCloudItems = useCallback((items: LocalData['items']) => {
    if (JSON.stringify(current.current.items) === JSON.stringify(items)) return;
    persist({ ...current.current, items, catalogRevision: current.current.catalogRevision + 1 });
  }, [persist]);
  function replaceBoard(next: BoardDraft, origin: SavedOutfit['source'] = source === 'manual' ? 'manual' : 'mixed', recommendationId: string | null = null) {
    const previous = current.current.board;
    if (!persist({ ...current.current, board: advanceBoard(previous, next), draftSource: origin, draftCandidateId: recommendationId })) return false;
    setPast(p => [...p.slice(-49), structuredClone(previous)]); setFuture([]); return true;
  }
  function act(action: BoardAction) {
    const result = editBoard(current.current.board, action, current.current.items, ownerId);
    if (!result.changed) { setMessage(result.message); return; }
    if (replaceBoard(result.board)) setMessage(result.message);
  }
  function undo() {
    const previous = past.at(-1); if (!previous) return;
    const before = current.current.board;
    if (persist({ ...current.current, board: advanceBoard(before, previous), draftSource: 'mixed', draftCandidateId: null })) { setPast(p => p.slice(0, -1)); setFuture(f => [...f, before]); setMessage('Perubahan dibatalkan.'); }
  }
  function redo() {
    const next = future.at(-1); if (!next) return;
    const before = current.current.board;
    if (persist({ ...current.current, board: advanceBoard(before, next), draftSource: 'mixed', draftCandidateId: null })) { setFuture(f => f.slice(0, -1)); setPast(p => [...p, before]); setMessage('Perubahan diulangi.'); }
  }
  function event(type: LocalData['events'][number]['type'], outfitId: string | null, outfitSource = source, slots = current.current.board.slots, linkedCandidate = candidateId) {
    const at = new Date().toISOString();
    const entry: LocalData['events'][number] = { id: crypto.randomUUID(), type, outfitId, source: outfitSource, fingerprint: fingerprint(slots), candidateId: linkedCandidate, at };
    return entry;
  }
  return { data, current, persist, syncCloudItems, message, setMessage, act, replaceBoard, undo, redo, canUndo: !!past.length, canRedo: !!future.length, source, candidateId, event, blocked };
}
