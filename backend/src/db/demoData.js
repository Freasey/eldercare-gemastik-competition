/**
 * Pembangun data contoh untuk satu lansia.
 *
 * Dipakai dua tempat:
 *   1. `npm run db:seed` — akun demo tetap untuk development
 *   2. `POST /api/auth/guest` — tiap tamu dapat salinannya sendiri
 *
 * Sengaja membangun ulang, bukan meng-copy baris milik akun demo: semua
 * tanggal dihitung relatif terhadap saat fungsi dipanggil, jadi tamu yang
 * mendaftar bulan depan tetap melihat data "minggu ini" — bukan data basi
 * dari kapan `db:seed` terakhir dijalankan.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Tanggal hari ini pada jam lokal tertentu, digeser `dayOffset` hari. */
export function at(dayOffset, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.now() + dayOffset * DAY);
  d.setHours(h, m, 0, 0);
  return d;
}

export function dateOnly(dayOffset) {
  const d = new Date(Date.now() + dayOffset * DAY);
  return d.toISOString().slice(0, 10);
}

/**
 * Bangun satu lansia demo lengkap dengan riwayat seminggu terakhir.
 *
 * @param {import('pg').PoolClient} c klien di dalam transaksi
 * @param {{
 *   caregiverUserId: string|number,
 *   elderUserId?: string|number|null,
 *   pairingCode?: string|null,
 *   relation?: string,
 * }} opts
 * @returns {Promise<object>} baris `elders` yang dibuat
 */
export async function createDemoElder(c, {
  caregiverUserId,
  elderUserId = null,
  pairingCode = null,
  relation = 'Anak kandung',
}) {
  // --- lansia ---
  const { rows: [elder] } = await c.query(
    `INSERT INTO elders (user_id, name, birth_year, phone, address, religion, prayer_reminder, pairing_code, paired_at)
     VALUES ($1, 'Ibu Sumarni', 1953, '0812-3456-7890', 'Jl. Kaliurang KM 5, Sleman',
             'Islam', true, $2, now() - interval '40 days')
     RETURNING *`,
    [elderUserId, pairingCode],
  );

  await c.query(
    `INSERT INTO caregiver_links (caregiver_user_id, elder_id, relation, is_primary)
     VALUES ($1, $2, $3, true)`,
    [caregiverUserId, elder.id, relation],
  );

  // --- kontak darurat ---
  await c.query(
    `INSERT INTO emergency_contacts (elder_id, name, relation, phone, user_id, priority)
     VALUES ($1, 'Budi Santoso', 'Anak kandung', '0857-1111-2222', $2, 1),
            ($1, 'Rina Wulandari', 'Anak kedua', '0857-3333-4444', NULL, 2),
            ($1, 'Klinik Sehat Sleman', 'Faskes', '(0274) 555-321', NULL, 3)`,
    [elder.id, caregiverUserId],
  );

  // --- obat ---
  const meds = {};
  for (const [key, name, dosage, instruction] of [
    ['amlodipine', 'Amlodipine', '5 mg', 'Sesudah sarapan'],
    ['metformin', 'Metformin', '500 mg', 'Sesudah makan, 2x sehari'],
    ['vitaminD', 'Vitamin D3', '1000 IU', 'Sesudah makan siang'],
  ]) {
    const { rows: [row] } = await c.query(
      `INSERT INTO medications (elder_id, name, dosage, instruction)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [elder.id, name, dosage, instruction],
    );
    meds[key] = row;
  }

  // --- jadwal ---
  const schedules = {};
  for (const [key, medId, type, title, time, critical] of [
    ['pagiAmlo', meds.amlodipine.id, 'medication', 'Minum Amlodipine', '07:00', true],
    ['pagiMetf', meds.metformin.id, 'medication', 'Minum Metformin (pagi)', '08:00', true],
    ['siangVitD', meds.vitaminD.id, 'medication', 'Minum Vitamin D3', '13:00', false],
    ['malamMetf', meds.metformin.id, 'medication', 'Minum Metformin (malam)', '19:00', true],
    ['jalanPagi', null, 'activity', 'Jalan pagi keliling komplek', '06:00', false],
    ['maghrib', null, 'prayer', 'Waktunya sholat Maghrib', '17:45', false],
    ['tidur', null, 'sleep', 'Waktunya istirahat malam', '21:00', false],
  ]) {
    const { rows: [row] } = await c.query(
      `INSERT INTO schedules (elder_id, medication_id, type, title, time_of_day, is_critical, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [elder.id, medId, type, title, time, critical, caregiverUserId],
    );
    schedules[key] = row;
  }

  // --- riwayat reminder 7 hari terakhir ---
  // Pola: Ibu Sumarni patuh, kecuali Metformin malam yang beberapa kali
  // terlewat — ini yang jadi red flag di dashboard keluarga.
  const history = [
    ['pagiAmlo', '07:00', () => 'confirmed'],
    ['pagiMetf', '08:00', () => 'confirmed'],
    ['siangVitD', '13:00', (d) => (d % 3 === 0 ? 'skipped' : 'confirmed')],
    ['malamMetf', '19:00', (d) => (d >= -3 && d <= -1 ? 'missed' : 'confirmed')],
  ];

  for (let d = -7; d <= -1; d++) {
    for (const [key, time, statusFor] of history) {
      const s = schedules[key];
      await c.query(
        `INSERT INTO reminder_events
           (elder_id, schedule_id, title, type, is_critical, due_at, status, spoken_at, responded_at, attempts)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::text, $6::timestamptz,
                 CASE WHEN $7::text = 'missed' THEN NULL ELSE $6::timestamptz + interval '4 minutes' END,
                 CASE WHEN $7::text = 'missed' THEN 3 ELSE 1 END)
         ON CONFLICT (schedule_id, due_at) DO NOTHING`,
        [elder.id, s.id, s.title, s.type, s.is_critical, at(d, time), statusFor(d)],
      );
    }
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
    // (dibiarkan spoken/overdue supaya context engine punya kasus nyata).
    let status = 'pending';
    let responded = null;
    if (due < now) {
      if (key === 'malamMetf') {
        status = 'spoken';
      } else {
        status = 'confirmed';
        responded = new Date(due.getTime() + 5 * 60_000);
      }
    }
    await c.query(
      `INSERT INTO reminder_events (elder_id, schedule_id, title, type, is_critical, due_at, status, spoken_at, responded_at)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::text,
               CASE WHEN $7::text = 'pending' THEN NULL ELSE $6::timestamptz END, $8)
       ON CONFLICT (schedule_id, due_at) DO NOTHING`,
      [elder.id, s.id, s.title, s.type, s.is_critical, due, status, responded],
    );
  }

  // --- mood check-in ---
  const moods = [4, 4, 3, 4, 3, 3, 2, 3];
  for (let i = 0; i < moods.length; i++) {
    await c.query(
      `INSERT INTO checkins (elder_id, mood_score, energy_score, source, note, created_at)
       VALUES ($1, $2, $3, 'assistant', $4, $5)`,
      [
        elder.id,
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
    [elder.id, at(-1, '19:20'), at(-1, '19:26')],
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
      [elder.id, conv.id, metric, value, at(-1, '19:27')],
    );
  }

  // --- riwayat darurat ---
  await c.query(
    `INSERT INTO emergency_events (elder_id, trigger_type, status, detail, confirmed_by_elder, acknowledged_by, created_at, resolved_at)
     VALUES ($1, 'keyword', 'resolved', 'Terdeteksi kata "tolong" saat di kamar mandi. Ibu bilang cuma kepeleset sedikit, tidak jatuh.',
             true, $2, $3, $4),
            ($1, 'missed_critical', 'resolved', 'Metformin malam terlewat 3 hari berturut-turut.', NULL, $2, $5, $6)`,
    [elder.id, caregiverUserId, at(-9, '15:40'), at(-9, '16:02'), at(-1, '20:30'), at(-1, '21:15')],
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
      [elder.id, key, granted],
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
        elder.id,
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

  return elder;
}
