/**
 * Sesi login keluarga.
 *
 * Jalur utama saat ini `POST /api/auth/guest`: tanpa input, masuk ke akun demo,
 * dan hidup di backend lokal maupun production. `signInAsDemo` (dev-login)
 * disimpan untuk development karena bisa memilih email mana pun — tapi backend
 * mematikannya di production.
 *
 * Google OAuth menyusul: Android client ID butuh SHA-1 dari keystore yang baru
 * terbit setelah build pertama. Begitu ada, tinggal panggil
 * `loginWithGoogle(idToken)` yang sudah disiapkan di `api/caretaker.js`; sisa
 * aplikasi tidak perlu berubah karena semuanya menghasilkan JWT yang sama.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearToken, loadToken, saveToken } from '../api/client.js';
import { devLogin, fetchMe, guestLogin } from '../api/caretaker.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(true);

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
        // Token kedaluwarsa/backend pindah — buang saja, user login lagi.
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

  const signInAsDemo = useCallback(async (email) => {
    const { token, user: me } = await devLogin(
      email || process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL || 'keluarga.demo@caretaker.id',
    );
    await saveToken(token);
    setUser(me);
    return me;
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, restoring, isGuest: user?.guest === true, signInAsGuest, signInAsDemo, signOut }),
    [user, restoring, signInAsGuest, signInAsDemo, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}
