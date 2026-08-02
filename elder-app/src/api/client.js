/**
 * Pembungkus fetch ke backend Express (lihat ../../../backend/README.md).
 *
 * Sama polanya dengan `family-app/src/api/client.js`, dengan dua perbedaan
 * yang penting untuk sisi lansia:
 *
 * 1. Sesi di sini berumur sangat panjang (10 tahun, lihat PLAN §2.6) karena
 *    tidak ada siapa pun di HP lansia yang bisa login ulang. Token karenanya
 *    disimpan permanen di SecureStore, tidak pernah dihapus otomatis.
 * 2. Kegagalan jaringan tidak boleh berakhir jadi layar error app harus
 *    tetap bisa bicara secara offline. Karena itu error jaringan diberi kode
 *    `NETWORK` supaya pemanggil bisa membedakannya dari penolakan backend.
 */
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'caretaker.elder.session';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:4000').replace(/\/$/, '');

let sessionToken = null;

export async function loadToken() {
  if (sessionToken) return sessionToken;
  sessionToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return sessionToken;
}

export async function saveToken(token) {
  sessionToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/** Dipakai saat backend menolak token (perangkat diputuskan keluarga). */
export async function clearToken() {
  sessionToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Error yang membawa status HTTP + kode dari backend (`middleware/errors.js`). */
export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Benar kalau permintaan gagal sebelum sempat sampai ke backend. */
export const isOffline = (err) => err instanceof ApiError && err.code === 'NETWORK';

/**
 * Benar kalau backend menyatakan perangkat ini sudah tidak berhak token
 * dicabut, atau keluarga menekan "putuskan perangkat" (`requireElderAccess`
 * menolak begitu `elders.user_id` dikosongkan).
 */
export const isRevoked = (err) => err instanceof ApiError && (err.status === 401 || err.status === 403);

/**
 * @param {string} path contoh: `/api/elders/1/assistant/sessions`
 * @param {{method?: string, body?: object, auth?: boolean, timeoutMs?: number}} [opts]
 */
export async function api(path, opts = {}) {
  const { method = 'GET', body, auth = true, timeoutMs = 20000 } = opts;

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await loadToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // Tanpa batas waktu, jaringan yang menggantung membuat app diam berkepanjangan
  // pada app tanpa layar, diam tidak bisa dibedakan dari rusak.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(`Tidak bisa menghubungi server di ${API_URL}.`, { status: 0, code: 'NETWORK' });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  const data = text ? safeParse(text) : null;

  if (!res.ok) {
    throw new ApiError(data?.error?.message || `Permintaan gagal (${res.status})`, {
      status: res.status,
      code: data?.error?.code,
    });
  }

  return data;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
