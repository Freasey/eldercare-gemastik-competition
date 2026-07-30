/**
 * Isi database dengan data contoh supaya app keluarga punya sesuatu untuk
 * ditampilkan. Idempoten: menghapus data lama milik email demo lalu menulis
 * ulang. Jalankan dengan `npm run db:seed`.
 *
 * Lansia utama (Ibu Sumarni) dibangun oleh `demoData.js` — modul yang sama
 * dipakai endpoint login tamu, jadi apa yang dilihat tamu identik dengan
 * apa yang kamu lihat saat development.
 */
import { pool, transaction } from './pool.js';
import { at, createDemoElder } from './demoData.js';

const DEMO_CAREGIVER_EMAIL = 'keluarga.demo@caretaker.id';

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
       VALUES ('demo-google-keluarga', $1, 'Keluarga Demo', NULL, 'keluarga')
       RETURNING *`,
      [DEMO_CAREGIVER_EMAIL],
    );

    const { rows: [sumarniUser] } = await c.query(
      `INSERT INTO users (google_id, email, name, role)
       VALUES ('demo-google-sumarni', 'sumarni.demo@caretaker.id', 'Sumarni', 'lansia')
       RETURNING *`,
    );

    // --- lansia utama: seluruh isinya dari modul bersama ---
    await createDemoElder(c, {
      caregiverUserId: caregiver.id,
      elderUserId: sumarniUser.id,
      pairingCode: 'DEMO-01',
      relation: 'Anak kandung',
    });

    // --- lansia kedua: sengaja tipis, cuma untuk menguji daftar >1 lansia.
    // Tamu tidak mendapat yang ini supaya jumlah baris per tamu tetap kecil.
    const { rows: [hartono] } = await c.query(
      `INSERT INTO elders (user_id, name, birth_year, phone, address, religion, prayer_reminder, pairing_code, paired_at)
       VALUES (NULL, 'Bapak Hartono', 1948, '0813-2222-1010', 'Jl. Magelang KM 8, Sleman',
               'Islam', false, 'DEMO-02', now() - interval '12 days')
       RETURNING *`,
    );

    await c.query(
      `INSERT INTO caregiver_links (caregiver_user_id, elder_id, relation, is_primary)
       VALUES ($1, $2, 'Cucu', false)`,
      [caregiver.id, hartono.id],
    );

    await c.query(
      `INSERT INTO emergency_contacts (elder_id, name, relation, phone, user_id, priority)
       VALUES ($1, 'Budi Santoso', 'Cucu', '0857-1111-2222', $2, 1)`,
      [hartono.id, caregiver.id],
    );

    const { rows: [biso] } = await c.query(
      `INSERT INTO medications (elder_id, name, dosage, instruction)
       VALUES ($1, 'Bisoprolol', '2,5 mg', 'Pagi sebelum makan') RETURNING *`,
      [hartono.id],
    );

    const { rows: [bisoSchedule] } = await c.query(
      `INSERT INTO schedules (elder_id, medication_id, type, title, time_of_day, is_critical, created_by)
       VALUES ($1, $2, 'medication', 'Minum Bisoprolol', '06:30', true, $3) RETURNING *`,
      [hartono.id, biso.id, caregiver.id],
    );

    for (let d = -7; d <= -1; d++) {
      await c.query(
        `INSERT INTO reminder_events (elder_id, schedule_id, title, type, is_critical, due_at, status, spoken_at, responded_at)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, 'confirmed', $6::timestamptz, $6::timestamptz + interval '6 minutes')
         ON CONFLICT (schedule_id, due_at) DO NOTHING`,
        [
          hartono.id,
          bisoSchedule.id,
          bisoSchedule.title,
          bisoSchedule.type,
          bisoSchedule.is_critical,
          at(d, '06:30'),
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
