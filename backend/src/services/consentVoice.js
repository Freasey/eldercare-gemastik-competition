/**
 * Consent lewat suara (PLAN §2.5).
 *
 * App lansia tidak punya UI, jadi izin tidak bisa diberikan lewat saklar 
 * asisten yang menanyakannya. Aturan yang disepakati: izin yang masih MATI
 * ditanyakan ulang **sekali sehari**; izin yang sudah menyala tidak pernah
 * diungkit lagi.
 *
 * Semua di file ini rule-based, tanpa LLM: jawabannya cuma ya/tidak, dan
 * keputusan sepenting izin privasi tidak boleh bergantung pada kuota Groq
 * atau pada model yang bisa salah tafsir.
 */
import { many, one } from '../db/pool.js';

/**
 * Izin yang boleh ditanyakan asisten, beserta kalimatnya.
 *
 * `always_listening` sengaja TIDAK ada di sini: wake-word belum dibangun
 * (PLAN §3), jadi menanyakan izin untuk fitur yang belum jalan sama saja
 * menjanjikan sesuatu yang tidak ada. Masukkan begitu fiturnya nyata.
 * `share_daily_summary`, `share_mood_signal`, dan `fall_detection` default
 * menyala sejak profil dibuat, jadi tidak pernah masuk antrean pertanyaan.
 */
export const ASKABLE_CONSENTS = {
  share_conversation_transcript: {
    question:
      'Oh ya, satu hal. Boleh catatan obrolan kita ini dibaca keluarga? Kalau tidak boleh juga tidak apa-apa.',
    granted: 'Baik, saya bagikan ke keluarga ya. Terima kasih.',
    denied: 'Baik, obrolan kita saya simpan sendiri. Keluarga hanya menerima ringkasannya.',
  },
};

/**
 * Izin yang perlu ditanyakan hari ini: masih mati DAN belum ditanyakan sejak
 * pergantian hari menurut jam lansia, bukan jam server.
 *
 * @returns {Promise<{key: string, question: string} | null>}
 */
export async function findConsentToAsk(elderId, timezone = 'Asia/Jakarta') {
  const keys = Object.keys(ASKABLE_CONSENTS);
  if (!keys.length) return null;

  const row = await one(
    `SELECT key FROM consents
      WHERE elder_id = $1
        AND key = ANY($2)
        AND granted = false
        AND (
          last_asked_at IS NULL
          OR (last_asked_at AT TIME ZONE $3)::date < (now() AT TIME ZONE $3)::date
        )
      ORDER BY last_asked_at ASC NULLS FIRST
      LIMIT 1`,
    [elderId, keys, timezone],
  );

  if (!row) return null;
  return { key: row.key, question: ASKABLE_CONSENTS[row.key].question };
}

/**
 * Tandai sudah ditanyakan. Dicatat saat PERTANYAAN diucapkan, bukan saat
 * dijawab kalau tidak, lansia yang diam atau menjawab ngalor-ngidul akan
 * ditanyai hal yang sama berulang kali dalam satu hari.
 */
export async function markConsentAsked(elderId, key) {
  await one(
    `UPDATE consents SET last_asked_at = now()
      WHERE elder_id = $1 AND key = $2 RETURNING id`,
    [elderId, key],
  );
}

/** Simpan jawabannya. Dipanggil hanya dari device lansia sendiri. */
export async function setConsent(elderId, key, granted) {
  return one(
    `INSERT INTO consents (elder_id, key, granted, last_asked_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (elder_id, key)
       DO UPDATE SET granted = EXCLUDED.granted, updated_at = now()
     RETURNING *`,
    [elderId, key, granted],
  );
}

/** Daftar consent + kapan terakhir ditanyakan, untuk ditampilkan app keluarga. */
export async function listConsents(elderId) {
  return many(
    'SELECT key, granted, updated_at, last_asked_at FROM consents WHERE elder_id = $1 ORDER BY key',
    [elderId],
  );
}

/**
 * Tafsirkan jawaban ya/tidak.
 *
 * Urutannya penting dan tidak boleh dibalik: "tidak boleh" mengandung kata
 * "boleh", dan "tidak apa-apa" justru berarti setuju. Penolakan tegas
 * karenanya dicek lebih dulu, penerimaan berikutnya, penolakan umum terakhir.
 *
 * @returns {'granted'|'denied'|'unclear'}
 */
export function interpretConsentReply(text) {
  const t = (text || '').toLowerCase();

  if (/(jangan|tidak boleh|nggak boleh|gak boleh|ndak boleh|tidak usah|nggak usah|gak usah|tidak mau|nggak mau|rahasia)/.test(t)) {
    return 'denied';
  }
  if (/\b(boleh|ya|iya|iyah|silakan|silahkan|oke|ok|setuju|monggo|gapapa|gak apa|nggak apa|tidak apa|bebas)\b/.test(t)) {
    return 'granted';
  }
  if (/\b(tidak|nggak|gak|ndak|belum|nanti dulu)\b/.test(t)) {
    return 'denied';
  }

  return 'unclear';
}
