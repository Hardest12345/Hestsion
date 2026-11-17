import { z } from 'zod';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 24_000_000;
export const PHOTO_BUCKET = 'wardrobe-images';
export const PHOTO_PIPELINE_VERSION = 'birefnet-lite-alpha-lanczos-v1';
export const PhotoRefSchema = z.object({
  assetId: z.uuid(), status: z.enum(['queued', 'processing', 'ready', 'failed']),
  originalKey: z.string().min(1), cutoutKey: z.string().nullable(), thumbnailKey: z.string().nullable(),
  width: z.number().int().positive().nullable(), height: z.number().int().positive().nullable(),
  warning: z.enum(['low_resolution']).nullable(), errorCode: z.string().nullable(), pipelineVersion: z.string(),
}).refine(p => p.status !== 'ready' || (!!p.cutoutKey && !!p.thumbnailKey && !!p.width && !!p.height), 'Foto siap harus memiliki hasil olahan.');
export type PhotoRef = z.infer<typeof PhotoRefSchema>;
export type PhotoVariant = 'original' | 'cutout' | 'thumbnail';
export const photoStatusLabel: Record<PhotoRef['status'], string> = { queued: 'Menunggu pemrosesan', processing: 'Memisahkan latar…', ready: 'Latar dibersihkan', failed: 'Pemrosesan gagal' };
export function photoKeys(userId: string, itemId: string, assetId: string) {
  for (const id of [userId, itemId, assetId]) z.uuid().parse(id);
  const prefix = `${userId}/${itemId}/${assetId}`;
  return { original: `${prefix}/original.png`, cutout: `${prefix}/cutout.webp`, thumbnail: `${prefix}/thumbnail.webp` };
}
export function validatePhotoSelection(file: Pick<File, 'type' | 'size'>): string | null {
  if (!['image/png', 'image/jpeg'].includes(file.type)) return 'Pilih gambar PNG atau JPG.';
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) return 'Ukuran gambar harus lebih dari 0 dan maksimal 10 MB.';
  return null;
}
