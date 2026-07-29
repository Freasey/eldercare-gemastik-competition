/**
 * Daftar lansia yang dipantau + siapa yang sedang dipilih.
 *
 * Semua layar membaca `elder` dari sini, jadi mengganti lansia lewat chip di
 * app bar cukup mengubah satu state dan seluruh tab ikut menyesuaikan.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchElders } from '../api/caretaker.js';

const ElderContext = createContext(null);

export function ElderProvider({ children }) {
  const [elders, setElders] = useState([]);
  const [elderId, setElderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { elders: list } = await fetchElders();
      setElders(list);
      // Pertahankan pilihan lama kalau lansianya masih ada.
      setElderId((prev) => (list.some((e) => e.id === prev) ? prev : list[0]?.id ?? null));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const elder = useMemo(() => elders.find((e) => e.id === elderId) ?? null, [elders, elderId]);

  const value = useMemo(
    () => ({ elders, elder, elderId, setElderId, loading, error, reload: load }),
    [elders, elder, elderId, loading, error, load],
  );

  return <ElderContext.Provider value={value}>{children}</ElderContext.Provider>;
}

export function useElders() {
  const ctx = useContext(ElderContext);
  if (!ctx) throw new Error('useElders harus dipakai di dalam <ElderProvider>');
  return ctx;
}
