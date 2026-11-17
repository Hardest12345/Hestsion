/** Explicit live integration test. Creates/deletes two temporary confirmed users,
 * uses their JWTs for application operations, and never sends confirmation emails.
 * Not included in Vitest/CI. Run only against the intended development project.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApi, supabaseAuthenticator } from '../apps/api/src/app';
import { PHOTO_BUCKET } from '../packages/domain/media';
import { type ClothingItem } from '../packages/domain';

const url = process.env.SUPABASE_URL;
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publicKey || !secretKey) throw new Error('Live smoke requires URL, publishable key and private worker secret via environment.');
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const createdUsers: string[] = [];
const runId = randomUUID();
const stages: string[] = [];
let app: Awaited<ReturnType<typeof createApi>> | undefined;
let tokenA = '';
let itemId: string | null = null;
let cleanupComplete = false;

async function createTestAccount(label: string): Promise<{ token: string; db: SupabaseClient; id: string }> {
  const email = `photo-${label}-${runId}@outfit-puzzle.invalid`;
  const password = `Test-${randomUUID()}`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { purpose: 'outfit-puzzle-live-smoke', runId } });
  assert.equal(result.error, null, `Temporary account ${label} creation failed`);
  assert.ok(result.data.user);
  createdUsers.push(result.data.user.id);
  const client = createClient(url!, publicKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null, `Temporary account ${label} login failed`);
  assert.ok(login.data.session);
  const token = login.data.session.access_token;
  const db = createClient(url!, publicKey!, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  return { token, db, id: result.data.user.id };
}
try {
  const pending = await admin.from('clothing_assets').select('id').in('status', ['queued', 'processing']).limit(1);
  assert.equal(pending.error, null, 'Migration is not available or worker secret is invalid');
  assert.equal(pending.data!.length, 0, 'Live smoke requires an empty queue; it will not consume existing users jobs');
  const a = await createTestAccount('a');
  const b = await createTestAccount('b');
  tokenA = a.token;
  stages.push('two_temporary_accounts_authenticated');
  app = await createApi({ allowedOrigins: ['http://localhost:5173'], authenticate: supabaseAuthenticator(url, publicKey) });
  const generatedId = randomUUID(); itemId = generatedId;
  const assetId = randomUUID();
  const input = { id: generatedId, name: 'Temporary smoke shirt', category: 'top', primaryColor: 'navy', status: 'available', formality: 3, layerWarmth: 0, styleTags: [] };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="768" height="896"><rect width="768" height="896" fill="#e0d5bf"/><path d="M270 160 195 198 100 385 205 438 250 335 235 745 535 745 520 335 565 438 670 385 575 198 500 160 450 190 320 190Z" fill="#445b7c" stroke="#2b3d58" stroke-width="4"/><path d="M385 195V738M270 160 385 202 320 267ZM500 160 385 202 450 267Z" stroke="#30415b" fill="#536b8c" stroke-width="4"/></svg>';
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const boundary = `smoke-${runId}`;
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify({ item: input, assetId })}\r\n--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="shirt.png"\r\nContent-Type: image/png\r\n\r\n`), png, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const uploaded = await app.inject({ method: 'POST', url: '/api/v1/wardrobe', headers: { authorization: `Bearer ${a.token}`, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  assert.equal(uploaded.statusCode, 202, `Live upload failed (${uploaded.statusCode})`);
  const initial: ClothingItem = uploaded.json().item;
  assert.equal(initial.ownerId, a.id); assert.equal(initial.photoRef!.status, 'queued');
  stages.push('real_api_upload_normalized_private_original_and_queued');

  const bList = await app.inject({ url: '/api/v1/wardrobe', headers: { authorization: `Bearer ${b.token}` } });
  assert.deepEqual(bList.json().items, []);
  const bRows = await b.db.from('clothing_items').select('*').eq('user_id', a.id);
  assert.equal(bRows.error, null); assert.deepEqual(bRows.data, []);
  const bSigned = await b.db.storage.from(PHOTO_BUCKET).createSignedUrl(initial.photoRef!.originalKey, 60);
  assert.ok(bSigned.error); assert.equal(bSigned.data, null);
  const bPhoto = await app.inject({ url: `/api/v1/photos/${assetId}/original`, headers: { authorization: `Bearer ${b.token}` } });
  assert.equal(bPhoto.statusCode, 404);
  const bDelete = await app.inject({ method: 'DELETE', url: `/api/v1/wardrobe/${generatedId}`, headers: { authorization: `Bearer ${b.token}` } });
  assert.equal(bDelete.statusCode, 404);
  const claimAsUser = await a.db.rpc('claim_clothing_photo'); assert.ok(claimAsUser.error);
  stages.push('live_rls_owner_isolation_and_worker_rpc_denial');

  const worker = spawnSync(process.env.PHOTO_WORKER_PYTHON ?? 'python3', ['services/photo-worker/run_once.py'], { env: process.env, encoding: 'utf8', timeout: 300000, maxBuffer: 1024 * 1024 });
  assert.equal(worker.status, 0, `One-shot worker failed (status ${worker.status})`);
  const refreshed = await app.inject({ url: '/api/v1/wardrobe', headers: { authorization: `Bearer ${a.token}` } });
  const ready: ClothingItem = refreshed.json().items.find((i: ClothingItem) => i.id === generatedId);
  assert.equal(ready.photoRef!.status, 'ready', 'Worker did not produce a ready asset');
  assert.equal(ready.photoRef!.pipelineVersion, 'birefnet-lite-alpha-lanczos-v1');
  const signed = await app.inject({ url: `/api/v1/photos/${assetId}/cutout`, headers: { authorization: `Bearer ${a.token}` } });
  assert.equal(signed.statusCode, 200); assert.equal(signed.headers['cache-control'], 'no-store');
  const photo = await fetch(signed.json().url); assert.ok(photo.ok);
  const metadata = await sharp(Buffer.from(await photo.arrayBuffer())).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.hasAlpha, true);
  stages.push('live_worker_claim_segment_matting_finalize_and_private_webp_download');

  const deletion = await app.inject({ method: 'DELETE', url: `/api/v1/wardrobe/${generatedId}`, headers: { authorization: `Bearer ${a.token}` } });
  assert.equal(deletion.statusCode, 204);
  const remain = await admin.from('clothing_assets').select('id').eq('id', assetId);
  assert.equal(remain.error, null); assert.deepEqual(remain.data, []);
  for (const key of [ready.photoRef!.originalKey, ready.photoRef!.cutoutKey!, ready.photoRef!.thumbnailKey!]) {
    const response = await admin.storage.from(PHOTO_BUCKET).download(key); assert.ok(response.error, 'Deleted object still exists');
  }
  itemId = null;
  stages.push('live_delete_removed_original_cutout_thumbnail_and_asset_rows');
} finally {
  if (app && itemId && tokenA) {
    const result = await app.inject({ method: 'DELETE', url: `/api/v1/wardrobe/${itemId}`, headers: { authorization: `Bearer ${tokenA}` } });
    if (![204, 404].includes(result.statusCode)) console.error('Temporary image cleanup needs attention; no credentials are printed.');
  }
  if (app) await app.close();
  const errors = [];
  for (const id of createdUsers) {
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error) errors.push(id);
  }
  cleanupComplete = errors.length === 0;
  if (!cleanupComplete) console.error('Temporary account cleanup needs attention.');
  const report = { status: stages.length === 5 && cleanupComplete ? 'passed' : 'incomplete', stages, temporaryAccountsDeleted: createdUsers.length - errors.length, temporaryImagesDeleted: itemId === null, scope: 'Real Supabase Auth, PostgREST, Storage, API injection and Python model worker; no browser UI.' };
  const folder = process.env.LIVE_SMOKE_OUTPUT ?? 'work/live-supabase-smoke';
  await mkdir(folder, { recursive: true }); await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!cleanupComplete) process.exitCode = 1;
}
