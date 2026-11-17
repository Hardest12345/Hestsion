import { describe, expect, it } from 'vitest';
import { PhotoRefSchema, photoKeys, validatePhotoSelection } from './media';
import { freshData, readLocal, writeLocal, storageKeyFor, type KeyValueStorage } from './repository';

const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
describe('Media dan namespace akun', () => {
  it('file selection membatasi PNG/JPEG dan 10 MB', () => {
    expect(validatePhotoSelection({ type: 'image/png', size: 500 })).toBeNull();
    expect(validatePhotoSelection({ type: 'image/svg+xml', size: 500 })).toContain('PNG');
    expect(validatePhotoSelection({ type: 'image/jpeg', size: 11 * 1024 * 1024 })).toContain('10 MB');
  });
  it('path menolak traversal dan schema ready tanpa output ditolak', () => {
    expect(() => photoKeys(a, '../item', b)).toThrow();
    expect(PhotoRefSchema.safeParse({ assetId: a, status: 'ready', originalKey: 'x', cutoutKey: null, thumbnailKey: null, width: null, height: null, warning: null, errorCode: null, pipelineVersion: 'test' }).success).toBe(false);
  });
  it('cloud tidak disemai demo; akun A/B dan demo memakai namespace berbeda', () => {
    const values = new Map<string, string>(); const storage: KeyValueStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); } };
    const first = readLocal(storage, a).data; expect(first.items).toEqual([]);
    const changed = { ...first, intent: { ...first.intent, occasion: 'presentation' as const } };
    writeLocal(storage, first.token, changed, a);
    expect(readLocal(storage, b).data.intent.occasion).toBe('daily'); expect(readLocal(storage, a).data.intent.occasion).toBe('presentation');
    expect(new Set([storageKeyFor(a), storageKeyFor(b), storageKeyFor('demo-local-user')]).size).toBe(3);
  });
  it('cache akun lain tidak dibaca atau ditulis sebagai akun A', () => {
    const values = new Map<string, string>(); const storage: KeyValueStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); } };
    const source = freshData(); values.set(storageKeyFor(a), JSON.stringify(source));
    expect(readLocal(storage, a).blocked).toBe(true); expect(() => writeLocal(storage, source.token, source, a)).toThrow('akun ini');
  });
});
