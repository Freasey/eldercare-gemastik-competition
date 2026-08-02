import { Router } from 'express';
import { z } from 'zod';
import { many, one } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { requireAuth, requireElderAccess } from '../middleware/auth.js';
import { materializeReminders } from '../services/scheduler.js';

export const schedulesRouter = Router({ mergeParams: true });
schedulesRouter.use(requireAuth);

const scheduleType = z.enum(['medication', 'meal', 'sleep', 'prayer', 'activity', 'checkup']);
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:MM');
const daysOfWeek = z.array(z.number().int().min(0).max(6)).min(1);

/** GET /api/elders/:elderId/schedules */
schedulesRouter.get(
  '/',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const schedules = await many(
      `SELECT s.*, m.name AS medication_name, m.dosage, m.instruction
         FROM schedules s
         LEFT JOIN medications m ON m.id = s.medication_id
        WHERE s.elder_id = $1 AND s.active = true
        ORDER BY s.time_of_day ASC`,
      [req.elder.id],
    );
    res.json({ schedules });
  }),
);

/**
 * POST /api/elders/:elderId/schedules
 * Kalau `medication` diisi, obat baru dibuat sekalian. Perubahan langsung
 * di-materialize jadi reminder_events supaya sync ke app lansia tanpa lansia
 * perlu melakukan apa pun (PLAN §2.3).
 */
schedulesRouter.post(
  '/',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        type: scheduleType,
        title: z.string().min(2),
        timeOfDay,
        daysOfWeek: daysOfWeek.optional(),
        isCritical: z.boolean().optional(),
        medicationId: z.number().int().optional(),
        medication: z
          .object({
            name: z.string().min(1),
            dosage: z.string().optional(),
            instruction: z.string().optional(),
          })
          .optional(),
      })
      .parse(req.body);

    let medicationId = body.medicationId ?? null;

    if (body.medication) {
      const med = await one(
        `INSERT INTO medications (elder_id, name, dosage, instruction)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.elder.id, body.medication.name, body.medication.dosage ?? null, body.medication.instruction ?? null],
      );
      medicationId = med.id;
    }

    if (body.type === 'medication' && !medicationId) {
      throw ApiError.badRequest('Jadwal obat butuh `medication` atau `medicationId`');
    }

    const schedule = await one(
      `INSERT INTO schedules (elder_id, medication_id, type, title, time_of_day, days_of_week, is_critical, created_by)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, '{0,1,2,3,4,5,6}'::smallint[]), COALESCE($7, false), $8)
       RETURNING *`,
      [
        req.elder.id,
        medicationId,
        body.type,
        body.title,
        body.timeOfDay,
        body.daysOfWeek ?? null,
        body.isCritical ?? null,
        req.user.id,
      ],
    );

    await materializeReminders();

    res.status(201).json({ schedule });
  }),
);

/** PATCH /api/elders/:elderId/schedules/:scheduleId */
schedulesRouter.patch(
  '/:scheduleId',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(2).optional(),
        timeOfDay: timeOfDay.optional(),
        daysOfWeek: daysOfWeek.optional(),
        isCritical: z.boolean().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);

    const schedule = await one(
      `UPDATE schedules SET
         title = COALESCE($3, title),
         time_of_day = COALESCE($4::time, time_of_day),
         days_of_week = COALESCE($5, days_of_week),
         is_critical = COALESCE($6, is_critical),
         active = COALESCE($7, active),
         updated_at = now()
       WHERE id = $1 AND elder_id = $2
       RETURNING *`,
      [
        req.params.scheduleId,
        req.elder.id,
        body.title ?? null,
        body.timeOfDay ?? null,
        body.daysOfWeek ?? null,
        body.isCritical ?? null,
        body.active ?? null,
      ],
    );

    if (!schedule) throw ApiError.notFound('Jadwal tidak ditemukan');

    // Buang event masa depan yang belum direspons supaya jam lama tidak
    // terlanjur dibacakan, lalu buat ulang dari aturan yang baru.
    await one(
      `DELETE FROM reminder_events
        WHERE schedule_id = $1 AND due_at > now() AND status = 'pending'
        RETURNING id`,
      [schedule.id],
    );
    await materializeReminders();

    res.json({ schedule });
  }),
);

/** DELETE /api/elders/:elderId/schedules/:scheduleId soft delete */
schedulesRouter.delete(
  '/:scheduleId',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const schedule = await one(
      `UPDATE schedules SET active = false, updated_at = now()
        WHERE id = $1 AND elder_id = $2 RETURNING *`,
      [req.params.scheduleId, req.elder.id],
    );
    if (!schedule) throw ApiError.notFound('Jadwal tidak ditemukan');

    await one(
      `DELETE FROM reminder_events
        WHERE schedule_id = $1 AND due_at > now() AND status = 'pending' RETURNING id`,
      [schedule.id],
    );

    res.json({ ok: true });
  }),
);
