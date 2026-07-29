import { Router } from 'express';
import { z } from 'zod';
import { many, one } from '../db/pool.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth, requireElderAccess } from '../middleware/auth.js';
import { buildDailySummary, weeklySummary } from '../services/summary.js';

export const summariesRouter = Router({ mergeParams: true });
summariesRouter.use(requireAuth);

/** GET /api/elders/:elderId/summaries/today */
summariesRouter.get(
  '/today',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    res.json({ summary: await buildDailySummary(req.elder.id) });
  }),
);

/** GET /api/elders/:elderId/summaries/week */
summariesRouter.get(
  '/week',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    res.json({ week: await weeklySummary(req.elder.id) });
  }),
);

/** GET /api/elders/:elderId/summaries?limit=14 */
summariesRouter.get(
  '/',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(90).optional() }).parse(req.query);

    const summaries = await many(
      `SELECT * FROM daily_summaries WHERE elder_id = $1
        ORDER BY summary_date DESC LIMIT $2`,
      [req.elder.id, limit ?? 14],
    );

    res.json({ summaries });
  }),
);

export const timelineRouter = Router({ mergeParams: true });
timelineRouter.use(requireAuth);

/**
 * GET /api/elders/:elderId/timeline
 * Gabungan reminder, check-in, percakapan, dan kejadian darurat — inilah
 * yang dirender jadi feed di app keluarga.
 */
timelineRouter.get(
  '/timeline',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(30).optional() }).parse(req.query);
    const window = days ?? 3;

    const [reminders, checkins, conversations, emergencies] = await Promise.all([
      many(
        `SELECT id, title, type, status, due_at AS at, is_critical FROM reminder_events
          WHERE elder_id = $1 AND due_at >= now() - ($2 || ' days')::interval`,
        [req.elder.id, window],
      ),
      many(
        `SELECT id, mood_score, energy_score, note, created_at AS at FROM checkins
          WHERE elder_id = $1 AND created_at >= now() - ($2 || ' days')::interval`,
        [req.elder.id, window],
      ),
      many(
        `SELECT id, trigger, opening_kind, summary, started_at AS at FROM conversations
          WHERE elder_id = $1 AND started_at >= now() - ($2 || ' days')::interval`,
        [req.elder.id, window],
      ),
      many(
        `SELECT id, trigger_type, status, detail, created_at AS at FROM emergency_events
          WHERE elder_id = $1 AND created_at >= now() - ($2 || ' days')::interval`,
        [req.elder.id, window],
      ),
    ]);

    const items = [
      ...reminders.map((r) => ({ kind: 'reminder', ...r })),
      ...checkins.map((c) => ({ kind: 'checkin', ...c })),
      ...conversations.map((c) => ({ kind: 'conversation', ...c })),
      ...emergencies.map((e) => ({ kind: 'emergency', ...e })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at));

    res.json({ items });
  }),
);

/** GET /api/elders/:elderId/conversations/:conversationId — transkrip penuh */
timelineRouter.get(
  '/conversations/:conversationId',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const consent = await one(
      `SELECT granted FROM consents WHERE elder_id = $1 AND key = 'share_conversation_transcript'`,
      [req.elder.id],
    );

    const conversation = await one(
      'SELECT * FROM conversations WHERE id = $1 AND elder_id = $2',
      [req.params.conversationId, req.elder.id],
    );

    // Kalau lansia belum mengizinkan berbagi transkrip, keluarga hanya
    // dapat ringkasannya (PLAN §2.5).
    const isElderSelf = req.elder.user_id === req.user.id;
    if (!isElderSelf && !consent?.granted) {
      return res.json({
        conversation,
        messages: [],
        transcriptWithheld: true,
        reason: 'Lansia belum mengizinkan transkrip percakapan dibagikan',
      });
    }

    const messages = await many(
      'SELECT role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.conversationId],
    );

    res.json({ conversation, messages, transcriptWithheld: false });
  }),
);
