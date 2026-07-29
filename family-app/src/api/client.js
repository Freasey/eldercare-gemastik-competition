/**
 * Pembungkus fetch ke backend Express (lihat ../../backend/README.md).
 *
 * Alamat backend dibaca dari EXPO_PUBLIC_API_URL supaya pindah dari localhost
 * ke URL Back4app nanti cukup mengubah `.env` — tidak ada URL yang di-hardcode
 * di dalam kode layar.
 */
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'caretaker.session';

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

/**
 * @param {string} path contoh: `/api/elders`
 * @param {{method?: string, body?: object, auth?: boolean, signal?: AbortSignal}} [opts]
 */
export async function api(path, opts = {}) {
  const { method = 'GET', body, auth = true, signal } = opts;

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await loadToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    // Penyebab paling sering saat development: backend belum jalan, atau
    // EXPO_PUBLIC_API_URL masih menunjuk localhost padahal dibuka di HP fisik.
    if (err.name === 'AbortError') throw err;
    throw new ApiError(
      `Tidak bisa menghubungi server di ${API_URL}. Pastikan backend jalan dan alamat di .env benar.`,
      { status: 0, code: 'NETWORK' },
    );
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
