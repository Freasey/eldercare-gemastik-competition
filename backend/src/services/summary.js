/**
 * Ringkasan harian/mingguan untuk keluarga (PLAN §2.3).
 * Angka-angkanya dihitung dari data, bukan dikarang LLM.
 */
import { many, one } from '../db/pool.js';

/**
 * Hitung ulang ringkasan satu hari dan simpan (upsert) ke daily_summaries.
 *
 * "Satu hari" di sini adalah hari menurut jam lansia. Sebelumnya tanggalnya
 * diambil dari `toISOString()` (selalu UTC) lalu dibandingkan dengan
 * `due_at::date` (zona server) — dua acuan berbeda dalam satu fungsi, dan
 * dua-duanya bukan zona lansia. Efeknya: obat malam masuk hitungan hari
 * berikutnya, dan ringkasan "hari ini" berganti jam 7 pagi WIB.
 */
export async function buildDailySummary(elderId, date = new Date()) {
  const tz = await elderTimezone(elderId);

  // Diambil sebagai teks, bukan DATE: kolom DATE dari pg datang sebagai
  // timestamp yang sudah digeser ke zona lokal proses — persis jebakan yang
  // sedang diperbaiki di sini.
  const { day } = await one(
    `SELECT to_char(($1::timestamptz AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS day`,
    [date, tz],
  );

  const meds = await one(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'confirmed') AS taken,
       COUNT(*) AS total
     FROM reminder_events
      WHERE elder_id = $1 AND type = 'medication'
        AND (due_at AT TIME ZONE $3)::date = $2::date`,
    [elderId, day, tz],
  );

  const mood = await one(
    `SELECT AVG(mood_score)::numeric(3,2) AS avg FROM checkins
      WHERE elder_id = $1 AND (created_at AT TIME ZONE $3)::date = $2::date`,
    [elderId, day, tz],
  );

  const convo = await one(
    `SELECT COUNT(*) AS count FROM conversations
      WHERE elder_id = $1 AND (started_at AT TIME ZONE $3)::date = $2::date`,
    [elderId, day, tz],
  );

  const missedList = await many(
    `SELECT title FROM reminder_events
      WHERE elder_id = $1 AND (due_at AT TIME ZONE $3)::date = $2::date
        AND status IN ('missed', 'skipped')`,
    [elderId, day, tz],
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

async function elderTimezone(elderId) {
  const row = await one('SELECT timezone FROM elders WHERE id = $1', [elderId]);
  return row?.timezone || 'Asia/Jakarta';
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
    `SELECT ds.* FROM daily_summaries ds
       JOIN elders e ON e.id = ds.elder_id
      WHERE ds.elder_id = $1
        AND ds.summary_date >= (now() AT TIME ZONE e.timezone)::date - 7
      ORDER BY ds.summary_date ASC`,
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
