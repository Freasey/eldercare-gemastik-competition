import { Router } from 'express';
import { z } from 'zod';
import { many, one } from '../db/pool.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth, requireElderAccess } from '../middleware/auth.js';

export const checkinsRouter = Router({ mergeParams: true });
checkinsRouter.use(requireAuth);

/** GET /api/elders/:elderId/checkins?days=14 */
checkinsRouter.get(
  '/',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(90).optional() }).parse(req.query);

    const checkins = await many(
      `SELECT * FROM checkins
        WHERE elder_id = $1 AND created_at >= now() - ($2 || ' days')::interval
        ORDER BY created_at ASC`,
      [req.elder.id, days ?? 14],
    );

    res.json({ checkins });
  }),
);

/** POST /api/elders/:elderId/checkins dari sisi lansia atau dicatat keluarga */
checkinsRouter.post(
  '/',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        moodScore: z.number().int().min(1).max(5),
        energyScore: z.number().int().min(1).max(5).optional(),
        note: z.string().max(500).optional(),
      })
      .parse(req.body);

    const source = req.elder.user_id === req.user.id ? 'assistant' : 'caregiver';

    const checkin = await one(
      `INSERT INTO checkins (elder_id, mood_score, energy_score, source, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.elder.id, body.moodScore, body.energyScore ?? null, source, body.note ?? null],
    );

    res.status(201).json({ checkin });
  }),
);
