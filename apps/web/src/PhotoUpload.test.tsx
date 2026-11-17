import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemForm } from './components';
import { ClothingPhoto } from './ClothingPhoto';
import { demoItems } from '../../../packages/domain/fixtures';
import { type ClothingItem } from '../../../packages/domain';

const mocks = vi.hoisted(() => ({ photo: vi.fn(), owner: '11111111-1111-4111-8111-111111111111' }));
vi.mock('./cloud', () => ({ useCloud: () => ({ user: { id: mocks.owner }, api: { photo: mocks.photo } }) }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  URL.createObjectURL = vi.fn(() => 'blob:local-preview'); URL.revokeObjectURL = vi.fn();
  mocks.photo.mockReset(); mocks.photo.mockResolvedValue('https://private.example/image?token=short');
});
afterEach(() => cleanup());

describe('Tambah foto pakaian (DOM simulasi)', () => {
  it('cloud baru mewajibkan foto dan menolak SVG serta lebih dari 10 MB', async () => {
    const save = vi.fn(); render(<ItemForm ownerId={mocks.owner} cloudEnabled onSubmit={save} onClose={() => {}}/>);
    fireEvent.submit(screen.getByRole('button', { name: 'Tambah keping' }).closest('form')!);
    expect(screen.getByRole('alert').textContent).toContain('Pilih foto'); expect(save).not.toHaveBeenCalled();
    const user = userEvent.setup({ applyAccept: false }); const input = screen.getByLabelText(/Foto pakaian/);
    await user.upload(input, new File(['<svg/>'], 'photo.png', { type: 'image/svg+xml' })); expect(screen.getByRole('alert').textContent).toContain('PNG');
    await user.upload(input, new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'photo.png', { type: 'image/png' })); expect(screen.getByRole('alert').textContent).toContain('10 MB');
  });
  it('file tersampaikan terpisah dari metadata; ID retry stabil dan object URL dibuang', async () => {
    const save = vi.fn(); const { unmount } = render(<ItemForm ownerId={mocks.owner} cloudEnabled onSubmit={save} onClose={() => {}}/>);
    const file = new File(['test-png-data'], 'shirt.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText(/Foto pakaian/), file); await userEvent.type(screen.getByLabelText('Nama pakaian'), 'Kemeja foto');
    expect((screen.getByLabelText(/Foto pakaian/) as HTMLInputElement).files?.length).toBe(1);
    fireEvent.submit(screen.getByRole('button', { name: 'Tambah keping' }).closest('form')!);
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const [item, uploaded, asset] = save.mock.calls[0];
    expect(item.ownerId).toBe(mocks.owner); expect(item.photoRef).toBeUndefined(); expect(uploaded).toBe(file); expect(asset).toMatch(/^[a-f0-9-]{36}$/);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Tambah keping' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.submit(screen.getByRole('button', { name: 'Tambah keping' }).closest('form')!);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0].id).toBe(item.id); expect(save.mock.calls[1][2]).toBe(asset);
    unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview');
  });
  it('foto gagal menampilkan retry, foto sumber dan hasil tidak dicampur', async () => {
    const item: ClothingItem = { ...demoItems[0], ownerId: mocks.owner, photoRef: { assetId: '44444444-4444-4444-8444-444444444444', originalKey: 'original.png', cutoutKey: null, thumbnailKey: null, width: null, height: null, status: 'failed', warning: null, errorCode: 'processing_failed', pipelineVersion: 'test' } };
    const retry = vi.fn(); render(<ItemForm item={item} ownerId={mocks.owner} cloudEnabled onSubmit={() => {}} onClose={() => {}} onRetry={retry}/>);
    expect(screen.getByText('Belum berhasil. Foto asli tetap aman.')).toBeTruthy(); await userEvent.click(screen.getByRole('button', { name: 'Coba proses lagi' })); expect(retry).toHaveBeenCalledOnce();
    await waitFor(() => expect(mocks.photo).toHaveBeenCalledWith(item.photoRef!.assetId, 'original'));
  });
  it('foto asset lama tidak dipakai sebagai hasil asset baru selama request berjalan', async () => {
    const first: ClothingItem = { ...demoItems[0], ownerId: mocks.owner, photoRef: { assetId: '44444444-4444-4444-8444-444444444444', originalKey: 'original.png', cutoutKey: 'cutout.webp', thumbnailKey: 'thumb.webp', width: 128, height: 128, status: 'ready', warning: null, errorCode: null, pipelineVersion: 'test' } };
    const { rerender } = render(<ClothingPhoto item={first}/>); await screen.findByRole('img');
    mocks.photo.mockImplementation(() => new Promise(() => {}));
    rerender(<ClothingPhoto item={{ ...first, photoRef: { ...first.photoRef!, assetId: '55555555-5555-4555-8555-555555555555' } }}/>);
    expect(screen.queryByRole('img')).toBeNull(); expect(screen.getByText('Memuat foto…')).toBeTruthy();
  });
});
