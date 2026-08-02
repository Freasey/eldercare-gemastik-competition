/**
 * Akun tamu model "coba dulu" seperti guest account di Roblox.
 *
 * Alurnya:
 *   1. Orang menekan "Coba sebagai tamu" → akun baru dibuat otomatis,
 *      lengkap dengan data demo miliknya sendiri (bukan berbagi satu akun,
 *      jadi tamu tidak bisa saling mengotori).
 *   2. Selama dipakai, `last_seen_at` disegarkan.
 *   3. Kalau tamunya login Google, baris user yang sama dipakai ulang 
 *      `is_guest` jadi false dan datanya ikut terbawa (lihat auth.routes.js).
 *   4. Kalau tidak pernah kembali, akun + seluruh datanya dihapus sweep
 *      setelah GUEST_RETENTION_DAYS hari.
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { many, one, query, transaction } from '../db/pool.js';
import { createDemoElder } from '../db/demoData.js';

/**
 * Batas lansia untuk akun tamu. Endpoint tamu terbuka di production, jadi
 * tanpa batas ini satu orang bisa menggelembungkan database lewat
 * POST /api/elders berkali-kali. Sekaligus jadi dorongan untuk login.
 */
export const GUEST_MAX_ELDERS = 1;

/**
 * Email sintetis. Kolom users.email itu UNIQUE NOT NULL, jadi tamu tetap
 * butuh nilai; domain .invalid dipakai supaya jelas ini bukan alamat nyata
 * dan tidak akan pernah bentrok dengan email Google asli (RFC 2606).
 */
function guestEmail() {
  return `guest-${crypto.randomBytes(8).toString('hex')}@guest.invalid`;
}

/**
 * Email sintetis untuk akun device lansia demo. Polanya sengaja sama persis
 * dengan yang dipakai pairing asli (services/pairing.js), supaya baris yang
 * lahir dari jalur tamu tidak berbeda bentuk dari yang lahir dari jalur QR.
 */
function elderDeviceEmail(elderId) {
  return `elder-${elderId}-${crypto.randomBytes(4).toString('hex')}@device.invalid`;
}

/**
 * Buat satu akun tamu beserta data demonya. Semuanya dalam satu transaksi:
 * kalau pembuatan data demo gagal, akunnya ikut batal tidak ada tamu
 * setengah jadi yang layarnya kosong.
 *
 * @returns {Promise<object>} baris `users` yang dibuat
 */
export async function createGuestAccount() {
  return transaction(async (c) => {
    const { rows: [user] } = await c.query(
      `INSERT INTO users (email, name, role, is_guest, last_seen_at)
       VALUES ($1, 'Guest', 'keluarga', true, now())
       RETURNING *`,
      [guestEmail()],
    );

    // Sengaja tanpa pairing_code: lansia demo langsung dianggap sudah ter-pair
    // (lihat akun device di bawah), jadi kode yang tidak akan pernah bisa
    // ditukar cuma jadi sampah di kolom yang UNIQUE.
    const elder = await createDemoElder(c, {
      caregiverUserId: user.id,
      relation: 'Anak kandung',
    });

    // Lansia demo punya akun device-nya sendiri, seperti kalau pairing-nya
    // sudah dilakukan kemarin-kemarin. Tanpa ini `elders.user_id` kosong dan
    // semua jalur yang membedakan "lansia sendiri yang bicara" dari "keluarga
    // yang mengisi" (checkins.source, assistant, ringkasan) tidak punya sisi
    // lansia sama sekali di akun demo.
    //
    // Dibuat setelah eldernya ada supaya id lansia bisa ikut masuk ke email
    // sintetisnya, sama seperti redeemPairingCode().
    const { rows: [elderUser] } = await c.query(
      `INSERT INTO users (email, name, role, last_seen_at)
       VALUES ($1, $2, 'lansia', now())
       RETURNING id`,
      [elderDeviceEmail(elder.id), elder.name],
    );

    await c.query('UPDATE elders SET user_id = $2 WHERE id = $1', [elder.id, elderUser.id]);

    return user;
  });
}

/** Berapa lansia yang sudah dipantau user ini. */
export async function countElders(userId) {
  const r = await one(
    'SELECT count(*)::int AS n FROM caregiver_links WHERE caregiver_user_id = $1',
    [userId],
  );
  return r?.n ?? 0;
}

/**
 * Segarkan `last_seen_at`. Di-throttle 1 jam supaya tidak menulis satu baris
 * per request yang dibutuhkan sweep cuma resolusi harian.
 *
 * Dipanggil untuk SEMUA user, bukan cuma tamu: `refreshTodaySummaries` ikut
 * memakai kolom ini untuk memutuskan lansia siapa yang masih perlu disegarkan.
 */
export async function touchLastSeen(userId) {
  await query(
    `UPDATE users SET last_seen_at = now()
      WHERE id = $1 AND last_seen_at < now() - interval '1 hour'`,
    [userId],
  );
}

/**
 * Hapus akun tamu yang sudah lama tidak dipakai.
 *
 * Penting: `elders.user_id` itu ON DELETE SET NULL, jadi menghapus user saja
 * akan meninggalkan baris lansia yatim. Lansia milik tamu karena itu dihapus
 * lebih dulu lewat caregiver_links sisanya (jadwal, reminder, percakapan,
 * ringkasan) ikut terbawa CASCADE dari elders.
 *
 * Arah yang sama juga berlaku sebaliknya: akun device lansia demo tidak ikut
 * terhapus saat eldernya hilang, jadi id-nya dipanen dulu lalu dihapus manual.
 */
export async function sweepExpiredGuests() {
  const days = env.guestRetentionDays;

  const expired = await many(
    `SELECT id FROM users
      WHERE is_guest = true
        AND last_seen_at < now() - ($1 || ' days')::interval`,
    [days],
  );
  if (!expired.length) return { guests: 0, elders: 0 };

  const ids = expired.map((r) => r.id);

  return transaction(async (c) => {
    // Hanya lansia yang benar-benar milik tamu ini: dilindungi NOT EXISTS
    // supaya lansia yang juga dipantau caregiver lain tidak ikut terhapus.
    const { rows: deletedElders } = await c.query(
      `DELETE FROM elders e
        WHERE EXISTS (
                SELECT 1 FROM caregiver_links cl
                 WHERE cl.elder_id = e.id AND cl.caregiver_user_id = ANY($1::bigint[])
              )
          AND NOT EXISTS (
                SELECT 1 FROM caregiver_links cl
                 WHERE cl.elder_id = e.id AND cl.caregiver_user_id <> ALL($1::bigint[])
              )
        RETURNING e.id, e.user_id`,
      [ids],
    );

    // Akun device lansianya. `is_guest`-nya false, sengaja: kalau ditandai
    // tamu, sweep akan menghapusnya begitu 7 hari tidak dipakai walaupun
    // keluarganya sudah naik jadi akun Google lansia tiba-tiba ter-unpair.
    // Jadi umurnya diikatkan ke eldernya, bukan ke last_seen_at-nya sendiri.
    const elderUserIds = deletedElders.map((r) => r.user_id).filter(Boolean);
    if (elderUserIds.length) {
      await c.query(
        `DELETE FROM users WHERE id = ANY($1::bigint[]) AND role = 'lansia'`,
        [elderUserIds],
      );
    }

    const { rows: deletedUsers } = await c.query(
      `DELETE FROM users WHERE id = ANY($1::bigint[]) AND is_guest = true RETURNING id`,
      [ids],
    );

    console.log(
      `[guest] sweep: ${deletedUsers.length} akun tamu + ${deletedElders.length} lansia dihapus (nganggur > ${days} hari)`,
    );
    return { guests: deletedUsers.length, elders: deletedElders.length };
  });
}
