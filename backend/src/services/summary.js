/**
 * Ringkasan harian/mingguan untuk keluarga (PLAN §2.3).
 * Angka-angkanya dihitung dari data, bukan dikarang LLM.
 */
import { many, one } from '../db/pool.js';

/** Hitung ulang ringkasan satu hari dan simpan (upsert) ke daily_summaries. */
export async function buildDailySummary(elderId, date = new Date()) {
  const day = date.toISOString().slice(0, 10);

  const meds = await one(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'confirmed') AS taken,
       COUNT(*) AS total
     FROM reminder_events
      WHERE elder_id = $1 AND type = 'medication' AND due_at::date = $2::date`,
    [elderId, day],
  );

  const mood = await one(
    `SELECT AVG(mood_score)::numeric(3,2) AS avg FROM checkins
      WHERE elder_id = $1 AND created_at::date = $2::date`,
    [elderId, day],
  );

  const convo = await one(
    `SELECT COUNT(*) AS count FROM conversations
      WHERE elder_id = $1 AND started_at::date = $2::date`,
    [elderId, day],
  );

  const missedList = await many(
    `SELECT title FROM reminder_events
      WHERE elder_id = $1 AND due_at::date = $2::date AND status IN ('missed', 'skipped')`,
    [elderId, day],
  );

  const highlights = missedList.length
    ? missedList.map((r) => `${r.title} terlewat`)
    : ['Semua jadwal hari ini terpenuhi'];

  const trend = await cognitiveTrend(elderId);

  const row = await one(
    `INSERT INTO daily_summaries
       (elder_id, summary_date, medication_taken, medication_total, mood_avg, conversation_count, cognitive_trend, highlights)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (elder_id, summary_date) DO UPDATE SET
       medication_taken = EXCLUDED.medication_taken,
       medication_total = EXCLUDED.medication_total,
       mood_avg = EXCLUDED.mood_avg,
       conversation_count = EXCLUDED.conversation_count,
       cognitive_trend = EXCLUDED.cognitive_trend,
       highlights = EXCLUDED.highlights
     RETURNING *`,
    [
      elderId,
      day,
      Number(meds.taken),
      Number(meds.total),
      mood.avg,
      Number(convo.count),
      trend,
      JSON.stringify(highlights),
    ],
  );

  return row;
}

/**
 * Tren kasar dari cognitive_signals: bandingkan rata-rata 7 hari terakhir
 * dengan 7 hari sebelumnya. Nilai signal makin tinggi = makin perlu perhatian.
 */
async function cognitiveTrend(elderId) {
  const r = await one(
    `SELECT
       AVG(value) FILTER (WHERE created_at >= now() - interval '7 days') AS recent,
       AVG(value) FILTER (WHERE created_at <  now() - interval '7 days'
                            AND created_at >= now() - interval '14 days') AS previous
     FROM cognitive_signals WHERE elder_id = $1`,
    [elderId],
  );

  const recent = r?.recent != null ? Number(r.recent) : null;
  const previous = r?.previous != null ? Number(r.previous) : null;
  if (recent == null) return 'data belum cukup';
  if (previous == null) return 'stabil';
  if (recent - previous >= 0.08) return 'perlu diperhatikan';
  if (previous - recent >= 0.08) return 'membaik';
  return 'stabil';
}

/** Agregat mingguan untuk kartu ringkasan di app keluarga. */
export async function weeklySummary(elderId) {
  const days = await many(
    `SELECT * FROM daily_summaries
      WHERE elder_id = $1 AND summary_date >= current_date - interval '7 days'
      ORDER BY summary_date ASC`,
    [elderId],
  );

  const totals = days.reduce(
    (acc, d) => ({
      taken: acc.taken + d.medication_taken,
      total: acc.total + d.medication_total,
      moodSum: acc.moodSum + (d.mood_avg ? Number(d.mood_avg) : 0),
      moodDays: acc.moodDays + (d.mood_avg ? 1 : 0),
      conversations: acc.conversations + d.conversation_count,
    }),
    { taken: 0, total: 0, moodSum: 0, moodDays: 0, conversations: 0 },
  );

  return {
    days,
    adherencePercent: totals.total ? Math.round((totals.taken / totals.total) * 100) : null,
    moodAverage: totals.moodDays ? Number((totals.moodSum / totals.moodDays).toFixed(2)) : null,
    conversationCount: totals.conversations,
    cognitiveTrend: days.at(-1)?.cognitive_trend ?? 'data belum cukup',
  };
}
