/**
 * Pemicu scheduler dari luar.
 *
 * Ada karena serverless tidak punya proses yang hidup terus: `setInterval` di
 * dalam fungsi mati begitu response terkirim. Tanpa endpoint ini, materialisasi
 * reminder dan — yang paling penting — `sweepMissedReminders()` tidak pernah
 * jalan, sehingga keluarga tidak pernah diberi tahu saat lansia melewatkan
 * jadwal kritis.
 *
 * Pemicunya cron eksternal (lihat `.github/workflows/cron-tick.yml`), bukan
 * Vercel Cron, karena di plan Hobby Vercel Cron hanya bisa sekali sehari.
 */
import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { runSchedulerTick } from '../services/scheduler.js';

export const cronRouter = Router();

/**
 * Bandingkan tanpa membocorkan lewat lama pembandingan.
 *
 * Di-hash dulu supaya kedua sisi selalu 32 byte: `timingSafeEqual` melempar
 * kalau panjangnya beda, dan menjaganya tetap sama panjang dengan padding
 * manual justru membocorkan panjang secret aslinya.
 */
function secretCocok(diberikan, seharusnya) {
  const sha = (s) => createHash('sha256').update(String(s)).digest();
  return timingSafeEqual(sha(diberikan), sha(seharusnya));
}

/**
 * POST /api/cron/tick
 * Header: `Authorization: Bearer <CRON_SECRET>`
 *
 * Idempoten: semua pekerjaan di dalamnya aman diulang (materialisasi dijaga
 * `UNIQUE (schedule_id, due_at)`, sweep hanya menyentuh baris yang memang sudah
 * lewat waktu). Jadi cron yang menembak dobel tidak merusak apa pun.
 */
cronRouter.post(
  '/tick',
  asyncHandler(async (req, res) => {
    // Tanpa secret, endpoint ini mati — bukan terbuka. Backend yang ter-deploy
    // tanpa CRON_SECRET lebih baik kelihatan rusak daripada diam-diam
    // membiarkan siapa pun menjalankan sweep.
    if (!env.cronSecret) {
      throw new ApiError(503, 'CRON_SECRET belum dipasang di server', 'CRON_NOT_CONFIGURED');
    }

    const header = req.get('authorization') || '';
    const diberikan = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!diberikan || !secretCocok(diberikan, env.cronSecret)) {
      throw ApiError.unauthorized('Secret cron tidak cocok', 'CRON_UNAUTHORIZED');
    }

    const mulai = Date.now();
    const hasil = await runSchedulerTick();

    res.json({ ok: true, durasiMs: Date.now() - mulai, ...hasil });
  }),
);
