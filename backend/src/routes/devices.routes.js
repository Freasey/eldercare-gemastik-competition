import { Router } from 'express';
import { z } from 'zod';
import { many, one } from '../db/pool.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { byUserOrIp, rateLimit } from '../middleware/rateLimit.js';
import { isPushConfigured, sendPush } from '../services/push.js';

export const devicesRouter = Router();
devicesRouter.use(requireAuth);

/**
 * POST /api/devices
 * App mendaftarkan push token-nya setelah user memberi izin notifikasi.
 *
 * Isinya boleh token FCM mentah maupun `ExponentPushToken[...]`; `services/
 * push.js` yang memilih transport dari bentuknya. Nama kolomnya tetap
 * `expo_push_token` karena tabelnya sudah dipakai bentuk isinya yang melebar,
 * bukan artinya.
 */
devicesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { expoPushToken, platform } = z
      .object({
        expoPushToken: z.string().min(10).max(500),
        platform: z.enum(['android', 'ios', 'web']).optional(),
      })
      .parse(req.body);

    const device = await one(
      `INSERT INTO devices (user_id, expo_push_token, platform) VALUES ($1, $2, $3)
       ON CONFLICT (expo_push_token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform
       RETURNING *`,
      [req.user.id, expoPushToken, platform ?? null],
    );

    res.status(201).json({ device, pushConfigured: isPushConfigured() });
  }),
);

/** DELETE /api/devices/:token dipanggil saat logout */
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

/**
 * POST /api/devices/test kirim notifikasi uji ke device milik sendiri.
 *
 * Sengaja hidup juga di production, tidak seperti sebelumnya: notifikasi darurat
 * baru terbukti sampai setelah dicoba di HP sungguhan lewat backend sungguhan,
 * dan tanpa endpoint ini satu-satunya cara mengujinya adalah memicu kejadian
 * darurat palsu. Tidak bisa disalahgunakan untuk mengganggu orang lain yang
 * dikirimi hanya device milik pemanggil sendiri dan tetap dibatasi lajunya.
 */
devicesRouter.post(
  '/test',
  rateLimit({
    name: 'devices:test',
    windowMs: 60_000,
    max: 5,
    key: byUserOrIp,
    message: 'Terlalu sering menguji notifikasi. Tunggu sebentar.',
  }),
  asyncHandler(async (req, res) => {
    const rows = await many('SELECT expo_push_token FROM devices WHERE user_id = $1', [req.user.id]);
    const result = await sendPush(
      rows.map((r) => r.expo_push_token),
      { title: 'AI Caretaker', body: 'Notifikasi uji coba berhasil.', data: { type: 'test' } },
    );

    res.json({ ...result, devices: rows.length, pushConfigured: isPushConfigured() });
  }),
);
