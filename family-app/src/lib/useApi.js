/**
 * Pemanggil endpoint sekali pakai dengan status muat/gagal + tarik-untuk-muat-ulang.
 *
 * Sengaja tidak memakai react-query: layar di app ini sedikit dan pola
 * ambil-datanya seragam, jadi satu hook kecil lebih ringan dan tidak menambah
 * dependency untuk HP kelas bawah.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @param {() => Promise<any>} run pemanggil API; harus stabil (bungkus useCallback)
 * @param {{enabled?: boolean}} [opts]
 */
export function useApi(run, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);

  // Nomor urut permintaan: hasil dari permintaan lama diabaikan kalau sudah
  // ada permintaan yang lebih baru (misal user cepat berpindah lansia).
  const seq = useRef(0);

  const load = useCallback(
    async (mode = 'initial') => {
      if (!enabled) return;
      const id = ++seq.current;

      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const result = await run();
        if (id === seq.current) setData(result);
      } catch (err) {
        if (id === seq.current) setError(err.message);
      } finally {
        if (id === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [run, enabled],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    load('initial');
  }, [load, enabled]);

  const refresh = useCallback(() => load('refresh'), [load]);

  return { data, error, loading, refreshing, refresh, reload: load };
}
