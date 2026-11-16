import { test, expect, type Page } from '@playwright/test';

async function panel(page: Page, name: 'Papan' | 'Lemari' | 'Saran') {
  const tab = page.locator('.mobile-tabs').getByRole('button', { name, exact: true });
  if (await tab.isVisible()) await tab.click();
}
async function place(page: Page, name: string) {
  await panel(page, 'Lemari'); await page.getByRole('button', { name: `Pasang ${name}`, exact: true }).click();
}
test.beforeEach(async ({ page }) => { await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload(); });

test('A01 salah kategori via drag ditolak', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-360', 'Alternatif tap/keyboard diuji pada mobile.');
  const item = page.getByRole('button', { name: 'Pasang Kemeja putih', exact: true });
  await item.dragTo(page.getByTestId('slot-bottom'));
  await expect(page.getByRole('status')).toContainText('Salah kategori');
  await expect(page.getByTestId('slot-bottom')).toContainText('Pilih bawahanmu');
});
test('A02/A03/A05/A09 alur tap/keyboard, lock, putih wajib, ganti sepatu, simpan dan reload', async ({ page }) => {
  await place(page, 'Jeans hitam'); await panel(page, 'Papan');
  const lock = page.getByRole('button', { name: 'Kunci Bawahan', exact: true }); await lock.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Buka kunci Bawahan', exact: true })).toBeVisible();
  await panel(page, 'Saran'); await page.getByText('Warna wajib & preferensi', { exact: true }).click();
  await page.getByLabel('Warna atasan wajib', { exact: true }).selectOption('white');
  await page.getByRole('button', { name: 'Lengkapi outfit', exact: true }).click();
  await page.getByRole('button', { name: 'Pratinjau alternatif 1', exact: true }).click();
  await expect(page.getByTestId('slot-bottom')).toContainText('Jeans hitam');
  const apply = page.getByRole('button', { name: 'Terapkan pratinjau', exact: true }).filter({ visible: true }); await apply.click();
  await panel(page, 'Papan'); const beforeTop = await page.getByTestId('slot-top').innerText(); const beforeBottom = await page.getByTestId('slot-bottom').innerText(); const oldShoe = await page.getByTestId('slot-shoes').locator('.slot-item-name').innerText();
  await panel(page, 'Saran'); await page.getByLabel('Mode rekomendasi').selectOption('replace_slots');
  await page.getByRole('button', { name: 'Cari pengganti', exact: true }).click();
  await page.getByRole('button', { name: 'Pratinjau alternatif 1', exact: true }).click();
  await page.getByRole('button', { name: 'Terapkan pratinjau', exact: true }).filter({ visible: true }).click();
  await panel(page, 'Papan'); await expect(page.getByTestId('slot-top')).toHaveText(beforeTop); await expect(page.getByTestId('slot-bottom')).toHaveText(beforeBottom);
  await expect(page.getByTestId('slot-shoes').locator('.slot-item-name')).not.toHaveText(oldShoe);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.getByTestId('slot-shoes').locator('.slot-item-name')).toHaveText(oldShoe);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Simpan outfit', exact: true }).click(); await page.getByLabel('Nama outfit').fill('Presentasi tetap santai');
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan outfit', exact: true }).click();
  await page.reload(); await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.getByRole('navigation').getByRole('button', { name: /^Outfit/ }).click(); await expect(page.getByRole('heading', { name: 'Presentasi tetap santai', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Aku pakai ini', exact: true }).click(); await expect(page.getByRole('button', { name: 'Dipakai hari ini', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('A06 konflik eksplisit dan A08 hasil usang', async ({ page }) => {
  await place(page, 'Kemeja navy'); await panel(page, 'Papan'); await page.getByRole('button', { name: 'Kunci Atasan', exact: true }).click();
  await panel(page, 'Saran'); await page.getByText('Warna wajib & preferensi', { exact: true }).click(); await page.getByLabel('Warna atasan wajib', { exact: true }).selectOption('white');
  await page.getByRole('button', { name: 'Lengkapi outfit', exact: true }).click(); await expect(page.locator('.suggestions')).toContainText('navy'); await expect(page.locator('.suggestions')).toContainText('putih');
  await page.getByLabel('Warna atasan wajib', { exact: true }).selectOption(''); await page.getByRole('button', { name: 'Lengkapi outfit', exact: true }).click();
  await page.getByLabel('Cuaca', { exact: true }).selectOption('cold'); await expect(page.locator('.suggestions')).toContainText('Hasil usang');
  await panel(page, 'Papan'); await expect(page.getByTestId('slot-top')).toContainText('Kemeja navy');
});
test('CRUD item dan status arsip', async ({ page }) => {
  await page.getByRole('navigation').getByRole('button', { name: 'Lemari', exact: true }).click(); await page.getByRole('button', { name: 'Tambah pakaian', exact: true }).click();
  await page.getByLabel('Nama pakaian').fill('Kemeja milikku'); await page.getByLabel('Warna utama').selectOption('white'); await page.getByRole('button', { name: 'Tambah keping', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pasang Kemeja milikku', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Kemeja milikku', exact: true }).click(); await page.getByLabel('Status', { exact: true }).selectOption('archived'); await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
  await page.getByLabel('Tampilkan laundry & arsip').check(); await expect(page.getByRole('button', { name: 'Pasang Kemeja milikku', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Hapus Kemeja milikku', exact: true }).click(); await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pasang Kemeja milikku', exact: true })).toHaveCount(0);
});
