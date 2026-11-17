import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createApi, type AuthContext } from './app';
import { ApiError, normalizeUpload } from './images';
import { type ItemInput, type WardrobeGateway } from './gateway';
import { demoItems } from '../../../packages/domain/fixtures';
import { type ClothingItem } from '../../../packages/domain';
import { photoKeys } from '../../../packages/domain/media';

const ownerA = '11111111-1111-4111-8111-111111111111';
const ownerB = '22222222-2222-4222-8222-222222222222';
const itemId = '33333333-3333-4333-8333-333333333333';
const assetId = '44444444-4444-4444-8444-444444444444';
const itemInput = { ...demoItems[0], id: itemId };
const png = () => sharp({ create: { width: 48, height: 64, channels: 4, background: '#657456' } }).png().toBuffer();
function multipartBody(image: Buffer, mime = 'image/png', input = itemInput) {
  const boundary = 'outfit-puzzle-test';
  const bytes = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify({ item: input, assetId })}\r\n--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="../../evil.png"\r\nContent-Type: ${mime}\r\n\r\n`), image, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return { bytes, headers: { authorization: 'Bearer a', 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
class MemoryGateway implements WardrobeGateway {
  items = new Map<string, ClothingItem>();
  constructor(readonly ownerId: string) {}
  async list() { return [...this.items.values()]; }
  async create(item: ItemInput) { const value = { ...item, ownerId: this.ownerId }; this.items.set(item.id, value); return value; }
  async update(id: string, item: ItemInput) { if (!this.items.has(id)) throw new ApiError(404, 'Item tidak ditemukan.'); return this.create(item); }
  upload = vi.fn(async (id: string, photoId: string, original: Buffer) => {
    const item = this.items.get(id); if (!item) throw new ApiError(404, 'Item tidak ditemukan.');
    expect((await sharp(original).metadata()).format).toBe('png');
    const value: ClothingItem = { ...item, photoRef: { assetId: photoId, originalKey: photoKeys(this.ownerId, id, photoId).original, cutoutKey: null, thumbnailKey: null, status: 'queued', width: null, height: null, warning: null, errorCode: null, pipelineVersion: 'test' } };
    this.items.set(id, value); return value;
  });
  async signedPhoto(id: string) { if (![...this.items.values()].some(i => i.photoRef?.assetId === id)) throw new ApiError(404, 'Foto tidak ditemukan.'); return 'https://private.example/image?token=short'; }
  async retry(id: string) { if (!this.items.has(id)) throw new ApiError(404, 'Item tidak ditemukan.'); }
  async delete(id: string) { if (!this.items.delete(id)) throw new ApiError(404, 'Item tidak ditemukan.'); }
}
const apps: Awaited<ReturnType<typeof createApi>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function setup() {
  const a = new MemoryGateway(ownerA), b = new MemoryGateway(ownerB);
  const app = await createApi({ allowedOrigins: ['http://localhost:5173'], authenticate: async token => {
    const values: Record<string, AuthContext> = { a: { ownerId: ownerA, gateway: a }, b: { ownerId: ownerB, gateway: b } };
    if (!values[token]) throw new ApiError(401, 'Sesi tidak valid.'); return values[token];
  } }); apps.push(app); return { app, a, b };
}
describe('Validasi dan normalisasi foto nyata (Sharp)', () => {
  it('decode, koreksi orientasi, dan re-encode membuang EXIF', async () => {
    const source = await sharp({ create: { width: 48, height: 64, channels: 3, background: '#587654' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const result = await normalizeUpload(source, 'image/jpeg'); const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe('png'); expect(metadata.width).toBe(64); expect(metadata.height).toBe(48); expect(metadata.exif).toBeUndefined(); expect(metadata.orientation).toBeUndefined();
  });
  it('menolak SVG/ekstensi palsu, MIME palsu, JPEG rusak, file kosong dan terlalu besar', async () => {
    await expect(normalizeUpload(Buffer.from('<svg/>'), 'image/png')).rejects.toMatchObject({ status: 415 });
    await expect(normalizeUpload(await png(), 'image/jpeg')).rejects.toMatchObject({ status: 415 });
    await expect(normalizeUpload(Buffer.from([255, 216, 255, 1]), 'image/jpeg')).rejects.toMatchObject({ status: 422 });
    await expect(normalizeUpload(Buffer.alloc(0), 'image/png')).rejects.toMatchObject({ status: 413 });
    await expect(normalizeUpload(Buffer.alloc(10 * 1024 * 1024 + 1), 'image/png')).rejects.toMatchObject({ status: 413 });
  });
  it('menolak gambar terlalu kecil', async () => {
    const tiny = await sharp({ create: { width: 16, height: 16, channels: 4, background: '#abc' } }).png().toBuffer();
    await expect(normalizeUpload(tiny, 'image/png')).rejects.toMatchObject({ status: 422 });
  });
});
describe('HTTP/auth/upload boundary (gateway injeksi, bukan live Supabase)', () => {
  it('health tersedia, route privat menolak token hilang dan invalid', async () => {
    const { app } = await setup(); expect((await app.inject('/health')).statusCode).toBe(200);
    expect((await app.inject('/api/v1/wardrobe')).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/v1/wardrobe', headers: { authorization: 'Bearer invalid' } })).statusCode).toBe(401);
  });
  it('unggah disanitasi, owner berasal sesi, file name tidak menjadi storage key', async () => {
    const { app, a } = await setup(); const payload = multipartBody(await png(), 'image/png', { ...itemInput, ownerId: ownerB });
    const result = await app.inject({ method: 'POST', url: '/api/v1/wardrobe', headers: payload.headers, payload: payload.bytes });
    expect(result.statusCode).toBe(202); expect(result.json().item.ownerId).toBe(ownerA); expect(result.json().item.photoRef.status).toBe('queued');
    expect(result.json().item.photoRef.originalKey).toBe(`${ownerA}/${itemId}/${assetId}/original.png`); expect(a.upload).toHaveBeenCalledOnce();
  });
  it('file palsu ditolak sebelum record pakaian dibuat', async () => {
    const { app, a } = await setup(); const body = multipartBody(Buffer.from('<svg/>'));
    const result = await app.inject({ method: 'POST', url: '/api/v1/wardrobe', headers: body.headers, payload: body.bytes });
    expect(result.statusCode).toBe(415); expect(a.items.size).toBe(0);
  });
  it('akun B tidak mendapat pakaian/foto A, tidak bisa menghapus atau menggantinya', async () => {
    const { app } = await setup(); const body = multipartBody(await png());
    await app.inject({ method: 'POST', url: '/api/v1/wardrobe', headers: body.headers, payload: body.bytes });
    const headers = { authorization: 'Bearer b' };
    expect((await app.inject({ url: '/api/v1/wardrobe', headers })).json().items).toEqual([]);
    expect((await app.inject({ url: `/api/v1/photos/${assetId}/original`, headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/wardrobe/${itemId}`, headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/wardrobe/${itemId}`, headers, payload: itemInput })).statusCode).toBe(404);
  });
  it('signed URL hanya untuk pemilik dan tidak dicache oleh API', async () => {
    const { app } = await setup(); const body = multipartBody(await png()); await app.inject({ method: 'POST', url: '/api/v1/wardrobe', headers: body.headers, payload: body.bytes });
    const result = await app.inject({ url: `/api/v1/photos/${assetId}/original`, headers: { authorization: 'Bearer a' } });
    expect(result.statusCode).toBe(200); expect(result.headers['cache-control']).toBe('no-store'); expect(result.json().expiresIn).toBe(60);
  });
});
