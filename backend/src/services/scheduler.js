/**
 * Scheduler: mengubah `schedules` (aturan berulang) jadi `reminder_events`
 * (kejadian bertanggal), dan menandai yang tidak direspons sebagai missed.
 *
 * Dua cara menjalankannya, tergantung bentuk runtime-nya:
 *
 * - **Lokal / container biasa**: `startScheduler()` dipanggil server.js dan
 *   menyalakan interval di dalam proses yang hidup terus.
 * - **Serverless**: tidak ada proses yang hidup terus, jadi tidak ada yang
 *   memegang interval. Pemicunya cron eksternal yang memanggil
 *   `POST /api/cron/tick` (routes/cron.routes.js).
 *
 * Konsekuensi bentuk kedua: tidak ada lagi state yang boleh disimpan di
 * variabel modul antar-tick — lihat `ambilGiliran()`.
 */
import { many, one } from '../db/pool.js';
import { sweepRateLimits } from '../middleware/rateLimit.js';
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
 *
 * Seluruh perhitungan tanggal sengaja dilakukan Postgres, bukan JavaScript.
 * `schedules.time_of_day` itu jam dinding di tempat lansia ("07:00 WIB"), dan
 * satu-satunya cara benar mengubahnya jadi titik waktu absolut adalah lewat
 * `AT TIME ZONE elders.timezone`. Versi JS sebelumnya memakai `setHours()`
 * yang mengikuti jam server: benar selama backend jalan di laptop WIB, meleset
 * 7 jam begitu dideploy ke container Back4app yang UTC — dan tetap salah untuk
 * lansia di WITA/WIT sekalipun servernya di Jakarta. Postgres sekalian
 * menangani database zona waktu dan DST tanpa dependency tambahan.
 */
export async function materializeReminders() {
  const created = await many(
    `INSERT INTO reminder_events (elder_id, schedule_id, title, type, is_critical, due_at, status)
     SELECT s.elder_id, s.id, s.title, s.type, s.is_critical, occurrence.due_at, 'pending'
       FROM schedules s
       JOIN elders e ON e.id = s.elder_id
       CROSS JOIN LATERAL (
              SELECT ((day::date + s.time_of_day) AT TIME ZONE e.timezone) AS due_at
                FROM generate_series(
                       (now() AT TIME ZONE e.timezone)::date,
                       ((now() + ($1 || ' hours')::interval) AT TIME ZONE e.timezone)::date,
                       interval '1 day'
                     ) AS day
            ) AS occurrence
      WHERE s.active = true
        AND EXTRACT(DOW FROM (occurrence.due_at AT TIME ZONE e.timezone))::smallint = ANY (s.days_of_week)
        AND occurrence.due_at >= now()
        AND occurrence.due_at <= now() + ($1 || ' hours')::interval
     ON CONFLICT (schedule_id, due_at) DO NOTHING
     RETURNING id`,
    [HORIZON_HOURS],
  );

  return { created: created.length };
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
    const elder = await one('SELECT name, timezone FROM elders WHERE id = $1', [r.elder_id]);
    await notifyCaregivers(r.elder_id, {
      title: `${elder?.name ?? 'Lansia'} melewatkan jadwal penting`,
      body: `${r.title} belum dikonfirmasi sejak ${formatTime(r.due_at, elder?.timezone)}.`,
      data: { type: 'missed_critical', reminderId: r.id, elderId: r.elder_id },
      critical: true,
    });
  }

  return { missed: missed.length };
}

/** Jam yang disebut di notifikasi harus jam tempat lansia, bukan jam server. */
function formatTime(ts, timezone = 'Asia/Jakarta') {
  return new Date(ts).toLocaleTimeString('id-ID', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  });
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
const GUEST_SWEEP_EVERY_HOURS = 6;

/**
 * Coba "ambil giliran" untuk pekerjaan yang jarang, dan kembalikan true hanya
 * kalau giliran itu benar-benar didapat.
 *
 * Dulu penjadwalannya cukup sebuah variabel modul, karena backend berupa satu
 * proses yang hidup terus. Di serverless variabel itu ikut hilang tiap instance
 * dibekukan, sehingga pekerjaan 6-jam-sekali berubah jadi hampir tiap tick.
 *
 * Klaimnya satu statement — `WHERE` pada baris yang sedang di-update — supaya
 * dua tick yang kebetulan tumpang tindih tidak sama-sama merasa dapat giliran.
 */
async function ambilGiliran(key, everyHours) {
  const row = await one(
    `INSERT INTO app_state (key, value, updated_at)
     VALUES ($1, now()::text, now())
     ON CONFLICT (key) DO UPDATE
        SET value = now()::text, updated_at = now()
      WHERE app_state.updated_at < now() - ($2 || ' hours')::interval
      RETURNING key`,
    [key, everyHours],
  );
  return Boolean(row);
}

/** Satu putaran penuh. */
export async function runSchedulerTick() {
  const mat = await materializeReminders();
  const sweep = await sweepMissedReminders();
  const sum = await refreshTodaySummaries();

  let guests = null;
  let rateLimits = null;
  if (await ambilGiliran('last_guest_sweep', GUEST_SWEEP_EVERY_HOURS)) {
    guests = await sweepExpiredGuests().catch((err) => {
      console.error('[scheduler] sweep tamu gagal:', err.message);
      return null;
    });
    rateLimits = await sweepRateLimits().catch((err) => {
      console.error('[scheduler] sweep rate limit gagal:', err.message);
      return null;
    });
  }

  if (mat.created || sweep.missed) {
    console.log(`[scheduler] +${mat.created} reminder, ${sweep.missed} ditandai missed`);
  }
  return { ...mat, ...sweep, ...sum, guests, rateLimits };
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
