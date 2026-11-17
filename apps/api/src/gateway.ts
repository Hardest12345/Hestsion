import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ClothingItemSchema, type ClothingItem } from '../../../packages/domain';
import { PHOTO_BUCKET, PhotoRefSchema, photoKeys, type PhotoVariant } from '../../../packages/domain/media';
import { ApiError } from './images';

export type ItemInput = Omit<ClothingItem, 'ownerId' | 'photoRef'>;
export interface WardrobeGateway {
  list(): Promise<ClothingItem[]>;
  create(item: ItemInput): Promise<ClothingItem>;
  update(id: string, item: ItemInput): Promise<ClothingItem>;
  upload(id: string, assetId: string, original: Buffer): Promise<ClothingItem>;
  signedPhoto(assetId: string, variant: PhotoVariant): Promise<string>;
  retry(id: string): Promise<void>;
  delete(id: string): Promise<void>;
}
type AssetRow = { id: string; item_id: string; original_key: string; cutout_key: string | null; thumbnail_key: string | null; status: string; width: number | null; height: number | null; warning: string | null; error_code: string | null; pipeline_version: string };
type ItemRow = { id: string; metadata: unknown; photo_asset_id: string | null };
function checked<T>(value: { data: T; error: unknown }): T {
  if (value.error) throw new ApiError(502, 'Layanan penyimpanan belum dapat menyelesaikan permintaan. Coba lagi.');
  return value.data;
}
export class SupabaseWardrobe implements WardrobeGateway {
  constructor(private db: SupabaseClient, private ownerId: string) {}
  private decorate(row: ItemRow, assets: AssetRow[]): ClothingItem {
    const asset = assets.find(a => a.id === row.photo_asset_id);
    return ClothingItemSchema.parse({ ...(row.metadata as object), id: row.id, ownerId: this.ownerId, ...(asset ? { photoRef: PhotoRefSchema.parse({ assetId: asset.id, status: asset.status, originalKey: asset.original_key, cutoutKey: asset.cutout_key, thumbnailKey: asset.thumbnail_key, width: asset.width, height: asset.height, warning: asset.warning, errorCode: asset.error_code, pipelineVersion: asset.pipeline_version }) } : {}) });
  }
  private async owned(id: string) {
    const { data, error } = await this.db.from('clothing_items').select('id,metadata,photo_asset_id').eq('user_id', this.ownerId).eq('id', id).maybeSingle();
    if (error) throw new ApiError(502, 'Lemari belum dapat dibaca.');
    if (!data) throw new ApiError(404, 'Item tidak ditemukan.');
    return data as ItemRow;
  }
  private async one(id: string) {
    const row = await this.owned(id);
    const assets: AssetRow[] = row.photo_asset_id ? checked(await this.db.from('clothing_assets').select('*').eq('user_id', this.ownerId).eq('id', row.photo_asset_id)) ?? [] : [];
    return this.decorate(row, assets);
  }
  async list() {
    const rows = checked(await this.db.from('clothing_items').select('id,metadata,photo_asset_id').eq('user_id', this.ownerId).order('created_at', { ascending: false })) ?? [];
    const assets = rows.length ? checked(await this.db.from('clothing_assets').select('*').eq('user_id', this.ownerId).in('id', rows.map(r => r.photo_asset_id).filter(Boolean))) ?? [] : [];
    return rows.map(row => this.decorate(row, assets));
  }
  async create(item: ItemInput) {
    const { error } = await this.db.from('clothing_items').insert({ user_id: this.ownerId, id: item.id, metadata: item });
    if (error && error.code !== '23505') throw new ApiError(502, 'Item belum tersimpan. Coba lagi.');
    // Same client-generated ID is idempotent within its owner; never overwrite on conflict.
    return this.one(item.id);
  }
  async update(id: string, item: ItemInput) {
    await this.owned(id);
    checked(await this.db.from('clothing_items').update({ metadata: item, updated_at: new Date().toISOString() }).eq('user_id', this.ownerId).eq('id', id));
    return this.one(id);
  }
  async upload(id: string, assetId: string, original: Buffer) {
    await this.owned(id);
    const prior = checked(await this.db.from('clothing_assets').select('id,item_id').eq('user_id', this.ownerId).eq('id', assetId).maybeSingle());
    if (prior) { if (prior.item_id !== id) throw new ApiError(409, 'ID foto sudah digunakan. Pilih ulang gambar.'); return this.one(id); }
    const key = photoKeys(this.ownerId, id, assetId).original;
    const uploaded = await this.db.storage.from(PHOTO_BUCKET).upload(key, original, { contentType: 'image/png', cacheControl: '60', upsert: false });
    // A prior request may have uploaded the same immutable original before its response was lost.
    if (uploaded.error && String(uploaded.error.statusCode) !== '409') throw new ApiError(502, 'Foto belum terunggah. Coba lagi.');
    const queued = await this.db.rpc('enqueue_clothing_photo', { p_item_id: id, p_asset_id: assetId });
    if (queued.error) throw new ApiError(502, 'Foto belum masuk antrean. Simpan ulang dengan file yang sama untuk mencoba lagi.');
    return this.one(id);
  }
  async signedPhoto(assetId: string, variant: PhotoVariant) {
    const row = checked(await this.db.from('clothing_assets').select('*').eq('user_id', this.ownerId).eq('id', assetId).maybeSingle()) as AssetRow | null;
    if (!row) throw new ApiError(404, 'Foto tidak ditemukan.');
    const key = variant === 'original' ? row.original_key : row.status === 'ready' ? (variant === 'cutout' ? row.cutout_key : row.thumbnail_key) : null;
    if (!key) throw new ApiError(409, 'Hasil foto belum siap.');
    const data = checked(await this.db.storage.from(PHOTO_BUCKET).createSignedUrl(key, 60));
    if (!data) throw new ApiError(502, 'Foto belum dapat diakses.');
    return data.signedUrl;
  }
  async retry(id: string) {
    await this.owned(id);
    const result = checked(await this.db.rpc('retry_clothing_photo', { p_item_id: id }));
    if (!result) throw new ApiError(409, 'Foto masih diproses atau sudah siap.');
  }
  async delete(id: string) {
    await this.owned(id);
    const assets: AssetRow[] = checked(await this.db.from('clothing_assets').select('*').eq('user_id', this.ownerId).eq('item_id', id)) ?? [];
    // Include all per-lease outputs, including abandoned runs, without making the bucket public.
    for (const asset of assets) {
      const prefix = `${this.ownerId}/${id}/${asset.id}`;
      const runs = checked(await this.db.storage.from(PHOTO_BUCKET).list(`${prefix}/runs`, { limit: 1000 })) ?? [];
      const keys = [asset.original_key, ...runs.flatMap(r => [`${prefix}/runs/${r.name}/cutout.webp`, `${prefix}/runs/${r.name}/thumbnail.webp`])];
      checked(await this.db.storage.from(PHOTO_BUCKET).remove(keys));
    }
    checked(await this.db.from('clothing_items').delete().eq('user_id', this.ownerId).eq('id', id));
  }
}
export function userClient(url: string, key: string, jwt?: string) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: {
    ...(jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : {}),
    fetch: (url, options = {}) => fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }),
  } });
}
