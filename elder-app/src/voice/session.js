/**
 * Sesi percakapan satu bentuk, dua sumber.
 *
 * Loop di `useVoiceSession.js` tidak boleh tahu apakah sedang online atau
 * tidak. Karena itu keduanya dibungkus jadi objek yang sama:
 *
 *   { offline, open(), turn(jawaban), end(alasan) }
 *
 * Sesi online hanya meneruskan ke backend: prioritas bicara, penafsiran
 * jawaban, dan aturan penundaan semuanya milik server (PLAN §4, "rule vs AI").
 * Sesi offline adalah versi yang jauh lebih kecil hanya sanggup menagih
 * pengingat dari cache dan mengantre jawabannya (PLAN §2.6).
 */
import { endSession, openSession, sendTurn } from '../api/caretaker.js';
import { isOffline, isRevoked } from '../api/client.js';
import { loadReminders } from '../lib/store.js';
import { enqueueReminderReply } from '../lib/outbox.js';
import { bacaJawabanReminder } from './interpret.js';
import { snoozeLokal } from '../notifications/local.js';

/** Perangkat sudah tidak berhak keluarga menekan "putuskan perangkat". */
export class DeviceRevokedError extends Error {}

/**
 * Buka sesi. Mencoba online dulu, jatuh ke offline kalau tidak ada sambungan.
 *
 * @param {{elderId: number, trigger: 'button'|'scheduled'|'wake_word'|'emergency'}} args
 */
export async function mulaiSesi({ elderId, trigger }) {
  try {
    const dibuka = await openSession(elderId, trigger);
    return sesiOnline(elderId, dibuka);
  } catch (err) {
    if (isRevoked(err)) throw new DeviceRevokedError(err.message);
    if (isOffline(err)) return sesiOffline(elderId);
    throw err;
  }
}

/* ---------------- online ---------------- */

function sesiOnline(elderId, dibuka) {
  const { conversationId } = dibuka;

  return {
    offline: false,

    open: async () => ({
      speech: dibuka.speech,
      expects: dibuka.expects,
      reminderId: dibuka.reminderId,
      consentKey: dibuka.consentKey,
    }),

    /**
     * Satu giliran. `expects`/`reminderId`/`consentKey` dikirim balik apa
     * adanya backend yang memegang state percakapan, app hanya kurir.
     */
    turn: async ({ text, expects, reminderId, consentKey }) => {
      const hasil = await sendTurn(elderId, conversationId, {
        text,
        expects,
        reminderId: reminderId ?? undefined,
        consentKey: consentKey ?? undefined,
      });

      return {
        speech: hasil.speech,
        expects: hasil.expects,
        consentKey: hasil.consentKey,
        // Backend tidak mengembalikan reminderId lagi. Selama masih menunggu
        // jawaban obat yang sama ("saya kurang menangkap, sudah atau belum?"),
        // id-nya harus tetap dibawa app.
        reminderId: hasil.expects === 'confirmation' ? reminderId : null,
        selesai: false,
      };
    },

    end: (alasan) => endSession(elderId, conversationId, alasan).catch(() => {}),
  };
}

/* ---------------- offline ---------------- */

/** Sejauh mana sebuah pengingat masih pantas ditagih saat app dibuka. */
const TAGIH_SEJAK_MENIT = 120;
const TAGIH_SAMPAI_MENIT = 15;

/**
 * Sesi tanpa internet. Sengaja tidak berpura-pura bisa mengobrol: tanpa Groq
 * tidak ada percakapan bebas, dan menjanjikannya justru membuat lansia merasa
 * tidak didengar. Yang tersisa menagih obat dan mencatat jawabannya 
 * justru bagian yang paling tidak boleh hilang saat sinyal mati.
 */
function sesiOffline(elderId) {
  let target = null;

  return {
    offline: true,

    open: async () => {
      target = await pengingatYangPantasDitagih();

      if (!target) {
        return {
          speech:
            'Maaf, sekarang saya sedang tidak terhubung ke internet, jadi belum bisa mengobrol. ' +
            'Pengingatnya tetap saya bunyikan seperti biasa.',
          expects: 'free',
          selesai: true,
        };
      }

      return {
        speech: `Sekarang waktunya ${subjek(target.title)}. Sudah atau belum?`,
        expects: 'confirmation',
        reminderId: target.id,
      };
    },

    turn: async ({ text, expects }) => {
      if (expects !== 'confirmation' || !target) {
        return { speech: 'Baik. Nanti kita lanjutkan lagi ya.', expects: 'free', selesai: true };
      }

      const maksud = bacaJawabanReminder(text);

      if (maksud === 'unclear') {
        // Sekali saja diulang. Kalau tetap tidak jelas, jawaban berikutnya
        // masuk ke cabang di bawah dan sesi ditutup tanpa mencatat apa pun,
        // supaya sweep di backend tetap menandainya terlewat apa adanya.
        return {
          speech: 'Maaf, saya kurang menangkap. Obatnya sudah diminum atau belum?',
          expects: 'confirmation',
          reminderId: target.id,
        };
      }

      await enqueueReminderReply({ elderId, reminderId: target.id, status: maksud, note: text });

      if (maksud === 'snoozed') {
        // Tanpa ini, "nanti ya" saat offline tidak pernah kembali menagih:
        // penundaan sungguhannya baru terjadi setelah antrean terkirim.
        await snoozeLokal(target);
        return {
          speech: 'Baik, nanti saya ingatkan lagi lima belas menit lagi.',
          expects: 'free',
          selesai: true,
        };
      }

      return {
        speech:
          maksud === 'confirmed'
            ? 'Bagus, terima kasih sudah memberi tahu. Saya catat ya.'
            : 'Baik, saya catat belum diminum. Nanti saya kabari keluarga ya.',
        expects: 'free',
        selesai: true,
      };
    },

    end: async () => {},
  };
}

/** Pengingat dari cache yang jam tagihnya sedang berlaku. */
async function pengingatYangPantasDitagih() {
  const sekarang = Date.now();
  const daftar = await loadReminders();

  return (
    daftar
      .filter((r) => ['pending', 'spoken', 'snoozed'].includes(r.status))
      .map((r) => ({ ...r, telat: (sekarang - new Date(r.dueAt).getTime()) / 60000 }))
      .filter((r) => r.telat <= TAGIH_SEJAK_MENIT && r.telat >= -TAGIH_SAMPAI_MENIT)
      .sort((a, b) => b.isCritical - a.isCritical || b.telat - a.telat)[0] ?? null
  );
}

/**
 * Salinan `subject()` di `backend/src/services/contextEngine.js`: judul jadwal
 * ditulis bebas oleh keluarga dan sering sudah memuat "waktunya", sehingga
 * TTS akan membacakan "waktunya waktunya sholat maghrib".
 */
function subjek(title) {
  const bersih = String(title).trim().replace(/^(sudah\s+)?(waktunya|saatnya|jadwal|jadwalnya)\s+/i, '');
  return bersih.charAt(0).toLowerCase() + bersih.slice(1);
}
