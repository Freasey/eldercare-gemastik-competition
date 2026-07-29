/**
 * Expo Push Notifications. Butuh Firebase project (FCM V1) di sisi Expo —
 * lihat PLAN §4.2. Kalau belum siap, fungsi di sini tidak melempar error,
 * cuma mencatat log supaya alur darurat tetap jalan saat development.
 */
import { Expo } from 'expo-server-sdk';
import { many } from '../db/pool.js';

const expo = new Expo();

/** Ambil push token semua caregiver yang ter-link ke seorang lansia. */
export async function caregiverPushTokens(elderId) {
  const rows = await many(
    `SELECT d.expo_push_token
       FROM devices d
       JOIN caregiver_links cl ON cl.caregiver_user_id = d.user_id
      WHERE cl.elder_id = $1`,
    [elderId],
  );
  return rows.map((r) => r.expo_push_token).filter((t) => Expo.isExpoPushToken(t));
}

/**
 * @param {string[]} tokens
 * @param {{title: string, body: string, data?: object, critical?: boolean}} payload
 */
export async function sendPush(tokens, { title, body, data = {}, critical = false }) {
  if (tokens.length === 0) {
    console.warn('[push] tidak ada device terdaftar — notifikasi dilewati:', title);
    return { sent: 0, tickets: [] };
  }

  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    priority: critical ? 'high' : 'default',
    channelId: critical ? 'emergency' : 'default',
    title,
    body,
    data,
  }));

  const tickets = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
    } catch (err) {
      console.error('[push] gagal mengirim chunk:', err.message);
    }
  }

  return { sent: tickets.filter((t) => t.status === 'ok').length, tickets };
}

export async function notifyCaregivers(elderId, payload) {
  const tokens = await caregiverPushTokens(elderId);
  return sendPush(tokens, payload);
}
