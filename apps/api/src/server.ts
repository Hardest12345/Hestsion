import { createApi, supabaseAuthenticator } from './app';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Pasang SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY di environment API. Jangan gunakan service_role untuk request pengguna.');
const app = await createApi({ allowedOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim()), authenticate: supabaseAuthenticator(url, key), logging: true });
await app.listen({ host: process.env.API_HOST ?? '127.0.0.1', port: Number(process.env.API_PORT ?? 3001) });
for (const event of ['SIGTERM', 'SIGINT'] as const) process.on(event, () => { void app.close(); });
