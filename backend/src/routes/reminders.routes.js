import { Router } from 'express';
import { z } from 'zod';
import { many } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { requireAuth, requireElderAccess } from '../middleware/auth.js';
import { respondToReminder } from '../services/reminders.js';

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
      // "Hari ini" harus hari menurut jam lansia. Tanpa AT TIME ZONE, jadwal
      // malam hari hilang dari daftar begitu server jalan di UTC.
      params.push(req.elder.timezone);
      const tz = `$${params.length}`;
      params.push(date ?? null);
      where += ` AND (due_at AT TIME ZONE ${tz})::date
                     = COALESCE($${params.length}::date, (now() AT TIME ZONE ${tz})::date)`;
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

    const { reminder, snoozedUntil } = await respondToReminder({
      reminderId: req.params.reminderId,
      elderId: req.elder.id,
      status,
      note,
    });

    if (!reminder) throw ApiError.notFound('Reminder tidak ditemukan');

    res.json({ reminder, snoozedUntil });
  }),
);

/** GET /api/elders/:elderId/reminders/adherence — data untuk grafik 14 hari */
remindersRouter.get(
  '/adherence',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    // Pengelompokan per hari mengikuti tanggal di tempat lansia — kalau tidak,
    // obat jam 9 malam WIB tercatat di hari berikutnya saat server UTC.
    const rows = await many(
      `SELECT (due_at AT TIME ZONE $2)::date AS date,
              COUNT(*) FILTER (WHERE status = 'confirmed') AS taken,
              COUNT(*) AS total
         FROM reminder_events
        WHERE elder_id = $1 AND type = 'medication'
          AND (due_at AT TIME ZONE $2)::date >= (now() AT TIME ZONE $2)::date - 13
          AND due_at < now()
        GROUP BY 1 ORDER BY 1 ASC`,
      [req.elder.id, req.elder.timezone],
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
