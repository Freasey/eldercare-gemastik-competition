/**
 * Sesi login keluarga.
 *
 * Jalur utama saat ini `POST /api/auth/guest`: tanpa input, masuk ke akun demo,
 * dan hidup di backend lokal maupun production.
 *
 * Google OAuth menyusul: Android client ID butuh SHA-1 dari keystore yang baru
 * terbit setelah build pertama. Begitu ada, tinggal panggil
 * `loginWithGoogle(idToken)` yang sudah disiapkan di `api/caretaker.js`; sisa
 * aplikasi tidak perlu berubah karena semuanya menghasilkan JWT yang sama.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearToken, loadToken, saveToken } from '../api/client.js';
import { fetchMe, guestLogin } from '../api/caretaker.js';
import { batalkanPush, daftarkanPush } from '../notifications/push.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(true);
  /** @type {[null | {ok: boolean, alasan?: string, token?: string}, Function]} */
  const [push, setPush] = useState(null);

  // Cek token tersimpan sekali saat app dibuka, supaya tidak perlu login ulang.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await loadToken();
        if (token) {
          const { user: me } = await fetchMe();
          if (alive) setUser(me);
        }
      } catch {
        // Token kedaluwarsa/backend pindah buang saja, user login lagi.
        await clearToken();
      } finally {
        if (alive) setRestoring(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signInAsGuest = useCallback(async () => {
    const { token, user: me } = await guestLogin();
    await saveToken(token);
    setUser(me);
    return me;
  }, []);

  const signOut = useCallback(async () => {
    // Urutannya penting: mencabut pendaftaran push butuh token yang masih sah.
    // Kalau dibalik, HP ini tetap menerima kabar darurat lansia milik akun yang
    // sudah ditinggalkan.
    await batalkanPush();
    await clearToken();
    setUser(null);
    setPush(null);
  }, []);

  /**
   * Daftarkan push begitu ada sesi termasuk sesi yang dipulihkan saat app
   * dibuka, karena token FCM bisa dirotasi Android kapan saja dan yang
   * tersimpan di server jadi basi tanpa ada kejadian apa pun yang menandainya.
   *
   * Sengaja tidak memblokir apa pun: gagal mendaftarkan push tidak boleh
   * membuat app tidak bisa dipakai. Hasilnya ditampilkan di layar Profil.
   */
  const refreshPush = useCallback(async () => {
    const hasil = await daftarkanPush();
    setPush(hasil);
    return hasil;
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshPush().catch((err) => setPush({ ok: false, alasan: err.message }));
  }, [user, refreshPush]);

  const value = useMemo(
    () => ({
      user,
      restoring,
      isGuest: user?.guest === true,
      push,
      refreshPush,
      signInAsGuest,
      signOut,
    }),
    [user, restoring, push, refreshPush, signInAsGuest, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}
