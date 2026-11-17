import sharp from 'sharp';
import { MAX_PHOTO_BYTES, MAX_PHOTO_PIXELS } from '../../../packages/domain/media';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function normalizeUpload(bytes: Buffer, claimedMime: string): Promise<Buffer> {
  if (!['image/png', 'image/jpeg'].includes(claimedMime)) throw new ApiError(415, 'Pilih file PNG atau JPG.');
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new ApiError(413, 'Gambar maksimal 10 MB.');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((!png && !jpg) || (png && claimedMime !== 'image/png') || (jpg && claimedMime !== 'image/jpeg')) throw new ApiError(415, 'Isi file tidak sesuai gambar PNG/JPG.');
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_PHOTO_PIXELS, failOn: 'warning', animated: false });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width < 32 || metadata.height < 32 || (metadata.pages ?? 1) !== 1) throw new ApiError(422, 'Gunakan satu foto minimal 32 × 32 piksel.');
    const normalized = await image.rotate().toColourspace('srgb').png({ compressionLevel: 9 }).toBuffer();
    if (normalized.length > 64 * 1024 * 1024) throw new ApiError(413, 'Gambar terlalu kompleks. Perkecil ukurannya lalu unggah lagi.');
    return normalized; // Decode + re-encode discards EXIF/GPS and ignores file names.
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, 'Gambar rusak, terlalu besar (maksimal 24 MP), atau tidak dapat dibaca.');
  }
}
