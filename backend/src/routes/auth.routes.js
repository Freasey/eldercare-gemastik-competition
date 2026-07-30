import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { one } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { verifyGoogleIdToken } from '../services/googleAuth.js';
import { createGuestAccount } from '../services/guest.js';
import { signSession, verifySession } from '../services/tokens.js';

export const authRouter = Router();

const roleSchema = z.enum(['lansia', 'keluarga']);

/** Cari user by google_id/email, atau buat baru. */
async function upsertUser({ googleId, email, name, avatarUrl, role }) {
  const existing = await one(
    'SELECT * FROM users WHERE google_id = $1 OR email = $2 LIMIT 1',
    [googleId, email],
  );

  if (existing) {
    return one(
      `UPDATE users
          SET google_id = COALESCE(google_id, $2),
              name = $3,
              avatar_url = COALESCE($4, avatar_url)
        WHERE id = $1
        RETURNING *`,
      [existing.id, googleId, name, avatarUrl],
    );
  }

  return one(
    `INSERT INTO users (google_id, email, name, avatar_url, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [googleId, email, name, avatarUrl, role || 'keluarga'],
  );
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatar_url,
    role: u.role,
    guest: u.is_guest === true,
    createdAt: u.created_at,
  };
}

/**
 * Baca sesi tamu dari header Authorization, kalau ada dan masih valid.
 * Tidak melempar: request tanpa header (atau dengan token kedaluwarsa) cuma
 * berarti "tidak sedang mengklaim akun tamu", bukan error.
 */
async function guestFromRequest(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;

  try {
    const payload = verifySession(header.slice(7).trim());
    if (!payload.guest) return null;
    const user = await one('SELECT * FROM users WHERE id = $1', [payload.sub]);
    return user?.is_guest ? user : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/auth/google
 * Body: { idToken, role? }
 * App RN mengirim Google ID token; backend memverifikasi lalu menerbitkan
 * JWT session sendiri (PLAN §4.1).
 */
authRouter.post(
  '/google',
  asyncHandler(async (req, res) => {
    const { idToken, role } = z
      .object({ idToken: z.string().min(20), role: roleSchema.optional() })
      .parse(req.body);

    const profile = await verifyGoogleIdToken(idToken);

    // Kalau request datang membawa sesi tamu, akun tamu itu yang "dinaikkan"
    // jadi akun asli — bukan bikin user baru — supaya semua yang sudah
    // dikerjakan tamu (lansia, jadwal, riwayat) ikut terbawa.
    const guest = await guestFromRequest(req);
    if (guest) {
      const bentrok = await one(
        'SELECT id FROM users WHERE (google_id = $1 OR email = $2) AND id <> $3 LIMIT 1',
        [profile.googleId, profile.email, guest.id],
      );

      if (!bentrok) {
        const upgraded = await one(
          `UPDATE users
              SET google_id = $2, email = $3, name = $4,
                  avatar_url = COALESCE($5, avatar_url),
                  is_guest = false, last_seen_at = now()
            WHERE id = $1
            RETURNING *`,
          [guest.id, profile.googleId, profile.email, profile.name, profile.avatarUrl],
        );

        return res.json({
          token: signSession(upgraded),
          user: publicUser(upgraded),
          upgradedFromGuest: true,
        });
      }
      // Google-nya sudah punya akun sendiri. Masuk ke akun itu; data tamu
      // dibiarkan kedaluwarsa sendiri daripada dihapus diam-diam.
    }

    const user = await upsertUser({ ...profile, role });

    res.json({
      token: signSession(user),
      user: publicUser(user),
      upgradedFromGuest: false,
      guestDataAbandoned: Boolean(guest),
    });
  }),
);

/**
 * POST /api/auth/guest
 *
 * Fitur produk, bukan jalan pintas development — selalu hidup, termasuk di
 * production. Tiap panggilan membuat akun tamu BARU beserta data demonya
 * sendiri, jadi tamu tidak saling mengotori. Akun yang tidak dipakai lagi
 * dihapus sweep setelah GUEST_RETENTION_DAYS hari.
 *
 * Tamu bisa "naik kelas" jadi akun asli lewat POST /api/auth/google sambil
 * membawa token tamunya — datanya ikut terbawa.
 *
 * Limit-nya ketat karena satu panggilan menulis ~80 baris.
 */
authRouter.post(
  '/guest',
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: 'Terlalu banyak akun tamu dibuat dari jaringan ini. Coba lagi sebentar lagi.',
  }),
  asyncHandler(async (req, res) => {
    const user = await createGuestAccount();

    res.status(201).json({
      token: signSession(user, { guest: true, expiresIn: env.guestJwtExpiresIn }),
      user: publicUser(user),
      expiresAfterDays: env.guestRetentionDays,
    });
  }),
);

/**
 * POST /api/auth/dev-login
 * Jalan pintas untuk development & demo mockup HTML — tidak aktif di production
 * (butuh ALLOW_DEV_LOGIN=true dan NODE_ENV != production).
 */
authRouter.post(
  '/dev-login',
  asyncHandler(async (req, res) => {
    if (!env.allowDevLogin) throw ApiError.forbidden('dev-login dimatikan di environment ini');

    const { email, name, role } = z
      .object({
        email: z.string().email(),
        name: z.string().min(1).optional(),
        role: roleSchema.optional(),
      })
      .parse(req.body);

    let user = await one('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      user = await one(
        `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING *`,
        [email, name || email.split('@')[0], role || 'keluarga'],
      );
    }

    res.json({ token: signSession(user), user: publicUser(user) });
  }),
);

/** GET /api/auth/me */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  }),
);
