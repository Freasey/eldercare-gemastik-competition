/**
 * Sisi "dengar" — STT bawaan OS lewat expo-speech-recognition.
 *
 * SELURUH ketergantungan pada library STT berhenti di file ini. Kalau nanti
 * pindah ke Whisper (PLAN §4 menyebutnya sebagai fallback saat STT device
 * gagal menangkap ucapan lansia), yang diganti cukup isi file ini — loop
 * percakapan di `useVoiceSession.js` tidak perlu tahu bedanya.
 */
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

/**
 * Jeda diam yang dianggap "sudah selesai bicara". Bawaan Android sekitar 1
 * detik — terlalu cepat untuk lansia, yang sering berhenti di tengah kalimat
 * untuk mengambil napas dan akan terpotong terus-menerus.
 */
const JEDA_DIAM_MS = 2500;

/** Batas satu giliran mendengar, supaya mikrofon tidak menyala selamanya. */
const BATAS_DENGAR_MS = 20000;

/** Minta izin mikrofon. Satu-satunya dialog yang harus diketuk lansia. */
export async function requestMicPermission() {
  const hasil = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return hasil.granted === true;
}

/**
 * Dengarkan satu giliran bicara.
 *
 * @param {{onPartial?: (teks: string) => void}} [opts]
 *   `onPartial` dipakai untuk live caption — lansia melihat kalimatnya muncul
 *   sambil bicara, jadi tahu app benar-benar mendengar (PLAN §2.6).
 * @returns {Promise<{text: string|null, error: string|null}>}
 *   `text` null berarti tidak ada yang terdengar — pemanggil memperlakukannya
 *   sebagai diam, bukan sebagai kesalahan.
 */
export function listenOnce({ onPartial } = {}) {
  return new Promise((resolve) => {
    const langganan = [];
    let selesai = false;
    let terakhir = '';

    const beres = (hasil) => {
      if (selesai) return;
      selesai = true;
      clearTimeout(pengaman);
      langganan.forEach((s) => s?.remove?.());
      resolve(hasil);
    };

    const pengaman = setTimeout(() => {
      ExpoSpeechRecognitionModule.abort();
      beres({ text: terakhir.trim() || null, error: null });
    }, BATAS_DENGAR_MS);

    langganan.push(
      ExpoSpeechRecognitionModule.addListener('result', (event) => {
        const teks = event.results?.[0]?.transcript ?? '';
        terakhir = teks;
        if (!event.isFinal) return onPartial?.(teks);
        beres({ text: teks.trim() || null, error: null });
      }),
    );

    langganan.push(
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        // "no-speech" bukan kegagalan: lansia memang sedang tidak menjawab.
        const diam = event.error === 'no-speech' || event.error === 'aborted';
        beres({ text: null, error: diam ? null : event.error });
      }),
    );

    // Jaring pengaman kalau sesi berakhir tanpa result maupun error.
    langganan.push(
      ExpoSpeechRecognitionModule.addListener('end', () => {
        beres({ text: terakhir.trim() || null, error: null });
      }),
    );

    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'id-ID',
        interimResults: true,
        continuous: false,
        // Dibiarkan boleh lewat jaringan: pengenalan on-device Bahasa Indonesia
        // belum tentu terpasang, dan memaksanya membuat STT gagal total di HP
        // yang modelnya belum diunduh.
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: JEDA_DIAM_MS,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: JEDA_DIAM_MS,
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 2000,
        },
      });
    } catch (err) {
      beres({ text: null, error: err.message });
    }
  });
}

/** Batalkan pendengaran yang sedang berjalan (app ditutup, sesi dihentikan). */
export function stopListening() {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // Tidak sedang mendengar — tidak ada yang perlu dibatalkan.
  }
}
