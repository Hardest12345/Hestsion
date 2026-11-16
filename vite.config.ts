import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({ plugins: [react(), viteSingleFile()], test: { projects: [{ extends: true, test: { name: 'domain', environment: 'node', include: ['packages/**/*.test.ts'] } }, { extends: true, test: { name: 'ui', environment: 'jsdom', include: ['apps/**/*.test.tsx'] } }] }, build: { target: 'es2022', sourcemap: false } });
