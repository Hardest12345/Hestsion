import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({ plugins: [react(), viteSingleFile()], test: { projects: [{ extends: true, test: { name: 'domain', environment: 'node', include: ['packages/**/*.test.ts', 'apps/api/**/*.test.ts'] } }, { extends: true, test: { name: 'ui', environment: 'jsdom', env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_API_BASE_URL: '' }, include: ['apps/**/*.test.tsx'] } }] }, build: { target: 'es2022', sourcemap: false } });
