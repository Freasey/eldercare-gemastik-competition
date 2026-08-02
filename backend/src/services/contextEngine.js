/**
 * Context-check engine (PLAN §2.2).
 *
 * Dipakai bersama oleh dua jalur: trigger manual (lansia menekan tombol) dan
 * reminder otomatis (app-initiated). Satu sistem, bukan dua.
 *
 * PENTING: seluruh logika di file ini murni rule-based TIDAK memanggil LLM.
 * Groq hanya dipakai untuk memahami percakapan bebas (lihat services/groq.js).
 * Alasannya: hemat kuota free tier + behavior reminder obat harus predictable.
 */
import { many, one } from '../db/pool.js';
import { findConsentToAsk } from './consentVoice.js';

/** Urutan prioritas pembuka percakapan. Angka kecil = lebih penting. */
export const OPENING_PRIORITY = {
  reminder_overdue_critical: 10,
  reminder_overdue: 20,
  reminder_due_now: 30,
  mood_checkin_overdue: 40,
  consent_request: 50,
  general_greeting: 90,
};

/** Toleransi menit sebelum sebuah reminder dianggap "due sekarang". */
const DUE_WINDOW_MINUTES = 15;
/** Lewat dari ini, reminder dianggap overdue. */
const OVERDUE_AFTER_MINUTES = 30;
/** Mood check-in dianggap basi setelah sekian jam. */
const MOOD_STALE_HOURS = 20;
/** Berapa hari ke belakang dilihat untuk mendeteksi streak lupa obat. */
const RED_FLAG_WINDOW_DAYS = 7;

function minutesBetween(a, b) {
  return (a.getTime() - b.getTime()) / 60_000;
}

/**
 * Kumpulkan kondisi terkini lansia: reminder aktif, mood terakhir, red flag.
 * Tidak mengubah data apa pun aman dipanggil setiap kali tombol ditekan.
 */
/**
 * @param {number|string} elderId
 * @param {Date} [now]
 * @param {{canAskConsent?: boolean}} [opts]
 *   `canAskConsent` hanya true kalau pemanggilnya device lansia sendiri. Izin
 *   privasi cuma sah kalau lansia yang menjawabnya, jadi pertanyaannya bahkan
 *   tidak dimunculkan ke sesi milik keluarga.
 */
export async function buildContext(elderId, now = new Date(), opts = {}) {
  const [elder, reminders, lastCheckin, missedStats, recentMoods] = await Promise.all([
    one('SELECT * FROM elders WHERE id = $1', [elderId]),
    many(
      `SELECT * FROM reminder_events
        WHERE elder_id = $1
          AND status IN ('pending', 'spoken', 'snoozed')
          AND due_at BETWEEN $2::timestamptz - interval '12 hours'
                         AND $2::timestamptz + interval '2 hours'
        ORDER BY due_at ASC`,
      [elderId, now],
    ),
    one(
      `SELECT * FROM checkins WHERE elder_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [elderId],
    ),
    one(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'missed') AS missed,
         COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
         COUNT(*) AS total
       FROM reminder_events
        WHERE elder_id = $1
          AND type = 'medication'
          AND due_at >= now() - ($2 || ' days')::interval
          AND due_at < now()`,
      [elderId, RED_FLAG_WINDOW_DAYS],
    ),
    many(
      `SELECT mood_score, created_at FROM checkins
        WHERE elder_id = $1 AND created_at >= now() - interval '14 days'
        ORDER BY created_at ASC`,
      [elderId],
    ),
  ]);

  if (!elder) return null;

  const overdue = [];
  const dueNow = [];
  const upcoming = [];

  for (const r of reminders) {
    const lateBy = minutesBetween(now, new Date(r.due_at));
    if (lateBy >= OVERDUE_AFTER_MINUTES) overdue.push({ ...r, late_minutes: Math.round(lateBy) });
    else if (lateBy >= -DUE_WINDOW_MINUTES) dueNow.push({ ...r, late_minutes: Math.round(lateBy) });
    else upcoming.push(r);
  }

  // Overdue kritis didahulukan, lalu yang paling lama terlambat.
  overdue.sort((a, b) => (b.is_critical - a.is_critical) || (b.late_minutes - a.late_minutes));

  const moodHoursAgo = lastCheckin
    ? (now.getTime() - new Date(lastCheckin.created_at).getTime()) / 3_600_000
    : Infinity;

  return {
    elder,
    now,
    reminders: { overdue, dueNow, upcoming },
    lastCheckin,
    moodHoursAgo,
    moodStale: moodHoursAgo >= MOOD_STALE_HOURS,
    redFlags: detectRedFlags({ missedStats, recentMoods }),
    consentToAsk: opts.canAskConsent ? await findConsentToAsk(elderId, elder.timezone) : null,
  };
}

/**
 * Sinyal yang perlu perhatian keluarga. Bukan diagnosis hanya pola kasar
 * yang layak ditampilkan di dashboard dan dipakai untuk menaikkan prioritas.
 */
function detectRedFlags({ missedStats, recentMoods }) {
  const flags = [];

  const missed = Number(missedStats?.missed || 0);
  const total = Number(missedStats?.total || 0);
  if (total > 0) {
    const adherence = Number(missedStats.confirmed) / total;
    if (missed >= 3) {
      flags.push({
        key: 'medication_missed_streak',
        severity: missed >= 5 ? 'high' : 'medium',
        label: `${missed} jadwal obat terlewat dalam ${RED_FLAG_WINDOW_DAYS} hari terakhir`,
      });
    }
    if (adherence < 0.7) {
      flags.push({
        key: 'low_adherence',
        severity: 'high',
        label: `Kepatuhan obat ${Math.round(adherence * 100)}% (di bawah 70%)`,
      });
    }
  }

  if (recentMoods.length >= 4) {
    const half = Math.floor(recentMoods.length / 2);
    const avg = (arr) => arr.reduce((s, m) => s + m.mood_score, 0) / arr.length;
    const older = avg(recentMoods.slice(0, half));
    const newer = avg(recentMoods.slice(half));
    if (newer <= older - 0.75) {
      flags.push({
        key: 'mood_declining',
        severity: 'medium',
        label: `Tren mood menurun (${older.toFixed(1)} → ${newer.toFixed(1)} dari skala 5)`,
      });
    }
    if (newer <= 2) {
      flags.push({ key: 'mood_low', severity: 'high', label: 'Mood rata-rata rendah beberapa hari terakhir' });
    }
  }

  return flags;
}

/**
 * Tentukan app harus bicara apa duluan. Ini yang membuat assistant tidak
 * membuka dengan "ada yang bisa dibantu?" generik.
 *
 * @returns {{kind: string, priority: number, speech: string, reminder?: object}}
 */
export function decideOpening(context) {
  const { elder, reminders, moodStale } = context;
  const nama = shortName(elder.name);

  const criticalOverdue = reminders.overdue.find((r) => r.is_critical);
  if (criticalOverdue) {
    return {
      kind: 'reminder_overdue_critical',
      priority: OPENING_PRIORITY.reminder_overdue_critical,
      reminder: criticalOverdue,
      speech: `${nama}, ${describeLate(criticalOverdue)} waktunya ${subject(criticalOverdue.title)}. Ini penting, sudah dilakukan belum?`,
      expects: 'confirmation',
    };
  }

  if (reminders.overdue.length > 0) {
    const r = reminders.overdue[0];
    return {
      kind: 'reminder_overdue',
      priority: OPENING_PRIORITY.reminder_overdue,
      reminder: r,
      speech: `${nama}, ${describeLate(r)} waktunya ${subject(r.title)}. Sudah atau belum?`,
      expects: 'confirmation',
    };
  }

  if (reminders.dueNow.length > 0) {
    const r = reminders.dueNow[0];
    return {
      kind: 'reminder_due_now',
      priority: OPENING_PRIORITY.reminder_due_now,
      reminder: r,
      speech: `${nama}, sekarang waktunya ${subject(r.title)}.`,
      expects: 'confirmation',
    };
  }

  if (moodStale) {
    return {
      kind: 'mood_checkin_overdue',
      priority: OPENING_PRIORITY.mood_checkin_overdue,
      speech: `Halo ${nama}. Hari ini perasaannya bagaimana?`,
      expects: 'mood',
    };
  }

  // Izin ditanyakan sebagai pembuka hanya di hari yang sepi. Kalau ada
  // reminder atau mood yang lebih penting, pertanyaannya menyusul sebagai
  // pertanyaan kedua di sesi yang sama (lihat assistant.routes.js).
  if (context.consentToAsk) {
    return {
      kind: 'consent_request',
      priority: OPENING_PRIORITY.consent_request,
      consentKey: context.consentToAsk.key,
      speech: `${greetingByHour(context.now, elder.timezone)} ${nama}. ${context.consentToAsk.question}`,
      expects: 'consent',
    };
  }

  return {
    kind: 'general_greeting',
    priority: OPENING_PRIORITY.general_greeting,
    speech: `${greetingByHour(context.now, elder.timezone)} ${nama}. Ada yang ingin diceritakan?`,
    expects: 'free',
  };
}

/**
 * Berapa banyak pertanyaan proaktif yang masih boleh diajukan di sesi ini.
 * PLAN §2.2: dibatasi 1-2 per sesi supaya tidak terasa interogasi.
 * Kalau lansia sendiri yang mengajak ngobrol, batas ini tidak berlaku.
 */
export const MAX_PROACTIVE_QUESTIONS = 2;

function shortName(fullName) {
  // "Ibu Sumarni" -> "Bu Sumarni"; kalau tanpa sapaan, pakai kata pertama.
  const parts = fullName.trim().split(/\s+/);
  if (/^(ibu|bapak|pak|bu)$/i.test(parts[0])) {
    const sapaan = /^ibu$/i.test(parts[0]) ? 'Bu' : /^bapak$/i.test(parts[0]) ? 'Pak' : parts[0];
    return [sapaan, ...parts.slice(1)].join(' ');
  }
  return parts[0];
}

function lower(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Judul jadwal ditulis keluarga dengan bebas, jadi banyak yang sudah memuat
 * awalan sendiri ("Waktunya sholat Maghrib"). Template di bawah menempelkan
 * "waktunya" lagi kalau tidak dibuang, TTS membacakan "waktunya waktunya
 * sholat maghrib". Dibersihkan di sini, bukan dengan melarang penamaan
 * tertentu di app keluarga.
 */
function subject(title) {
  return lower(String(title).trim().replace(/^(sudah\s+)?(waktunya|saatnya|jadwal|jadwalnya)\s+/i, ''));
}

function describeLate(reminder) {
  const m = reminder.late_minutes;
  if (m >= 120) return `${Math.floor(m / 60)} jam yang lalu`;
  if (m >= 60) return 'satu jam yang lalu';
  return `${m} menit yang lalu`;
}

/**
 * Sapaan mengikuti jam DI TEMPAT LANSIA, bukan jam server. Tanpa ini, backend
 * yang jalan di container UTC akan mengucap "selamat pagi" pada jam 5 sore WIB.
 */
function greetingByHour(now, timezone = 'Asia/Jakarta') {
  const h = Number(
    // hourCycle h23 dipakai eksplisit: sebagian implementasi ICU mengembalikan
    // "24" untuk tengah malam kalau hanya mengandalkan hour12: false.
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );

  if (h < 11) return 'Selamat pagi,';
  if (h < 15) return 'Selamat siang,';
  if (h < 18) return 'Selamat sore,';
  return 'Selamat malam,';
}
