/**
 * Aturan bahasa yang HARUS dikerjakan di HP, bukan di backend.
 *
 * Isinya sengaja dibatasi tiga hal, masing-masing dengan alasan yang jelas:
 *
 * 1. `bacaanDarurat` — kata "tolong" harus tertangkap sebelum teksnya dikirim
 *    ke mana pun. Menunggu jawaban server dulu berarti menunda keadaan darurat
 *    selama satu round-trip, dan gagal total kalau justru sedang tidak ada
 *    sinyal.
 * 2. `adalahPenutup` — mengakhiri sesi tidak punya endpoint penafsir; app
 *    yang memutuskan kapan berhenti mendengar.
 * 3. `bacaYaTidak` dan `bacaJawabanReminder` — dipakai saat OFFLINE, sebagai
 *    cerminan aturan yang sama di backend.
 *
 * PERINGATAN: `bacaJawabanReminder` adalah salinan
 * `backend/src/services/groq.js: interpretReminderReply`, dan `bacaYaTidak`
 * mengikuti urutan pengecekan `backend/src/services/consentVoice.js:
 * interpretConsentReply` (negatif diperiksa lebih dulu, karena "tidak boleh"
 * mengandung kata "boleh"). Kalau salah satunya diubah, ubah juga yang di sini
 * — kalau tidak, jawaban yang sama akan berarti berbeda tergantung ada sinyal
 * atau tidak. Selain saat offline, penafsiran tetap milik backend.
 */

/**
 * Bentuk sopan "tolong" — permintaan sehari-hari, bukan minta pertolongan.
 * Diperiksa lebih dulu supaya "tolong ulangi" tidak memanggil keluarga.
 */
const TOLONG_SOPAN =
  /tolong\s+(ulangi|ulang|bacakan|baca|ambilkan|ambil|bilang|katakan|sampaikan|ingatkan|matikan|nyalakan|besarkan|kecilkan|tutup|buka|tunggu|catat|kabari)/;

/** Kalimat yang menyiratkan keadaan gawat walau tanpa kata "tolong". */
const GAWAT =
  /(saya jatuh|aku jatuh|tidak bisa bangun|nggak bisa bangun|gak bisa bangun|sesak napas|sesak nafas|dada saya sakit|dada sakit sekali|nggak kuat|tidak kuat|panggilkan (anak|keluarga|dokter)|hubungi (anak|keluarga|dokter)|panggil ambulans)/;

/** Kata yang, kalau muncul bersama "tolong", menandakan ini bukan basa-basi. */
const PENDAMPING_DARURAT = /(sakit|jatuh|pusing|sesak|darah|bangun|kuat|bantu|cepat|dokter|ambulans)/;

/**
 * Apakah ucapan ini permintaan tolong yang sungguhan.
 *
 * Dibuat ketat karena "tolong" adalah kata paling sopan dalam bahasa
 * Indonesia — kalau setiap "tolong" memicu alur darurat, lansia akan ditanya
 * "mau saya hubungi keluarga?" sepanjang hari dan keluarganya berhenti
 * menganggap serius peringatan yang masuk.
 *
 * @param {string} teks
 */
export function bacaanDarurat(teks) {
  const t = (teks || '').toLowerCase().trim();
  if (!t) return false;

  if (GAWAT.test(t)) return true;
  if (!/\btolong\b/.test(t)) return false;
  if (TOLONG_SOPAN.test(t)) return false;

  // "Tolong" berdiri sendiri, diulang, atau bersama kata yang menandakan
  // keadaan gawat.
  if (/^tolong[\s!.,]*$/.test(t)) return true;
  if ((t.match(/\btolong\b/g) || []).length >= 2) return true;
  return PENDAMPING_DARURAT.test(t);
}

/**
 * Apakah lansia sedang menutup percakapan.
 *
 * Hanya diperiksa pada giliran percakapan bebas. Pada giliran jawaban obat,
 * "sudah" berarti obatnya sudah diminum — bukan tanda mau berhenti bicara.
 */
export function adalahPenutup(teks) {
  const t = (teks || '').toLowerCase().trim();
  return /(sudah dulu|cukup dulu|cukup segitu|segitu dulu|sampai jumpa|sampai nanti|dadah|daah|terima kasih|makasih|matur nuwun|sudah selesai|selesai saja|mau istirahat|mau tidur)/.test(
    t,
  );
}

/**
 * Ya / tidak. Dipakai untuk konfirmasi darurat, dan saat offline.
 * Urutan pengecekan mengikuti backend: negatif dulu.
 *
 * @returns {'ya'|'tidak'|'tidak jelas'}
 */
export function bacaYaTidak(teks) {
  const t = (teks || '').toLowerCase();

  if (/(jangan|tidak usah|nggak usah|gak usah|tidak perlu|nggak perlu|tidak mau|nggak mau|belum perlu)/.test(t)) {
    return 'tidak';
  }
  if (/\b(ya|iya|iyah|boleh|silakan|silahkan|oke|ok|tolong|betul|benar|mau|setuju)\b/.test(t)) return 'ya';
  if (/\b(tidak|nggak|gak|ndak|belum|bukan)\b/.test(t)) return 'tidak';

  return 'tidak jelas';
}

/**
 * Salinan `interpretReminderReply` milik backend, dipakai HANYA saat offline.
 *
 * @returns {'confirmed'|'snoozed'|'skipped'|'unclear'}
 */
export function bacaJawabanReminder(teks) {
  const t = (teks || '').toLowerCase();
  if (/\b(sudah|udah|dah|barusan|tadi minum|sudah minum|beres|oke sudah)\b/.test(t)) return 'confirmed';
  if (/\b(nanti|sebentar|bentar|habis ini|tunggu|lagi.*(makan|sholat|mandi))\b/.test(t)) return 'snoozed';
  if (/\b(tidak|nggak|gak|ndak|belum|lupa|habis obatnya|obatnya habis)\b/.test(t)) return 'skipped';
  return 'unclear';
}
