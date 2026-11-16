import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { freshData, STORAGE_KEY, type LocalData } from '../../../packages/domain/repository';

beforeEach(() => {
  window.localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const read = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY)!) as LocalData;
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }));
const save = async (title: string) => {
  await click('Simpan outfit');
  await userEvent.type(screen.getByLabelText('Nama outfit'), title);
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Simpan (outfit|draft)/ }));
};

describe('Alur UI lokal (DOM simulasi, tanpa browser)', () => {
  it('pasang via keyboard, kunci jeans, rekomendasi putih, pratinjau non-destruktif, ganti sepatu, undo/redo, simpan dan reload', async () => {
    render(<App/>);
    const jeans = screen.getByRole('button', { name: 'Pasang Jeans hitam' }); jeans.focus(); await userEvent.keyboard('{Enter}');
    await click('Kunci Bawahan');
    await userEvent.click(screen.getByText('Warna wajib & preferensi'));
    await userEvent.selectOptions(screen.getByLabelText('Warna atasan wajib'), 'white');
    await click('Lengkapi outfit');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Pratinjau alternatif/ }).length).toBeGreaterThan(0));
    await click('Pratinjau alternatif 1');
    expect(read().board.slots.top).toBeNull();
    expect(screen.getByTestId('slot-top').textContent).toMatch(/putih/);
    // Both mobile and desktop apply controls exist in DOM; CSS picks the viewport's control.
    await userEvent.click(screen.getAllByRole('button', { name: 'Terapkan pratinjau' })[0]);
    const before = structuredClone(read().board.slots);
    expect(before.bottom).toBe('jeans-black'); expect(before.top).toMatch(/white/);
    await userEvent.selectOptions(screen.getByLabelText('Mode rekomendasi'), 'replace_slots');
    await click('Cari pengganti'); await screen.findByRole('button', { name: 'Pratinjau alternatif 1' });
    await click('Pratinjau alternatif 1'); await userEvent.click(screen.getAllByRole('button', { name: 'Terapkan pratinjau' })[0]);
    expect(read().board.slots.shoes).not.toBe(before.shoes); expect(read().board.slots.top).toBe(before.top); expect(read().board.slots.bottom).toBe(before.bottom);
    await click('Undo'); expect(read().board.slots).toEqual(before); await click('Redo'); expect(read().board.slots.shoes).not.toBe(before.shoes);
    await save('Presentasi favorit'); expect(read().outfits).toHaveLength(1);
    cleanup(); render(<App/>); expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /^Outfit/ }));
    expect(screen.getByRole('heading', { name: 'Presentasi favorit' })).toBeTruthy();
    await click('Aku pakai ini'); await click('Dipakai hari ini'); expect(read().events.filter(e => e.type === 'worn')).toHaveLength(1);
  }, 20000);
  it('respons usang tidak pernah mengubah papan setelah edit saat request berjalan', async () => {
    render(<App/>); await click('Lengkapi outfit'); await click('Pasang Jeans hitam');
    await waitFor(() => expect(screen.getByText('Hasil usang')).toBeTruthy());
    expect(read().board.slots).toEqual({ top: null, bottom: 'jeans-black', shoes: null, outer: null });
    expect(screen.queryByRole('button', { name: 'Terapkan pratinjau' })).toBeNull();
  });
  it('konflik navy terkunci dan putih wajib tidak mengubah papan', async () => {
    render(<App/>); await click('Pasang Kemeja navy'); await click('Kunci Atasan');
    await userEvent.click(screen.getByText('Warna wajib & preferensi')); await userEvent.selectOptions(screen.getByLabelText('Warna atasan wajib'), 'white');
    await click('Lengkapi outfit'); await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/navy.*putih/));
    expect(read().board.slots.top).toBe('shirt-navy'); expect(screen.queryByRole('button', { name: 'Pratinjau alternatif 1' })).toBeNull();
  });
  it('CRUD pakaian, status laundry, dan penghapusan terkonfirmasi', async () => {
    render(<App/>); await click('Tambah pakaian');
    await userEvent.type(screen.getByLabelText('Nama pakaian'), 'Batik milikku'); await userEvent.selectOptions(screen.getByLabelText('Warna utama'), 'brown'); await click('Tambah keping');
    expect(read().items.find(i => i.name === 'Batik milikku')?.primaryColor).toBe('brown');
    await click('Edit Batik milikku'); await userEvent.selectOptions(screen.getByLabelText('Status'), 'unavailable'); await click('Simpan perubahan');
    expect(screen.queryByRole('button', { name: 'Pasang Batik milikku' })).toBeNull();
    await userEvent.click(screen.getByLabelText('Tampilkan laundry & arsip')); await click('Hapus Batik milikku'); await click('Lanjutkan');
    expect(read().items.some(i => i.name === 'Batik milikku')).toBe(false);
  });
  it('reset mempertahankan lock, hapus semua meminta konfirmasi, undo memulihkan lock', async () => {
    render(<App/>); await click('Pasang Jeans hitam'); await click('Kunci Bawahan'); await click('Pasang Kemeja putih'); await click('Reset');
    expect(read().board.slots.bottom).toBe('jeans-black'); expect(read().board.slots.top).toBeNull();
    await click('Hapus semua keping'); expect(screen.getByRole('dialog')).toBeTruthy(); await click('Batal'); expect(read().board.slots.bottom).toBe('jeans-black');
    await click('Hapus semua keping'); await click('Lanjutkan'); expect(read().board.slots.bottom).toBeNull(); await click('Undo'); expect(read().board.lockedSlots).toEqual(['bottom']);
  });
  it('kombinasi manual yang bertentangan dengan warna wajib bisa disimpan sebagai draft dengan peringatan', async () => {
    render(<App/>); await click('Pasang Kemeja navy'); await userEvent.click(screen.getByText('Warna wajib & preferensi')); await userEvent.selectOptions(screen.getByLabelText('Warna atasan wajib'), 'white');
    await save('Rakitan bebas'); expect(read().outfits[0].board.slots.top).toBe('shirt-navy');
  });
  it('snapshot outfit tetap ada setelah item dihapus dari lemari', async () => {
    const data = freshData(); data.board.slots.top = 'shirt-white';
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render(<App/>); await save('Kemeja kesukaan'); await click('Lepas Atasan'); await click('Hapus Kemeja putih'); await click('Lanjutkan');
    await userEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /^Outfit/ }));
    expect(screen.getByText('Ada item tidak tersedia. Kolase memakai snapshot asli.')).toBeTruthy();
    expect(read().outfits[0].itemSnapshots[0].name).toBe('Kemeja putih');
  });
  it('data rusak tidak ditimpa dan tidak disemai ulang tanpa tindakan pengguna', () => {
    window.localStorage.setItem(STORAGE_KEY, 'broken-json'); render(<App/>);
    expect(screen.getByText('Mode sementara')).toBeTruthy(); expect(window.localStorage.getItem(STORAGE_KEY)).toBe('broken-json');
    expect(screen.queryByRole('button', { name: 'Pasang Kemeja putih' })).toBeNull();
  });
  it('edit dari tab kedua menolak perubahan bertoken lama', async () => {
    render(<App/>); const other = read(); other.token = 'token-from-another-tab'; window.localStorage.setItem(STORAGE_KEY, JSON.stringify(other));
    fireEvent(window, new StorageEvent('storage', { key: STORAGE_KEY }));
    await click('Pasang Kemeja putih'); expect(screen.getByRole('status').textContent).toContain('tab lain'); expect(read().board.slots.top).toBeNull();
  });
});
