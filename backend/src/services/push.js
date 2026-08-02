/**
 * Push notification ke HP keluarga (PLAN §2.4 — langkah terakhir jalur darurat).
 *
 * Ada DUA transport, dan itu disengaja:
 *
 * 1. **FCM V1 langsung** lewat `firebase-admin`, memakai service account yang
 *    sudah kita punya. Ini jalur utama.
 * 2. **Expo Push Service** lewat `expo-server-sdk`, untuk token berbentuk
 *    `ExponentPushToken[...]`.
 *
 * Kenapa jalur Expo saja tidak cukup: Expo Push Service baru mau meneruskan ke
 * Android setelah service account FCM V1 diunggah ke project Expo lewat
 * `eas credentials` — langkah interaktif yang butuh akun Expo. Token FCM mentah
 * bisa diambil app tanpa akun Expo sama sekali (`getDevicePushTokenAsync`),
 * jadi jalur itu yang dijadikan default di
 * `family-app/src/notifications/push.js`. Jalur Expo tetap dipertahankan supaya
 * build yang terlanjur mendaftar dengan token Expo tidak ikut mati.
 *
 * Token dibedakan dari BENTUKNYA, bukan dari kolom database — makanya tabel
 * `devices` tidak perlu migrasi.
 */
import fs from 'node:fs';
import { Expo } from 'expo-server-sdk';
import admin from 'firebase-admin';
import { many, query } from '../db/pool.js';
import { env } from '../config/env.js';

const expo = new Expo();

/* ---------------- Firebase ---------------- */

let firebaseApp = null;
let firebaseError = null;

/** Baca service account dari env base64 (deploy) atau file di disk (lokal). */
function readServiceAccount() {
  if (env.firebaseServiceAccountB64) {
    return JSON.parse(Buffer.from(env.firebaseServiceAccountB64, 'base64').toString('utf8'));
  }
  if (env.firebaseServiceAccountPath && fs.existsSync(env.firebaseServiceAccountPath)) {
    return JSON.parse(fs.readFileSync(env.firebaseServiceAccountPath, 'utf8'));
  }
  return null;
}

/**
 * Inisialisasi sekali, malas (lazy). Kegagalan di sini TIDAK boleh menjatuhkan
 * server: kalau kredensial belum dipasang, alur darurat tetap harus jalan
 * sampai ke database dan LiveKit — cuma notifikasinya yang tidak terkirim.
 */
function firebase() {
  if (firebaseApp || firebaseError) return firebaseApp;

  try {
    const credentials = readServiceAccount();
    if (!credentials) {
      firebaseError = 'service account tidak ditemukan';
      console.warn('[push] FCM mati:', firebaseError);
      return null;
    }
    firebaseApp = admin.initializeApp({ credential: admin.credential.cert(credentials) });
    console.log('[push] FCM siap (project %s)', credentials.project_id);
  } catch (err) {
    firebaseError = err.message;
    console.error('[push] FCM gagal diinisialisasi:', err.message);
  }

  return firebaseApp;
}

export function isPushConfigured() {
  return Boolean(firebase());
}

/* ---------------- pengiriman ---------------- */

/** Ambil push token semua caregiver yang ter-link ke seorang lansia. */
export async function caregiverPushTokens(elderId) {
  const rows = await many(
    `SELECT d.expo_push_token
       FROM devices d
       JOIN caregiver_links cl ON cl.caregiver_user_id = d.user_id
      WHERE cl.elder_id = $1`,
    [elderId],
  );
  return rows.map((r) => r.expo_push_token);
}

/**
 * Token yang ditolak permanen dihapus, bukan dibiarkan.
 *
 * Kalau tidak, setiap kejadian darurat berikutnya ikut menyeret token mati itu
 * dan angka `sent` jadi menyesatkan — kelihatan seperti ada perangkat yang
 * dihubungi padahal tidak ada.
 */
async function buangTokenMati(tokens) {
  if (tokens.length === 0) return;
  await query('DELETE FROM devices WHERE expo_push_token = ANY($1::text[])', [tokens]);
  console.warn('[push] %d token tidak berlaku lagi, dihapus', tokens.length);
}

/**
 * @param {string[]} tokens
 * @param {{title: string, body: string, data?: object, critical?: boolean}} payload
 * @returns {Promise<{sent: number, failed: number}>}
 */
export async function sendPush(tokens, { title, body, data = {}, critical = false }) {
  const unik = [...new Set(tokens.filter(Boolean))];
  if (unik.length === 0) {
    console.warn('[push] tidak ada device terdaftar — notifikasi dilewati:', title);
    return { sent: 0, failed: 0 };
  }

  const expoTokens = unik.filter((t) => Expo.isExpoPushToken(t));
  const fcmTokens = unik.filter((t) => !Expo.isExpoPushToken(t));

  const hasil = await Promise.all([
    kirimLewatFcm(fcmTokens, { title, body, data, critical }),
    kirimLewatExpo(expoTokens, { title, body, data, critical }),
  ]);

  const mati = hasil.flatMap((h) => h.mati);
  await buangTokenMati(mati).catch((err) => console.error('[push] gagal bersih-bersih:', err.message));

  return {
    sent: hasil.reduce((n, h) => n + h.sent, 0),
    failed: hasil.reduce((n, h) => n + h.failed, 0),
  };
}

async function kirimLewatFcm(tokens, { title, body, data, critical }) {
  if (tokens.length === 0) return { sent: 0, failed: 0, mati: [] };

  const app = firebase();
  if (!app) return { sent: 0, failed: tokens.length, mati: [] };

  // FCM hanya menerima string di `data`. Id dari Postgres yang lewat sini tanpa
  // diubah akan sampai di app sebagai nilai yang tidak bisa dibaca.
  const dataString = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)]),
  );

  try {
    const res = await app.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: dataString,
      android: {
        priority: 'high',
        notification: {
          // Kanal ini dibuat app keluarga saat pertama jalan. Kanal `emergency`
          // sengaja MAX importance supaya tembus mode jangan-ganggu.
          channelId: critical ? 'emergency' : 'default',
          sound: 'default',
          ...(critical ? { visibility: 'public' } : {}),
        },
      },
    });

    const mati = [];
    res.responses.forEach((r, i) => {
      if (r.success) return;
      const kode = r.error?.code || '';
      if (kode.includes('registration-token-not-registered') || kode.includes('invalid-argument')) {
        mati.push(tokens[i]);
      } else {
        console.error('[push] FCM gagal untuk satu token:', kode || r.error?.message);
      }
    });

    return { sent: res.successCount, failed: res.failureCount, mati };
  } catch (err) {
    console.error('[push] FCM gagal mengirim batch:', err.message);
    return { sent: 0, failed: tokens.length, mati: [] };
  }
}

async function kirimLewatExpo(tokens, { title, body, data, critical }) {
  if (tokens.length === 0) return { sent: 0, failed: 0, mati: [] };

  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    priority: critical ? 'high' : 'default',
    channelId: critical ? 'emergency' : 'default',
    title,
    body,
    data,
  }));

  let sent = 0;
  let failed = 0;
  const mati = [];

  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((t, i) => {
        if (t.status === 'ok') {
          sent += 1;
          return;
        }
        failed += 1;
        if (t.details?.error === 'DeviceNotRegistered') mati.push(chunk[i].to);
        else console.error('[push] Expo menolak:', t.message);
      });
    } catch (err) {
      failed += chunk.length;
      console.error('[push] gagal mengirim chunk Expo:', err.message);
    }
  }

  return { sent, failed, mati };
}

export async function notifyCaregivers(elderId, payload) {
  const tokens = await caregiverPushTokens(elderId);
  return sendPush(tokens, payload);
}
