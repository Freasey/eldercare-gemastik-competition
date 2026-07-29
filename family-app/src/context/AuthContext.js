/**
 * Sesi login keluarga.
 *
 * Untuk sekarang memakai `POST /api/auth/dev-login` (cukup email) karena
 * Google OAuth Android client ID belum ada — butuh SHA-1 dari keystore yang
 * baru muncul setelah build pertama. Begitu client ID itu ada, tinggal panggil
 * `loginWithGoogle(idToken)` yang sudah disiapkan di `api/caretaker.js`;
 * sisa aplikasi tidak perlu berubah karena keduanya menghasilkan JWT yang sama.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearToken, loadToken, saveToken } from '../api/client.js';
import { devLogin, fetchMe } from '../api/caretaker.js';

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
    () => ({ user, restoring, signInAsDemo, signOut }),
    [user, restoring, signInAsDemo, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}
