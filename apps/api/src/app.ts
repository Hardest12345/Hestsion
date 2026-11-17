import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { ClothingItemSchema } from '../../../packages/domain';
import { MAX_PHOTO_BYTES } from '../../../packages/domain/media';
import { ApiError, normalizeUpload } from './images';
import { type WardrobeGateway, SupabaseWardrobe, userClient } from './gateway';

export const ItemInputSchema = ClothingItemSchema.omit({ ownerId: true, photoRef: true }).extend({ id: z.uuid() });
const UploadSchema = z.object({ item: ItemInputSchema, assetId: z.uuid() });
export interface AuthContext { ownerId: string; gateway: WardrobeGateway }
export interface ApiOptions {
  allowedOrigins: string[];
  authenticate(token: string): Promise<AuthContext>;
  logging?: boolean;
}
export function supabaseAuthenticator(url: string, key: string): ApiOptions['authenticate'] {
  return async token => {
    const db = userClient(url, key, token);
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new ApiError(401, 'Sesi habis. Silakan masuk lagi.');
    return { ownerId: data.user.id, gateway: new SupabaseWardrobe(db, data.user.id) };
  };
}
export async function createApi(options: ApiOptions) {
  const app = Fastify({ logger: options.logging ? { redact: ['req.headers.authorization', 'req.headers.cookie'] } : false, bodyLimit: 32 * 1024, requestTimeout: 60000 });
  const sessions = new WeakMap<FastifyRequest, AuthContext>();
  await app.register(cors, { origin: (origin, callback) => callback(null, !origin || options.allowedOrigins.includes(origin)), methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type'] });
  app.addHook('onRequest', async request => {
    if (request.method === 'OPTIONS' || (request.method === 'GET' && request.url === '/health')) return;
    const value = request.headers.authorization;
    if (!value?.startsWith('Bearer ') || value.length > 8192) throw new ApiError(401, 'Masuk terlebih dahulu untuk mengakses lemari privat.');
    const context = await options.authenticate(value.slice(7));
    z.uuid().parse(context.ownerId);
    sessions.set(request, context);
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute', hook: 'preHandler', keyGenerator: request => sessions.get(request)?.ownerId ?? request.ip });
  await app.register(multipart, { limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 1, parts: 2, fieldSize: 16 * 1024 } });
  const gateway = (request: FastifyRequest) => {
    const context = sessions.get(request); if (!context) throw new ApiError(401, 'Sesi tidak valid.'); return context.gateway;
  };
  async function upload(request: FastifyRequest) {
    let bytes: Buffer | undefined; let mime = ''; let metadata: unknown;
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'image') throw new ApiError(400, 'Field foto tidak dikenali.');
        mime = part.mimetype; bytes = await part.toBuffer();
        if (part.file.truncated) throw new ApiError(413, 'Gambar maksimal 10 MB.');
      } else if (part.fieldname === 'metadata' && typeof part.value === 'string') {
        try { metadata = JSON.parse(part.value); } catch { throw new ApiError(400, 'Metadata pakaian tidak valid.'); }
      } else throw new ApiError(400, 'Field unggahan tidak dikenali.');
    }
    if (!bytes) throw new ApiError(400, 'Pilih foto PNG/JPG terlebih dahulu.');
    const input = UploadSchema.parse(metadata);
    const original = await normalizeUpload(bytes, mime);
    return { ...input, original };
  }
  app.get('/health', async () => ({ status: 'ok', photoProcessing: 'external-worker', apiVersion: 1 }));
  app.get('/api/v1/wardrobe', async request => ({ items: await gateway(request).list() }));
  app.post('/api/v1/wardrobe', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { item, assetId, original } = await upload(request);
    const repo = gateway(request); await repo.create(item);
    const created = await repo.upload(item.id, assetId, original);
    reply.code(202); return { item: created };
  });
  app.patch('/api/v1/wardrobe/:id', async request => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const item = ItemInputSchema.parse(request.body);
    if (id !== item.id) throw new ApiError(400, 'ID pakaian tidak sesuai.');
    return { item: await gateway(request).update(id, item) };
  });
  app.post('/api/v1/wardrobe/:id/photo', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (request, reply) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const { item, assetId, original } = await upload(request);
    if (id !== item.id) throw new ApiError(400, 'ID pakaian tidak sesuai.');
    reply.code(202); return { item: await gateway(request).upload(id, assetId, original) };
  });
  app.post('/api/v1/wardrobe/:id/retry-photo', async request => {
    const id = z.uuid().parse((request.params as { id: string }).id); await gateway(request).retry(id); return { status: 'queued' };
  });
  app.get('/api/v1/photos/:assetId/:variant', async (request, reply) => {
    const { assetId, variant } = z.object({ assetId: z.uuid(), variant: z.enum(['original', 'cutout', 'thumbnail']) }).parse(request.params);
    reply.header('Cache-Control', 'no-store'); return { url: await gateway(request).signedPhoto(assetId, variant), expiresIn: 60 };
  });
  app.delete('/api/v1/wardrobe/:id', async (request, reply) => {
    const id = z.uuid().parse((request.params as { id: string }).id); await gateway(request).delete(id); reply.code(204).send();
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) { reply.code(error.status).send({ message: error.message }); return; }
    if (error instanceof z.ZodError || error instanceof SyntaxError) { reply.code(400).send({ message: 'Data pakaian atau permintaan tidak valid.' }); return; }
    const status = Number(typeof error === 'object' && error && 'statusCode' in error ? error.statusCode : 500);
    if (status === 413) { reply.code(413).send({ message: 'Gambar maksimal 10 MB, satu file per unggahan.' }); return; }
    if (status === 429) { reply.code(429).send({ message: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.' }); return; }
    request.log.warn({ requestId: request.id, errorType: error instanceof Error ? error.name : 'UnknownError' }, 'Request failed');
    reply.code(status >= 400 && status < 500 ? status : 500).send({ message: 'Permintaan belum dapat diselesaikan. Coba lagi.' });
  });
  return app;
}
