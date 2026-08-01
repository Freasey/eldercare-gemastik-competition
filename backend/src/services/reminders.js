/**
 * Respons atas sebuah reminder.
 *
 * Disatukan di sini karena dua jalur memanggilnya dan efek sampingnya wajib
 * sama: jawaban suara lansia ("nanti ya") dan tombol tunda di app keluarga
 * harus sama-sama benar-benar kembali menagih.
 */
import { one } from '../db/pool.js';

/** Jarak penundaan saat lansia atau keluarga memilih "nanti". */
export const SNOOZE_MINUTES = 15;
/** Batas penundaan beruntun, supaya tidak jadi loop tak berujung. */
const MAX_SNOOZE_ATTEMPTS = 3;

/**
 * Catat jawaban atas sebuah reminder.
 *
 * Penundaan menggeser `due_at` baris yang sama, bukan membuat baris baru.
 * Kalau baris baru yang dibuat, baris lamanya tertinggal berstatus `snoozed`
 * dengan waktu yang sudah lewat — dan `sweepMissedReminders` akan menandainya
 * `missed` pada tick berikutnya, jadi menunda obat kritis justru langsung
 * memicu notifikasi "terlewat" ke keluarga sekaligus merusak angka kepatuhan.
 * Satu kewajiban = satu baris; berapa kali ditunda terbaca dari `attempts`.
 *
 * @param {{reminderId: number|string, elderId: number|string,
 *          status: 'confirmed'|'snoozed'|'skipped', note?: string|null}} args
 * @returns {Promise<{reminder: object|null, snoozedUntil: Date|null}>}
 *   `snoozedUntil` null saat jatah penundaan habis — pemanggil memakainya
 *   untuk memilih kalimat balasan supaya tidak menjanjikan yang tidak terjadi.
 */
export async function respondToReminder({ reminderId, elderId, status, note = null }) {
  const trimmedNote = note ? note.slice(0, 500) : null;

  const current = await one(
    'SELECT attempts FROM reminder_events WHERE id = $1 AND elder_id = $2',
    [reminderId, elderId],
  );
  if (!current) return { reminder: null, snoozedUntil: null };

  const canSnooze = status === 'snoozed' && current.attempts < MAX_SNOOZE_ATTEMPTS;

  if (canSnooze) {
    const reminder = await one(
      `UPDATE reminder_events
          SET status = 'pending',
              due_at = now() + ($3 || ' minutes')::interval,
              responded_at = now(),
              response_note = COALESCE($4, response_note),
              attempts = attempts + 1
        WHERE id = $1 AND elder_id = $2
        RETURNING *`,
      [reminderId, elderId, SNOOZE_MINUTES, trimmedNote],
    );
    return { reminder, snoozedUntil: reminder?.due_at ?? null };
  }

  // Termasuk penundaan yang jatahnya habis: dibiarkan `snoozed` dengan waktu
  // lama, jadi sweep akan menandainya `missed` dan keluarga tetap tahu.
  const reminder = await one(
    `UPDATE reminder_events
        SET status = $3,
            responded_at = now(),
            response_note = COALESCE($4, response_note),
            attempts = attempts + 1
      WHERE id = $1 AND elder_id = $2
      RETURNING *`,
    [reminderId, elderId, status, trimmedNote],
  );

  return { reminder, snoozedUntil: null };
}
