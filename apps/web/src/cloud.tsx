import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { z } from 'zod';
import { ClothingItemSchema, type ClothingItem } from '../../../packages/domain';
import { type PhotoVariant } from '../../../packages/domain/media';

export class CloudApi {
  constructor(private auth: SupabaseClient, private baseURL: string) {}
  private async request(path: string, init: RequestInit = {}) {
    const { data } = await this.auth.auth.getSession();
    if (!data.session) throw new Error('Masuk terlebih dahulu untuk menyimpan pakaian dan foto.');
    const response = await fetch(`${this.baseURL}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${data.session.access_token}` }, signal: init.signal ?? AbortSignal.timeout(60000) });
    if (response.status === 204) return null;
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? 'Koneksi cloud belum tersedia. Coba lagi.');
    return result;
  }
  async list() { return z.object({ items: z.array(ClothingItemSchema) }).parse(await this.request('/api/v1/wardrobe')).items; }
  async save(item: ClothingItem, file: File | null, assetId: string, existing: boolean) {
    if (existing) await this.request(`/api/v1/wardrobe/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
    if (file) {
      const form = new FormData(); form.set('metadata', JSON.stringify({ item, assetId })); form.set('image', file);
      return ClothingItemSchema.parse((await this.request(existing ? `/api/v1/wardrobe/${item.id}/photo` : '/api/v1/wardrobe', { method: 'POST', body: form })).item);
    }
    if (!existing) throw new Error('Pilih foto PNG/JPG untuk menambahkan pakaian.');
    return item;
  }
  async remove(id: string) { await this.request(`/api/v1/wardrobe/${id}`, { method: 'DELETE' }); }
  async retry(id: string) { await this.request(`/api/v1/wardrobe/${id}/retry-photo`, { method: 'POST' }); }
  async photo(assetId: string, variant: PhotoVariant) {
    return z.object({ url: z.url(), expiresIn: z.number() }).parse(await this.request(`/api/v1/photos/${assetId}/${variant}`)).url;
  }
}
interface CloudContextValue {
  user: User | null; client: SupabaseClient | null; api: CloudApi | null; loading: boolean; configurationError: string;
}
const CloudContext = createContext<CloudContextValue>({ user: null, client: null, api: null, loading: false, configurationError: '' });
export const useCloud = () => useContext(CloudContext);

function connection() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!url && !key && !base) return { client: null, api: null, error: '' };
  try {
    if (!url || !key || !base) throw new Error('Koneksi cloud belum lengkap. Studio lokal tetap tersedia.');
    const apiURL = new URL(base);
    if (!['https:', 'http:'].includes(apiURL.protocol) || apiURL.username || apiURL.password || apiURL.search || apiURL.hash) throw new Error('Alamat layanan cloud belum valid.');
    if (apiURL.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(apiURL.hostname)) throw new Error('Koneksi cloud harus memakai HTTPS.');
    let role = '';
    if (key.split('.').length === 3) role = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role;
    if (key.startsWith('sb_secret_') || role === 'service_role') throw new Error('Kunci server tidak boleh dipasang pada aplikasi browser.');
    const client = createClient(url, key);
    return { client, api: new CloudApi(client, base.replace(/\/$/, '')), error: '' };
  } catch (error) { return { client: null, api: null, error: error instanceof Error ? error.message : 'Koneksi cloud belum dapat disiapkan.' }; }
}
export function CloudProvider({ children }: { children: ReactNode }) {
  const [config] = useState(connection);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!config.client);
  useEffect(() => {
    if (!config.client) return;
    let active = true;
    // onAuthStateChange includes INITIAL_SESSION; avoid competing getSession race.
    const { data } = config.client.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session?.user ?? null); setLoading(false); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [config]);
  const value = useMemo(() => ({ user, loading, client: config.client, api: config.api, configurationError: config.error }), [user, loading, config]);
  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}
