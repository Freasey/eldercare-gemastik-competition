/**
 * Isi database dengan data contoh supaya app keluarga punya sesuatu untuk
 * ditampilkan. Idempoten: menghapus data lama milik email demo lalu menulis
 * ulang. Jalankan dengan `npm run db:seed`.
 */
import { pool, transaction } from './pool.js';

const DEMO_CAREGIVER_EMAIL = 'keluarga.demo@caretaker.id';

const DAY = 24 * 60 * 60 * 1000;

/** Tanggal hari ini pada jam lokal tertentu, digeser `dayOffset` hari. */
function at(dayOffset, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.now() + dayOffset * DAY);
  d.setHours(h, m, 0, 0);
  return d;
}

function dateOnly(dayOffset) {
  const d = new Date(Date.now() + dayOffset * DAY);
  return d.toISOString().slice(0, 10);
}

async function main() {
  await transaction(async (c) => {
    // --- bersihkan data demo lama ---
    await c.query(
      `DELETE FROM users WHERE email IN ($1, 'sumarni.demo@caretaker.id', 'hartono.demo@caretaker.id')`,
      [DEMO_CAREGIVER_EMAIL],
    );
    await c.query(`DELETE FROM elders WHERE pairing_code IN ('DEMO-01', 'DEMO-02')`);

    // --- users ---
    const { rows: [caregiver] } = await c.query(
      `INSERT INTO users (google_id, email, name, avatar_url, role)
       VALUES ('demo-google-keluarga', $1, 'Daffa Ardhana', NULL, 'keluarga')
       RETURNING *`,
      [DEMO_CAREGIVER_EMAIL],
    );

    const { rows: [sumarniUser] } = await c.query(
      `INSERT INTO users (google_id, email, name, role)
       VALUES ('demo-google-sumarni', 'sumarni.demo@caretaker.id', 'Sumarni', 'lansia')
       RETURNING *`,
    );

    // --- elders ---
    const { rows: [sumarni] } = await c.query(
      `INSERT INTO elders (user_id, name, birth_year, phone, address, religion, prayer_reminder, pairing_code, paired_at)
       VALUES ($1, 'Ibu Sumarni', 1953, '0812-3456-7890', 'Jl. Kaliurang KM 5, Sleman',
               'Islam', true, 'DEMO-01', now() - interval '40 days')
       RETURNING *`,
      [sumarniUser.id],
    );

    const { rows: [hartono] } = await c.query(
      `INSERT INTO elders (user_id, name, birth_year, phone, address, religion, prayer_reminder, pairing_code, paired_at)
       VALUES (NULL, 'Bapak Hartono', 1948, '0813-2222-1010', 'Jl. Magelang KM 8, Sleman',
               'Islam', false, 'DEMO-02', now() - interval '12 days')
       RETURNING *`,
    );

    for (const [elder, relation, primary] of [
      [sumarni, 'Anak kandung', true],
      [hartono, 'Cucu', false],
    ]) {
      await c.query(
        `INSERT INTO caregiver_links (caregiver_user_id, elder_id, relation, is_primary)
         VALUES ($1, $2, $3, $4)`,
        [caregiver.id, elder.id, relation, primary],
      );
    }

    // --- kontak darurat ---
    await c.query(
      `INSERT INTO emergency_contacts (elder_id, name, relation, phone, user_id, priority)
       VALUES ($1, 'Daffa Ardhana', 'Anak kandung', '0857-1111-2222', $2, 1),
              ($1, 'Rina Wulandari', 'Anak kedua', '0857-3333-4444', NULL, 2),
              ($1, 'Klinik Sehat Sleman', 'Faskes', '(0274) 555-321', NULL, 3),
              ($3, 'Daffa Ardhana', 'Cucu', '0857-1111-2222', $2, 1)`,
      [sumarni.id, caregiver.id, hartono.id],
    );

    // --- obat ---
    const meds = {};
    for (const [key, elderId, name, dosage, instruction] of [
      ['amlodipine', sumarni.id, 'Amlodipine', '5 mg', 'Sesudah sarapan'],
      ['metformin', sumarni.id, 'Metformin', '500 mg', 'Sesudah makan, 2x sehari'],
      ['vitaminD', sumarni.id, 'Vitamin D3', '1000 IU', 'Sesudah makan siang'],
      ['bisoprolol', hartono.id, 'Bisoprolol', '2,5 mg', 'Pagi sebelum makan'],
    ]) {
      const { rows: [row] } = await c.query(
        `INSERT INTO medications (elder_id, name, dosage, instruction)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [elderId, name, dosage, instruction],
      );
      meds[key] = row;
    }

    // --- jadwal ---
    const schedules = {};
    const scheduleRows = [
      ['pagiAmlo', sumarni.id, meds.amlodipine.id, 'medication', 'Minum Amlodipine', '07:00', true],
      ['pagiMetf', sumarni.id, meds.metformin.id, 'medication', 'Minum Metformin (pagi)', '08:00', true],
      ['siangVitD', sumarni.id, meds.vitaminD.id, 'medication', 'Minum Vitamin D3', '13:00', false],
      ['malamMetf', sumarni.id, meds.metformin.id, 'medication', 'Minum Metformin (malam)', '19:00', true],
      ['jalanPagi', sumarni.id, null, 'activity', 'Jalan pagi keliling komplek', '06:00', false],
      ['maghrib', sumarni.id, null, 'prayer', 'Waktunya sholat Maghrib', '17:45', false],
      ['tidur', sumarni.id, null, 'sleep', 'Waktunya istirahat malam', '21:00', false],
      ['hartonoBiso', hartono.id, meds.bisoprolol.id, 'medication', 'Minum Bisoprolol', '06:30', true],
    ];

    for (const [key, elderId, medId, type, title, time, critical] of scheduleRows) {
      const { rows: [row] } = await c.query(
        `INSERT INTO schedules (elder_id, medication_id, type, title, time_of_day, is_critical, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [elderId, medId, type, title, time, critical, caregiver.id],
      );
      schedules[key] = row;
    }

    // --- riwayat reminder 7 hari terakhir ---
    // Pola: Ibu Sumarni patuh, kecuali Metformin malam yang beberapa kali
    // terlewat — ini yang jadi red flag di dashboard keluarga.
    const history = [
      ['pagiAmlo', '07:00', (d) => 'confirmed'],
      ['pagiMetf', '08:00', (d) => 'confirmed'],
      ['siangVitD', '13:00', (d) => (d % 3 === 0 ? 'skipped' : 'confirmed')],
      ['malamMetf', '19:00', (d) => (d >= -3 && d <= -1 ? 'missed' : 'confirmed')],
    ];

    for (let d = -7; d <= -1; d++) {
      for (const [key, time, statusFor] of history) {
        const s = schedules[key];
        const status = statusFor(d);
        const due = at(d, time);
        await c.query(
          `INSERT INTO reminder_events
             (elder_id, schedule_id, title, type, is_critical, due_at, status, spoken_at, responded_at, attempts)
           VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::text, $6::timestamptz,
                   CASE WHEN $7::text = 'missed' THEN NULL ELSE $6::timestamptz + interval '4 minutes' END,
                   CASE WHEN $7::text = 'missed' THEN 3 ELSE 1 END)
           ON CONFLICT (schedule_id, due_at) DO NOTHING`,
          [s.elder_id, s.id, s.title, s.type, s.is_critical, due, status],
        );
      }
      const hs = schedules.hartonoBiso;
      await c.query(
        `INSERT INTO reminder_events (elder_id, schedule_id, title, type, is_critical, due_at, status, spoken_at, responded_at)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, 'confirmed', $6::timestamptz, $6::timestamptz + interval '6 minutes')
         ON CONFLICT (schedule_id, due_at) DO NOTHING`,
        [hs.elder_id, hs.id, hs.title, hs.type, hs.is_critical, at(d, '06:30')],
      );
    }

    // --- reminder hari ini ---
    const now = new Date();
    for (const [key, time] of [
      ['jalanPagi', '06:00'],
      ['pagiAmlo', '07:00'],
      ['pagiMetf', '08:00'],
      ['siangVitD', '13:00'],
      ['maghrib', '17:45'],
      ['malamMetf', '19:00'],
      ['tidur', '21:00'],
    ]) {
      const s = schedules[key];
      const due = at(0, time);
      // Yang sudah lewat dianggap sudah dikonfirmasi, kecuali Metformin malam
      // (dibiarkan pending/overdue supaya context engine punya kasus nyata).
      let status = 'pending';
      let responded = null;
      if (due < now) {
        if (key === 'malamMetf') {
          status = 'spoken';
        } else {
          status = 'confirmed';
          responded = new Date(due.getTime() + 5 * 60 * 1000);
        }
      }
      await c.query(
        `INSERT INTO reminder_events (elder_id, schedule_id, title, type, is_critical, due_at, status, spoken_at, responded_at)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::text,
                 CASE WHEN $7::text = 'pending' THEN NULL ELSE $6::timestamptz END, $8)
         ON CONFLICT (schedule_id, due_at) DO NOTHING`,
        [s.elder_id, s.id, s.title, s.type, s.is_critical, due, status, responded],
      );
    }

    // --- mood check-in ---
    const moods = [4, 4, 3, 4, 3, 3, 2, 3];
    for (let i = 0; i < moods.length; i++) {
      await c.query(
        `INSERT INTO checkins (elder_id, mood_score, energy_score, source, note, created_at)
         VALUES ($1, $2, $3, 'assistant', $4, $5)`,
        [
          sumarni.id,
          moods[i],
          Math.max(1, moods[i] - 1),
          i === moods.length - 2 ? 'Bilang badannya pegal dan kurang tidur' : null,
          at(-(moods.length - 1 - i), '10:30'),
        ],
      );
    }

    // --- percakapan contoh ---
    const { rows: [conv] } = await c.query(
      `INSERT INTO conversations (elder_id, trigger, opening_kind, started_at, ended_at, summary)
       VALUES ($1, 'button', 'reminder_overdue', $2, $3,
               'Menanyakan Metformin malam yang terlewat. Ibu bilang lupa karena ketiduran, lalu langsung minum. Mood terdengar agak lesu.')
       RETURNING *`,
      [sumarni.id, at(-1, '19:20'), at(-1, '19:26')],
    );

    for (const [role, content, min] of [
      ['assistant', 'Bu Sumarni, tadi jam tujuh malam waktunya minum Metformin. Sudah diminum belum?', 0],
      ['elder', 'Aduh, belum. Tadi ketiduran di depan tivi.', 1],
      ['assistant', 'Tidak apa-apa, Bu. Obatnya masih bisa diminum sekarang. Saya tunggu ya.', 2],
      ['elder', 'Iya sudah ini, sudah saya minum sama air putih.', 4],
      ['assistant', 'Alhamdulillah. Ibu hari ini badannya bagaimana?', 5],
      ['elder', 'Ya begitu, agak pegal. Kurang tidur kayaknya.', 6],
    ]) {
      await c.query(
        `INSERT INTO messages (conversation_id, role, content, created_at)
         VALUES ($1, $2, $3, $4)`,
        [conv.id, role, content, new Date(at(-1, '19:20').getTime() + min * 60_000)],
      );
    }

    for (const [metric, value] of [
      ['speech_rate_drop', 0.18],
      ['word_finding_pause', 0.22],
      ['repetition_rate', 0.11],
    ]) {
      await c.query(
        `INSERT INTO cognitive_signals (elder_id, conversation_id, metric, value, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [sumarni.id, conv.id, metric, value, at(-1, '19:27')],
      );
    }

    // --- riwayat darurat ---
    await c.query(
      `INSERT INTO emergency_events (elder_id, trigger_type, status, detail, confirmed_by_elder, acknowledged_by, created_at, resolved_at)
       VALUES ($1, 'keyword', 'resolved', 'Terdeteksi kata "tolong" saat di kamar mandi. Ibu bilang cuma kepeleset sedikit, tidak jatuh.',
               true, $2, $3, $4),
              ($1, 'missed_critical', 'resolved', 'Metformin malam terlewat 3 hari berturut-turut.', NULL, $2, $5, $6)`,
      [sumarni.id, caregiver.id, at(-9, '15:40'), at(-9, '16:02'), at(-1, '20:30'), at(-1, '21:15')],
    );

    // --- consent ---
    for (const [key, granted] of [
      ['share_daily_summary', true],
      ['share_conversation_transcript', false],
      ['share_mood_signal', true],
      ['always_listening', false],
      ['fall_detection', true],
    ]) {
      await c.query(
        `INSERT INTO consents (elder_id, key, granted) VALUES ($1, $2, $3)
         ON CONFLICT (elder_id, key) DO UPDATE SET granted = EXCLUDED.granted`,
        [sumarni.id, key, granted],
      );
    }

    // --- ringkasan harian ---
    for (let d = -7; d <= -1; d++) {
      const missed = d >= -3 && d <= -1 ? 1 : 0;
      await c.query(
        `INSERT INTO daily_summaries
           (elder_id, summary_date, medication_taken, medication_total, mood_avg, conversation_count, cognitive_trend, highlights)
         VALUES ($1, $2, $3, 4, $4, $5, $6, $7)
         ON CONFLICT (elder_id, summary_date) DO NOTHING`,
        [
          sumarni.id,
          dateOnly(d),
          4 - missed,
          (3.6 - Math.abs(d) * 0.08).toFixed(2),
          d % 2 === 0 ? 2 : 3,
          d >= -3 ? 'perlu diperhatikan' : 'stabil',
          JSON.stringify(
            missed
              ? ['Metformin malam terlewat', 'Tidur lebih larut dari biasanya']
              : ['Semua obat diminum tepat waktu'],
          ),
        ],
      );
    }

    console.log('[seed] selesai.');
    console.log(`[seed] caregiver demo: ${DEMO_CAREGIVER_EMAIL} (pakai POST /api/auth/dev-login)`);
  });

  await pool.end();
}

main().catch((err) => {
  console.error('[seed] gagal:', err);
  process.exit(1);
});
