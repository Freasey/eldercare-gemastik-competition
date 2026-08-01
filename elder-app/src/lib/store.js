/**
 * Penyimpanan lokal non-rahasia: profil lansia, cache jadwal, dan antrean
 * jawaban yang belum terkirim.
 *
 * Pakai `expo-sqlite/kv-store`, bukan SecureStore: isinya bukan kredensial
 * (token tetap di SecureStore, lihat `api/client.js`), dan SecureStore Android
 * dibatasi 2 KB per entri — cache jadwal dua hari bisa melewatinya.
 */
import Storage from 'expo-sqlite/kv-store';

const ELDER_KEY = 'caretaker.elder.profile';
const REMINDERS_KEY = 'caretaker.elder.reminders';
const OUTBOX_KEY = 'caretaker.elder.outbox';

async function readJson(key, fallback) {
  try {
    const raw = await Storage.getItemAsync(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    // Data lokal yang rusak tidak boleh membuat app gagal berbicara.
    return fallback;
  }
}

const writeJson = (key, value) => Storage.setItemAsync(key, JSON.stringify(value));

/* ---------------- profil lansia ---------------- */

/** Disimpan supaya app tahu `elderId` dan namanya tanpa memanggil backend. */
export const loadElder = () => readJson(ELDER_KEY, null);
export const saveElder = (elder) =>
  writeJson(ELDER_KEY, { id: elder.id, name: elder.name, timezone: elder.timezone });
export const clearElder = () => Storage.removeItemAsync(ELDER_KEY);

/* ---------------- cache jadwal ---------------- */

/**
 * Hanya kolom yang benar-benar dipakai saat offline. Menyimpan baris utuh
 * hanya memperbesar cache tanpa menambah kemampuan apa pun.
 */
export const saveReminders = (reminders) =>
  writeJson(
    REMINDERS_KEY,
    reminders.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      isCritical: r.is_critical,
      dueAt: r.due_at,
      status: r.status,
    })),
  );

export const loadReminders = () => readJson(REMINDERS_KEY, []);

/* ---------------- antrean kirim ---------------- */

export const loadOutbox = () => readJson(OUTBOX_KEY, []);
export const saveOutbox = (items) => writeJson(OUTBOX_KEY, items);
