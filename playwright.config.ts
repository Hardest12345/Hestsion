import { defineConfig, devices } from '@playwright/test';

const managed = process.env.SITES_MANAGED_LINUX_CONTAINER === '1';
const previewURL = process.env.E2E_BASE_URL;
if (managed && !previewURL && !process.argv.includes('--list')) throw new Error('E2E belum dijalankan: managed environment membutuhkan E2E_BASE_URL dari preview resmi. Tidak memulai server/browser alternatif. Di komputer lokal: npx playwright install chromium, lalu npm run test:e2e. Pada managed environment yang mendukung browser, isi E2E_BASE_URL dengan URL persis dari sites-preview start.');

export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true, reporter: 'list',
  use: { baseURL: previewURL ?? 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile-360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true } }],
  webServer: previewURL ? undefined : { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
