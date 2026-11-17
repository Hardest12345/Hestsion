import { useState } from 'react';
import { Cloud, LogOut } from 'lucide-react';
import { Modal } from './components';
import { useCloud } from './cloud';

export function CloudAccount() {
  const cloud = useCloud();
  const [open, setOpen] = useState(false);
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <>
    <button className="local-badge account-button" onClick={() => setOpen(true)} disabled={cloud.loading}><Cloud size={14}/>{cloud.loading ? 'Memeriksa sesi…' : cloud.user ? 'Lemari privat' : 'Hubungkan cloud'}</button>
    {open && <Modal title={cloud.user ? 'Lemari privatmu' : 'Simpan foto di lemarimu'} onClose={() => { if (!busy) setOpen(false); }}>
      {cloud.user ? <div className="form-stack"><p className="muted">Masuk sebagai {cloud.user.email}. Pakaian dan foto tersimpan privat. Draft, outfit, dan riwayat pemakaian masih lokal pada perangkat ini dan dipisahkan per akun.</p><button className="secondary" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { const result = await cloud.client!.auth.signOut({ scope: 'local' }); if (result.error) throw result.error; setOpen(false); } catch { setError('Belum berhasil keluar. Coba lagi.'); } finally { setBusy(false); }
      }}><LogOut size={16}/>Keluar dari akun</button>{error && <p className="warning" role="alert">{error}</p>}</div>
      : !cloud.client ? <div className="help-content"><p>{cloud.configurationError || 'Koneksi Supabase belum disiapkan. Studio demo lokal tetap dapat digunakan.'}</p><p>Setelah koneksi aktif, kamu dapat masuk untuk mengunggah foto PNG/JPG dan menyimpannya secara privat. Pakaian demo tidak diunggah otomatis.</p></div>
      : <form className="form-stack" onSubmit={async e => {
        e.preventDefault(); const values = new FormData(e.currentTarget); const email = String(values.get('email')); const password = String(values.get('password'));
        setBusy(true); setError('');
        try {
          if (signup) {
            const result = await cloud.client!.auth.signUp({ email, password });
            if (result.error) throw result.error;
            if (!result.data.session) { setError('Periksa email untuk mengonfirmasi akun, lalu masuk di sini.'); setSignup(false); }
            else setOpen(false);
          } else {
            const result = await cloud.client!.auth.signInWithPassword({ email, password });
            if (result.error) throw result.error;
            setOpen(false);
          }
        } catch { setError(signup ? 'Akun belum dapat dibuat. Periksa email dan ketentuan kata sandi, lalu coba lagi.' : 'Belum berhasil masuk. Periksa email, kata sandi, dan konfirmasi akun.'); }
        finally { setBusy(false); }
      }}>
        <p className="muted">Foto aslimu dan hasil tanpa latar disimpan terpisah. Kamu tetap memilih nama, kategori, dan warna pakaian.</p>
        <label>Email<input name="email" type="email" required autoComplete="email"/></label><label>Kata sandi<input name="password" type="password" required minLength={signup ? 8 : 1} maxLength={72} autoComplete={signup ? 'new-password' : 'current-password'}/></label>
        {error && <p className="warning" role="status">{error}</p>}
        <button className="primary" disabled={busy} type="submit">{busy ? 'Menghubungkan…' : signup ? 'Buat akun' : 'Masuk'}</button><button className="text-button" type="button" disabled={busy} onClick={() => { setSignup(!signup); setError(''); }}>{signup ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}</button>
      </form>}
    </Modal>}
  </>;
}
