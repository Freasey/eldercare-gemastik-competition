/**
 * Endpoint sisi lansia: one-button assistant (PLAN §2.2).
 * App RN memakai STT/TTS bawaan OS — jadi yang lewat sini teks, bukan audio.
 */
import { Router } from 'express';
import { z } from 'zod';
import { many, one } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { requireAuth, requireElderAccess } from '../middleware/auth.js';
import {
  buildContext,
  decideOpening,
  MAX_PROACTIVE_QUESTIONS,
} from '../services/contextEngine.js';
import { chat, interpretReminderReply, isGroqConfigured, summarizeConversation } from '../services/groq.js';

export const assistantRouter = Router({ mergeParams: true });
assistantRouter.use(requireAuth);

/**
 * GET /api/elders/:elderId/assistant/context
 * Intip apa yang akan diucapkan assistant tanpa membuka sesi. Dipakai juga
 * oleh app keluarga untuk menampilkan "yang sedang jadi prioritas".
 */
assistantRouter.get(
  '/context',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const context = await buildContext(req.elder.id);
    if (!context) throw ApiError.notFound('Lansia tidak ditemukan');

    res.json({
      opening: decideOpening(context),
      reminders: context.reminders,
      redFlags: context.redFlags,
      lastCheckin: context.lastCheckin,
      moodHoursAgo: Number.isFinite(context.moodHoursAgo)
        ? Math.round(context.moodHoursAgo)
        : null,
    });
  }),
);

/**
 * POST /api/elders/:elderId/assistant/sessions
 * Tombol ditekan → context-check → assistant bicara duluan sesuai prioritas.
 */
assistantRouter.post(
  '/sessions',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const { trigger } = z
      .object({ trigger: z.enum(['button', 'scheduled', 'wake_word', 'emergency']).optional() })
      .parse(req.body ?? {});

    const context = await buildContext(req.elder.id);
    if (!context) throw ApiError.notFound('Lansia tidak ditemukan');

    const opening = decideOpening(context);

    const conversation = await one(
      `INSERT INTO conversations (elder_id, trigger, opening_kind)
       VALUES ($1, COALESCE($2, 'button'), $3) RETURNING *`,
      [req.elder.id, trigger ?? null, opening.kind],
    );

    await one(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', $2) RETURNING id`,
      [conversation.id, opening.speech],
    );

    // Tandai reminder sudah dibacakan supaya tidak diulang di sesi berikutnya.
    if (opening.reminder) {
      await one(
        `UPDATE reminder_events SET status = 'spoken', spoken_at = now(), attempts = attempts + 1
          WHERE id = $1 AND status IN ('pending', 'snoozed') RETURNING id`,
        [opening.reminder.id],
      );
    }

    res.status(201).json({
      conversationId: conversation.id,
      speech: opening.speech,
      openingKind: opening.kind,
      expects: opening.expects,
      reminderId: opening.reminder?.id ?? null,
      proactiveQuestionsLeft: MAX_PROACTIVE_QUESTIONS - (opening.expects === 'free' ? 0 : 1),
    });
  }),
);

/**
 * POST /api/elders/:elderId/assistant/sessions/:conversationId/turns
 * Satu giliran bicara. Jawaban atas reminder ditangani rule-based dulu;
 * LLM hanya dipanggil untuk percakapan bebas.
 */
assistantRouter.post(
  '/sessions/:conversationId/turns',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const { text, reminderId, expects } = z
      .object({
        text: z.string().min(1).max(2000),
        reminderId: z.coerce.number().int().optional(),
        expects: z.enum(['confirmation', 'mood', 'free']).optional(),
      })
      .parse(req.body);

    const conversation = await one(
      'SELECT * FROM conversations WHERE id = $1 AND elder_id = $2',
      [req.params.conversationId, req.elder.id],
    );
    if (!conversation) throw ApiError.notFound('Sesi percakapan tidak ditemukan');
    if (conversation.ended_at) throw ApiError.conflict('Sesi sudah ditutup');

    await one(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'elder', $2) RETURNING id`,
      [conversation.id, text],
    );

    let reply = null;
    let handledBy = 'llm';

    // --- jalur 1: jawaban atas reminder (rule-based, tanpa LLM) ---
    if (expects === 'confirmation' && reminderId) {
      const intent = interpretReminderReply(text);
      handledBy = 'rule';

      if (intent === 'confirmed') {
        await respondToReminder(reminderId, req.elder.id, 'confirmed', text);
        reply = 'Bagus, terima kasih sudah memberi tahu. Saya catat ya.';
      } else if (intent === 'snoozed') {
        await respondToReminder(reminderId, req.elder.id, 'snoozed', text);
        reply = 'Baik, nanti saya ingatkan lagi lima belas menit lagi.';
      } else if (intent === 'skipped') {
        await respondToReminder(reminderId, req.elder.id, 'skipped', text);
        reply = 'Baik, saya catat belum diminum. Nanti saya kabari keluarga ya.';
      } else {
        reply = 'Maaf, saya kurang menangkap. Obatnya sudah diminum atau belum?';
      }
    }

    // --- jalur 2: jawaban mood (rule-based skor, tanpa LLM) ---
    if (!reply && expects === 'mood') {
      const score = scoreMood(text);
      handledBy = 'rule';
      await one(
        `INSERT INTO checkins (elder_id, mood_score, source, note) VALUES ($1, $2, 'assistant', $3) RETURNING id`,
        [req.elder.id, score, text.slice(0, 300)],
      );
      reply =
        score <= 2
          ? 'Terima kasih sudah cerita. Kalau tidak enak badan, boleh saya kabari keluarga?'
          : 'Syukurlah kalau begitu. Ada lagi yang ingin diceritakan?';
    }

    // --- jalur 3: percakapan bebas (baru di sini LLM dipanggil) ---
    if (!reply) {
      const history = await many(
        `SELECT role, content FROM messages WHERE conversation_id = $1
          ORDER BY created_at ASC LIMIT 20`,
        [conversation.id],
      );

      if (isGroqConfigured()) {
        reply = await chat(
          history.map((m) => ({
            role: m.role === 'elder' ? 'user' : 'assistant',
            content: m.content,
          })),
        );
      } else {
        handledBy = 'fallback';
        reply = 'Maaf, saya sedang tidak bisa menjawab. Coba lagi sebentar lagi ya.';
      }
    }

    await one(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', $2) RETURNING id`,
      [conversation.id, reply],
    );

    res.json({ speech: reply, handledBy });
  }),
);

/**
 * POST /api/elders/:elderId/assistant/sessions/:conversationId/end
 * Ditutup karena silence timeout, closing phrase, atau tombol ditekan lagi.
 */
assistantRouter.post(
  '/sessions/:conversationId/end',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const { reason } = z
      .object({ reason: z.enum(['silence', 'closing_phrase', 'button', 'error']).optional() })
      .parse(req.body ?? {});

    const messages = await many(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.conversationId],
    );

    let summary = null;
    if (messages.length >= 2 && isGroqConfigured()) {
      // Ringkasan dibuat sekali di akhir sesi, bukan tiap turn — hemat kuota.
      try {
        summary = await summarizeConversation(messages);
      } catch (err) {
        console.warn('[assistant] gagal meringkas:', err.message);
      }
    }

    const conversation = await one(
      `UPDATE conversations SET ended_at = now(), summary = COALESCE($3, summary)
        WHERE id = $1 AND elder_id = $2 RETURNING *`,
      [req.params.conversationId, req.elder.id, summary],
    );
    if (!conversation) throw ApiError.notFound('Sesi percakapan tidak ditemukan');

    res.json({ conversation, endedBecause: reason ?? 'button' });
  }),
);

async function respondToReminder(reminderId, elderId, status, note) {
  return one(
    `UPDATE reminder_events
        SET status = $3, responded_at = now(), response_note = $4, attempts = attempts + 1
      WHERE id = $1 AND elder_id = $2 RETURNING *`,
    [reminderId, elderId, status, note.slice(0, 500)],
  );
}

/**
 * Skor mood 1..5 dari kata kunci. Sengaja kasar dan rule-based: sinyalnya
 * dipakai sebagai tren, bukan angka presisi, dan harus jalan tanpa kuota LLM.
 */
function scoreMood(text) {
  const t = text.toLowerCase();
  if (/\b(sangat senang|senang sekali|bahagia|enak sekali|segar)\b/.test(t)) return 5;
  if (/\b(baik|sehat|senang|enak|lumayan|alhamdulillah)\b/.test(t)) return 4;
  if (/\b(biasa|begitu saja|ya gitu|standar)\b/.test(t)) return 3;
  if (/\b(capek|lelah|pegal|kurang tidur|pusing|malas)\b/.test(t)) return 2;
  if (/\b(sakit|sedih|kesepian|tidak enak badan|nyeri|susah tidur)\b/.test(t)) return 1;
  return 3;
}
