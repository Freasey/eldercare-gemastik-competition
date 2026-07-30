/**
 * Scheduler: mengubah `schedules` (aturan berulang) jadi `reminder_events`
 * (kejadian bertanggal), dan menandai yang tidak direspons sebagai missed.
 *
 * Dijalankan periodik dari server.js. Sengaja tanpa cron library — interval
 * sederhana sudah cukup dan satu container Back4app tidak perlu koordinasi
 * antar-instance.
 */
import { many, one } from '../db/pool.js';
import { notifyCaregivers } from './push.js';
import { buildDailySummary } from './summary.js';
import { sweepExpiredGuests } from './guest.js';

/** Reminder yang lewat sekian menit tanpa respons dianggap missed. */
const MISSED_AFTER_MINUTES = 90;
/** Berapa jam ke depan event di-materialize. */
const HORIZON_HOURS = 36;

/**
 * Buat reminder_events untuk semua jadwal aktif dalam horizon ke depan.
 * Idempoten berkat UNIQUE (schedule_id, due_at).
 */
export async function materializeReminders(now = new Date()) {
  const schedules = await many(
    `SELECT s.*, e.timezone FROM schedules s
       JOIN elders e ON e.id = s.elder_id
      WHERE s.active = true`,
  );

  let created = 0;

  for (const s of schedules) {
    for (const due of upcomingOccurrences(s, now)) {
      const res = await one(
        `INSERT INTO reminder_events (elder_id, schedule_id, title, type, is_critical, due_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         ON CONFLICT (schedule_id, due_at) DO NOTHING
         RETURNING id`,
        [s.elder_id, s.id, s.title, s.type, s.is_critical, due],
      );
      if (res) created++;
    }
  }

  return { created };
}

/** Kejadian jadwal `s` antara sekarang dan HORIZON_HOURS ke depan. */
function upcomingOccurrences(schedule, now) {
  const [h, m] = String(schedule.time_of_day).split(':').map(Number);
  const out = [];
  const horizonEnd = new Date(now.getTime() + HORIZON_HOURS * 3_600_000);

  for (let dayOffset = 0; dayOffset <= Math.ceil(HORIZON_HOURS / 24); dayOffset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);

    if (d < now || d > horizonEnd) continue;
    if (!schedule.days_of_week.includes(d.getDay())) continue;

    out.push(new Date(d));
  }

  return out;
}

/**
 * Tandai reminder lewat waktu yang tidak pernah direspons sebagai `missed`.
 * Untuk reminder kritis, keluarga langsung diberi tahu — ini salah satu
 * trigger eskalasi darurat di PLAN §2.4.
 */
export async function sweepMissedReminders(now = new Date()) {
  const missed = await many(
    `UPDATE reminder_events
        SET status = 'missed'
      WHERE status IN ('pending', 'spoken', 'snoozed')
        AND due_at < $1::timestamptz - ($2 || ' minutes')::interval
      RETURNING *`,
    [now, MISSED_AFTER_MINUTES],
  );

  for (const r of missed.filter((x) => x.is_critical)) {
    const elder = await one('SELECT name FROM elders WHERE id = $1', [r.elder_id]);
    await notifyCaregivers(r.elder_id, {
      title: `${elder?.name ?? 'Lansia'} melewatkan jadwal penting`,
      body: `${r.title} belum dikonfirmasi sejak ${formatTime(r.due_at)}.`,
      data: { type: 'missed_critical', reminderId: r.id, elderId: r.elder_id },
      critical: true,
    });
  }

  return { missed: missed.length };
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** Ringkasan hanya disegarkan untuk lansia yang ada orangnya aktif sekian jam terakhir. */
const ACTIVE_WITHIN_HOURS = 24;

/**
 * Segarkan ringkasan hari ini, supaya kartu di app keluarga ikut bergerak
 * sepanjang hari — bukan cuma saat tutup hari.
 *
 * Endpoint "ringkasan hari ini" sebenarnya sudah menghitung ulang sendiri saat
 * dipanggil; yang butuh baris tersimpan cuma agregat mingguan. Jadi ini murni
 * demi kartu yang bergerak, dan tidak layak dibayar untuk lansia yang tidak
 * ada yang menonton — mayoritasnya akun tamu yang cuma mampir sekali.
 */
export async function refreshTodaySummaries() {
  const elders = await many(
    `SELECT e.id FROM elders e
      WHERE EXISTS (
              SELECT 1 FROM caregiver_links cl
                JOIN users u ON u.id = cl.caregiver_user_id
               WHERE cl.elder_id = e.id
                 AND u.last_seen_at >= now() - ($1 || ' hours')::interval
            )
         OR EXISTS (
              SELECT 1 FROM users u
               WHERE u.id = e.user_id
                 AND u.last_seen_at >= now() - ($1 || ' hours')::interval
            )`,
    [ACTIVE_WITHIN_HOURS],
  );

  for (const e of elders) {
    await buildDailySummary(e.id).catch((err) =>
      console.error(`[scheduler] ringkasan lansia ${e.id} gagal:`, err.message),
    );
  }
  return { summaries: elders.length };
}

/** Pembersihan akun tamu tidak perlu tiap tick — cukup beberapa jam sekali. */
const GUEST_SWEEP_EVERY_MS = 6 * 3_600_000;
let lastGuestSweep = 0;

/** Satu putaran penuh. */
export async function runSchedulerTick() {
  const mat = await materializeReminders();
  const sweep = await sweepMissedReminders();
  const sum = await refreshTodaySummaries();

  let guests = null;
  if (Date.now() - lastGuestSweep >= GUEST_SWEEP_EVERY_MS) {
    lastGuestSweep = Date.now();
    guests = await sweepExpiredGuests().catch((err) => {
      console.error('[scheduler] sweep tamu gagal:', err.message);
      return null;
    });
  }

  if (mat.created || sweep.missed) {
    console.log(`[scheduler] +${mat.created} reminder, ${sweep.missed} ditandai missed`);
  }
  return { ...mat, ...sweep, ...sum, guests };
}

export function startScheduler({ intervalMs = 5 * 60_000 } = {}) {
  runSchedulerTick().catch((err) => console.error('[scheduler] tick gagal:', err.message));
  const timer = setInterval(
    () => runSchedulerTick().catch((err) => console.error('[scheduler] tick gagal:', err.message)),
    intervalMs,
  );
  timer.unref?.();
  return timer;
}
