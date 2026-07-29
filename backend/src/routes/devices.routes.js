import { Router } from 'express';
import { z } from 'zod';
import { many, one } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPush } from '../services/push.js';
import { env } from '../config/env.js';

export const devicesRouter = Router();
devicesRouter.use(requireAuth);

/**
 * POST /api/devices
 * App mendaftarkan Expo push token-nya setelah user memberi izin notifikasi.
 */
devicesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { expoPushToken, platform } = z
      .object({
        expoPushToken: z.string().min(10),
        platform: z.enum(['android', 'ios', 'web']).optional(),
      })
      .parse(req.body);

    const device = await one(
      `INSERT INTO devices (user_id, expo_push_token, platform) VALUES ($1, $2, $3)
       ON CONFLICT (expo_push_token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform
       RETURNING *`,
      [req.user.id, expoPushToken, platform ?? null],
    );

    res.status(201).json({ device });
  }),
);

/** DELETE /api/devices/:token — dipanggil saat logout */
devicesRouter.delete(
  '/:token',
  asyncHandler(async (req, res) => {
    await one('DELETE FROM devices WHERE expo_push_token = $1 AND user_id = $2 RETURNING id', [
      req.params.token,
      req.user.id,
    ]);
    res.json({ ok: true });
  }),
);

/** POST /api/devices/test — kirim notifikasi uji ke device sendiri (dev only) */
devicesRouter.post(
  '/test',
  asyncHandler(async (req, res) => {
    if (env.isProd) throw ApiError.forbidden('Endpoint uji dimatikan di production');

    const rows = await many('SELECT expo_push_token FROM devices WHERE user_id = $1', [req.user.id]);
    const result = await sendPush(
      rows.map((r) => r.expo_push_token),
      { title: 'AI Caretaker', body: 'Notifikasi uji coba berhasil.', data: { type: 'test' } },
    );

    res.json(result);
  }),
);
