/**
 * Pairing device lansia (PLAN §2.6).
 *
 * HP lansia tidak punya akun Google dan tidak boleh punya layar login jadi
 * kode pairing yang ditampilkan app keluarga sekaligus jadi kredensial masuk.
 * Karena itu kode di sini diperlakukan seperti password sekali pakai:
 * berlaku singkat, dibuat tepat sebelum dipakai, dan hangus begitu ditukar.
 */
import crypto from 'node:crypto';
import { one, transaction } from '../db/pool.js';

/** Umur kode pairing. Cukup untuk memindai QR, tidak cukup untuk menganggur. */
export const PAIRING_CODE_TTL_MINUTES = 15;

/**
 * Alfabet tanpa huruf/angka yang mudah tertukar saat dibacakan lewat telepon
 * (tanpa I, O, 0, 1) kode ini sering didiktekan ke anggota keluarga lain.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePairingCode(length = 6) {
  return Array.from(crypto.randomBytes(length))
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join('');
}

/**
 * Terbitkan kode baru untuk seorang lansia. Kode lama otomatis tidak berlaku
 * karena kolomnya ditimpa.
 */
export async function issuePairingCode(elderId) {
  const elder = await one(
    `UPDATE elders
        SET pairing_code = $2,
            pairing_code_expires_at = now() + ($3 || ' minutes')::interval
      WHERE id = $1
      RETURNING id, name, pairing_code, pairing_code_expires_at`,
    [elderId, generatePairingCode(), PAIRING_CODE_TTL_MINUTES],
  );

  return elder;
}

/**
 * Tukar kode jadi akun device lansia.
 *
 * Akun `users` dibuat otomatis dengan email sintetis pola yang sama dipakai
 * akun tamu (lihat services/guest.js): kolomnya UNIQUE NOT NULL, dan domain
 * .invalid dijamin tidak akan pernah bentrok dengan email Google asli
 * (RFC 2606). Lansia tidak pernah melihat atau mengetik alamat ini.
 *
 * @returns {Promise<{user: object, elder: object} | {error: string}>}
 */
export async function redeemPairingCode(code) {
  const normalized = String(code).trim().toUpperCase().replace(/\s+/g, '');

  const elder = await one(
    'SELECT * FROM elders WHERE pairing_code = $1',
    [normalized],
  );
  if (!elder) return { error: 'NOT_FOUND' };

  // NULL = kode lama yang tidak pernah punya masa berlaku. Diperlakukan
  // kedaluwarsa supaya tidak ada kunci masuk yang menganggur selamanya.
  if (!elder.pairing_code_expires_at || new Date(elder.pairing_code_expires_at) < new Date()) {
    return { error: 'EXPIRED' };
  }

  if (elder.user_id) return { error: 'ALREADY_PAIRED' };

  return transaction(async (c) => {
    const { rows: [user] } = await c.query(
      `INSERT INTO users (email, name, role, last_seen_at)
       VALUES ($1, $2, 'lansia', now())
       RETURNING *`,
      [`elder-${elder.id}-${crypto.randomBytes(4).toString('hex')}@device.invalid`, elder.name],
    );

    // Kode dihanguskan di transaksi yang sama: sekali tukar, tidak bisa
    // dipakai device kedua.
    const { rows: [paired] } = await c.query(
      `UPDATE elders
          SET user_id = $2, paired_at = now(),
              pairing_code = NULL, pairing_code_expires_at = NULL
        WHERE id = $1
        RETURNING *`,
      [elder.id, user.id],
    );

    return { user, elder: paired };
  });
}

/**
 * Putuskan perangkat. Tidak perlu mekanisme revoke token: begitu `user_id`
 * kosong, JWT device lama tetap sah sebagai user tapi `requireElderAccess`
 * menolaknya app lansia otomatis kembali ke keadaan belum ter-pair.
 */
export async function unpairElder(elderId) {
  return one(
    `UPDATE elders
        SET user_id = NULL, paired_at = NULL
      WHERE id = $1
      RETURNING id, name, paired_at`,
    [elderId],
  );
}
