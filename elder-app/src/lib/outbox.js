/**
 * Antrean jawaban yang belum sempat terkirim (PLAN §2.6).
 *
 * Yang diantrekan hanya jawaban atas reminder. Giliran percakapan bebas
 * sengaja TIDAK diantrekan: balasannya datang dari LLM saat itu juga, jadi
 * mengirimnya lima jam kemudian hanya akan menghasilkan jawaban atas
 * pertanyaan yang sudah lama lewat.
 *
 * Urutan tetap dijaga (FIFO) supaya "nanti ya" lalu "sudah diminum" tidak
 * terbalik jadi menunda obat yang sudah diminum.
 */
import { respondReminder } from '../api/caretaker.js';
import { isOffline } from '../api/client.js';
import { loadOutbox, saveOutbox } from './store.js';

/** Batas umur antrean. Jawaban obat kemarin sudah tidak ada gunanya dikirim. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * @param {{elderId: number, reminderId: number,
 *          status: 'confirmed'|'snoozed'|'skipped', note?: string}} item
 */
export async function enqueueReminderReply(item) {
  const antrean = await loadOutbox();
  antrean.push({ ...item, queuedAt: Date.now() });
  await saveOutbox(antrean);
}

/**
 * Kirim semua yang tertunda. Dipanggil saat app dibuka dan setiap kali sebuah
 * permintaan online berhasil jadi tidak perlu mendeteksi status jaringan.
 *
 * @returns {Promise<{sent: number, left: number}>}
 */
export async function flushOutbox() {
  const antrean = await loadOutbox();
  if (antrean.length === 0) return { sent: 0, left: 0 };

  const sisa = [];
  let terkirim = 0;

  for (const [i, item] of antrean.entries()) {
    if (Date.now() - item.queuedAt > MAX_AGE_MS) continue;

    try {
      await respondReminder(item.elderId, item.reminderId, {
        status: item.status,
        note: item.note,
      });
      terkirim += 1;
    } catch (err) {
      if (isOffline(err)) {
        // Masih offline hentikan di sini supaya urutannya tidak teracak.
        sisa.push(...antrean.slice(i));
        break;
      }
      // Ditolak backend (mis. reminder sudah dijawab dari app keluarga).
      // Mencoba lagi tidak akan pernah berhasil, jadi dibuang saja.
    }
  }

  await saveOutbox(sisa);
  return { sent: terkirim, left: sisa.length };
}
