import { Router } from 'express';
import { z } from 'zod';
import { many, one } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { requireAuth, requireElderAccess } from '../middleware/auth.js';

export const remindersRouter = Router({ mergeParams: true });
remindersRouter.use(requireAuth);

/**
 * GET /api/elders/:elderId/reminders?date=YYYY-MM-DD&status=...
 * Default: hari ini.
 */
remindersRouter.get(
  '/',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const { date, status, days } = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        status: z.string().optional(),
        days: z.coerce.number().int().min(1).max(31).optional(),
      })
      .parse(req.query);

    const params = [req.elder.id];
    let where = 'elder_id = $1';

    if (days) {
      params.push(days);
      where += ` AND due_at >= now() - ($${params.length} || ' days')::interval`;
    } else {
      params.push(date ?? new Date().toISOString().slice(0, 10));
      where += ` AND due_at::date = $${params.length}::date`;
    }

    if (status) {
      params.push(status.split(','));
      where += ` AND status = ANY($${params.length})`;
    }

    const reminders = await many(
      `SELECT * FROM reminder_events WHERE ${where} ORDER BY due_at ASC`,
      params,
    );

    res.json({ reminders });
  }),
);

/**
 * POST /api/elders/:elderId/reminders/:reminderId/respond
 * Body: { status: confirmed|snoozed|skipped, note? }
 * Dipanggil dari sisi lansia (hasil percakapan) maupun keluarga
 * (menandai manual dari app keluarga).
 */
remindersRouter.post(
  '/:reminderId/respond',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const { status, note } = z
      .object({
        status: z.enum(['confirmed', 'snoozed', 'skipped']),
        note: z.string().max(500).optional(),
      })
      .parse(req.body);

    const reminder = await one(
      `UPDATE reminder_events
          SET status = $3,
              responded_at = now(),
              response_note = COALESCE($4, response_note),
              attempts = attempts + 1
        WHERE id = $1 AND elder_id = $2
        RETURNING *`,
      [req.params.reminderId, req.elder.id, status, note ?? null],
    );

    if (!reminder) throw ApiError.notFound('Reminder tidak ditemukan');

    // Snooze = geser 15 menit, tapi jangan bikin event baru kalau sudah
    // terlalu sering ditunda (batas 3x) supaya tidak jadi loop tak berujung.
    if (status === 'snoozed' && reminder.attempts <= 3) {
      await one(
        `INSERT INTO reminder_events (elder_id, schedule_id, title, type, is_critical, due_at, status)
         VALUES ($1, $2, $3, $4, $5, now() + interval '15 minutes', 'pending')
         ON CONFLICT (schedule_id, due_at) DO NOTHING RETURNING id`,
        [reminder.elder_id, reminder.schedule_id, reminder.title, reminder.type, reminder.is_critical],
      );
    }

    res.json({ reminder });
  }),
);

/** GET /api/elders/:elderId/reminders/adherence — data untuk grafik 14 hari */
remindersRouter.get(
  '/adherence',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT due_at::date AS date,
              COUNT(*) FILTER (WHERE status = 'confirmed') AS taken,
              COUNT(*) AS total
         FROM reminder_events
        WHERE elder_id = $1 AND type = 'medication'
          AND due_at >= current_date - interval '13 days'
          AND due_at < now()
        GROUP BY 1 ORDER BY 1 ASC`,
      [req.elder.id],
    );

    res.json({
      days: rows.map((r) => ({
        date: r.date,
        taken: Number(r.taken),
        total: Number(r.total),
        percent: Number(r.total) ? Math.round((Number(r.taken) / Number(r.total)) * 100) : null,
      })),
    });
  }),
);
