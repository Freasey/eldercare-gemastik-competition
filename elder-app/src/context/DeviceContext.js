/**
 * Keadaan perangkat: sudah terhubung ke seorang lansia, atau belum.
 *
 * Hanya ada dua keadaan itu, dan itulah seluruh "navigasi" app ini — tidak ada
 * router, tidak ada tumpukan layar, tidak ada tombol kembali (PLAN §2.6).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearToken, saveToken } from '../api/client.js';
import { clearElder, loadElder, saveElder } from '../lib/store.js';

const DeviceContext = createContext(null);

export function DeviceProvider({ children }) {
  const [status, setStatus] = useState('memuat'); // memuat | belum | terhubung
  const [elder, setElder] = useState(null);

  useEffect(() => {
    loadElder()
      .then((tersimpan) => {
        setElder(tersimpan);
        setStatus(tersimpan ? 'terhubung' : 'belum');
      })
      .catch(() => setStatus('belum'));
  }, []);

  /** Dipanggil layar pairing setelah `POST /api/auth/pair` berhasil. */
  const hubungkan = useCallback(async ({ token, elder: profil }) => {
    await saveToken(token);
    await saveElder(profil);
    setElder(profil);
    setStatus('terhubung');
  }, []);

  /**
   * Dipanggil saat backend menolak perangkat ini — biasanya karena keluarga
   * menekan "putuskan perangkat". App kembali ke keadaan awal dan meminta kode
   * baru, bukan menampilkan pesan error yang tidak bisa ditindaklanjuti lansia.
   */
  const putuskan = useCallback(async () => {
    await clearToken();
    await clearElder();
    setElder(null);
    setStatus('belum');
  }, []);

  const value = useMemo(() => ({ status, elder, hubungkan, putuskan }), [status, elder, hubungkan, putuskan]);

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevice dipakai di luar DeviceProvider');
  return ctx;
}
