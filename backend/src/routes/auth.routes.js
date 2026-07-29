import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { one } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyGoogleIdToken } from '../services/googleAuth.js';
import { signSession } from '../services/tokens.js';

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
    createdAt: u.created_at,
  };
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
    const user = await upsertUser({ ...profile, role });

    res.json({ token: signSession(user), user: publicUser(user) });
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
