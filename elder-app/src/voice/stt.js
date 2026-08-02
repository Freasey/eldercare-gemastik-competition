/**
 * Sisi "dengar" — STT bawaan OS lewat expo-speech-recognition, dengan fallback
 * Groq Whisper lewat backend (PLAN §4).
 *
 * SELURUH ketergantungan pada library STT berhenti di file ini. Pemanggil
 * (`useVoiceSession.js`) tidak tahu — dan tidak boleh tahu — teks yang
 * diterimanya berasal dari pengenal bawaan HP atau dari Whisper.
 *
 * **Kenapa fallback-nya memakai rekaman yang sama, bukan merekam ulang.**
 * `recordingOptions.persist` membuat pengenal bawaan menyimpan audio yang
 * barusan didengarnya ke file. Kalau hasilnya kosong, file itu yang dikirim ke
 * backend. Alternatifnya — meminta lansia mengulang lalu merekam sendiri —
 * berarti menyuruh orang yang sudah bicara sekali untuk bicara lagi karena
 * kesalahan yang bukan miliknya, dan menggandakan waktu tunggu.
 *
 * Konsekuensi yang harus diingat: fallback ini butuh internet dan menghabiskan
 * kuota Groq. Karena itu ia hanya dipakai saat pengenal bawaan benar-benar
 * gagal, bukan saat lansia memang diam.
 */
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { File } from 'expo-file-system';
import { transcribeAudio } from '../api/caretaker.js';

/**
 * Jeda diam yang dianggap "sudah selesai bicara". Bawaan Android sekitar 1
 * detik — terlalu cepat untuk lansia, yang sering berhenti di tengah kalimat
 * untuk mengambil napas dan akan terpotong terus-menerus.
 */
const JEDA_DIAM_MS = 2500;

/** Batas satu giliran mendengar, supaya mikrofon tidak menyala selamanya. */
const BATAS_DENGAR_MS = 20000;

/**
 * Rekaman di bawah ukuran ini dianggap benar-benar sunyi, bukan "gagal
 * dikenali". Header WAV saja sudah 44 byte; sepersekian detik ruang kosong
 * tidak layak dikirim ke Whisper hanya untuk dijawab string kosong.
 */
const MIN_BYTE_LAYAK_KIRIM = 8000;

/**
 * Konteks untuk Whisper. Tanpa ini, kata yang sering diucapkan lansia dalam
 * percakapan ini ("obat", "sudah minum", "tolong") kadang tertulis jadi kata
 * lain yang bunyinya mirip — dan penafsiran jawaban obat di backend membaca
 * teks itu apa adanya.
 */
const PETUNJUK_WHISPER =
  'Percakapan dengan lansia Indonesia tentang minum obat, makan, sholat, dan kabar hari ini. ' +
  'Kata yang sering muncul: sudah, belum, nanti, tolong, obat, pusing, capek.';

/** Minta izin mikrofon. Satu-satunya dialog yang harus diketuk lansia. */
export async function requestMicPermission() {
  const hasil = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return hasil.granted === true;
}

/**
 * Dengarkan satu giliran bicara.
 *
 * @param {{onPartial?: (teks: string) => void, fallback?: boolean}} [opts]
 *   `onPartial` dipakai untuk live caption — lansia melihat kalimatnya muncul
 *   sambil bicara, jadi tahu app benar-benar mendengar (PLAN §2.6).
 *   `fallback` bisa dimatikan untuk pemakaian yang tidak boleh menunggu
 *   jaringan, mis. pendeteksi wake word.
 * @returns {Promise<{text: string|null, error: string|null, sumber: 'device'|'whisper'|null}>}
 *   `text` null berarti tidak ada yang terdengar — pemanggil memperlakukannya
 *   sebagai diam, bukan sebagai kesalahan.
 */
export async function listenOnce({ onPartial, fallback = true } = {}) {
  const hasil = await dengarSekali({ onPartial });

  // Rekaman dibuang di semua jalur keluar. Tanpa ini, HP lansia perlahan penuh
  // oleh potongan wav yang tidak pernah dibaca siapa pun.
  const bersihkan = () => hapusBerkas(hasil.uri);

  if (hasil.text) {
    bersihkan();
    return { text: hasil.text, error: null, sumber: 'device' };
  }

  /**
   * Gerbang paling penting di file ini.
   *
   * Lansia yang memang tidak menjawab adalah kejadian yang WAJAR dan sering —
   * loop percakapan memperlakukannya sebagai "diam" dan menutup sesi dengan
   * sopan. Mengirim rekaman sunyi itu ke Whisper berarti membayar kuota dan
   * beberapa detik penantian untuk mendapat jawaban yang sudah kita tahu:
   * kosong.
   *
   * `speechstart` adalah pembedanya — pengenal bawaan menyalakannya begitu ada
   * yang terdengar seperti ucapan. Ada suara tapi tidak ada teks berarti
   * pengenalnya yang gagal, dan itulah satu-satunya keadaan yang pantas
   * dilempar ke Whisper. `nomatch` dan error keras diperlakukan sama.
   */
  const pengenalGagal = hasil.adaSuara || hasil.nomatch || Boolean(hasil.error);

  if (!fallback || !pengenalGagal || !hasil.uri || !layakDikirim(hasil.uri)) {
    bersihkan();
    return { text: null, error: hasil.error, sumber: null };
  }

  try {
    const base64 = await new File(hasil.uri).base64();
    const { text } = await transcribeAudio({
      audioBase64: base64,
      // `persist` menghasilkan WAV di Android.
      mimeType: 'audio/wav',
      filename: 'ucapan.wav',
      language: 'id',
      prompt: PETUNJUK_WHISPER,
    });
    return { text: text?.trim() || null, error: null, sumber: text?.trim() ? 'whisper' : null };
  } catch (err) {
    // Offline atau kuota habis. Kembalikan keadaan seperti sebelum ada
    // fallback — sesi tetap boleh lanjut, tidak boleh berhenti karena ini.
    return { text: null, error: hasil.error ?? err.message, sumber: null };
  } finally {
    bersihkan();
  }
}

/** Satu putaran pengenal bawaan. Mengembalikan teks DAN path rekamannya. */
function dengarSekali({ onPartial } = {}) {
  return new Promise((resolve) => {
    const langganan = [];
    let selesai = false;
    let terakhir = '';
    let uri = null;
    let adaSuara = false;
    let nomatch = false;

    const beres = (hasil) => {
      if (selesai) return;
      selesai = true;
      clearTimeout(pengaman);
      langganan.forEach((s) => s?.remove?.());
      resolve({ ...hasil, uri, adaSuara, nomatch });
    };

    const pengaman = setTimeout(() => {
      ExpoSpeechRecognitionModule.abort();
      beres({ text: terakhir.trim() || null, error: null });
    }, BATAS_DENGAR_MS);

    // `audioend` membawa path rekaman dan dijamin datang setelah berkasnya
    // selesai ditulis — jangan membacanya dari `audiostart`.
    langganan.push(
      ExpoSpeechRecognitionModule.addListener('audioend', (event) => {
        uri = event.uri ?? null;
      }),
    );

    // Penanda "ada yang terdengar seperti ucapan". Inilah yang membedakan
    // lansia yang diam dari lansia yang bicara tapi tidak terkenali.
    langganan.push(
      ExpoSpeechRecognitionModule.addListener('speechstart', () => {
        adaSuara = true;
      }),
    );

    langganan.push(
      ExpoSpeechRecognitionModule.addListener('nomatch', () => {
        nomatch = true;
      }),
    );

    langganan.push(
      ExpoSpeechRecognitionModule.addListener('result', (event) => {
        const teks = event.results?.[0]?.transcript ?? '';
        terakhir = teks;
        // Hasil final sengaja TIDAK langsung menutup promise. `audioend`
        // menyusul beberapa milidetik kemudian, dan tanpa menunggunya `uri`
        // masih null sehingga fallback tidak punya audio untuk dikirim.
        // Penutupnya `end`, yang datang segera sesudah keduanya.
        if (!event.isFinal) onPartial?.(teks);
      }),
    );

    langganan.push(
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        // "no-speech" bukan kegagalan: lansia memang sedang tidak menjawab.
        const diam = event.error === 'no-speech' || event.error === 'aborted';
        beres({ text: terakhir.trim() || null, error: diam ? null : event.error });
      }),
    );

    // `end` adalah titik selesai yang sebenarnya: pada saat ini hasil final dan
    // `audioend` keduanya sudah lewat.
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
        // Inilah yang membuat fallback Whisper mungkin tanpa merekam dua kali.
        recordingOptions: { persist: true },
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

function layakDikirim(uri) {
  try {
    const berkas = new File(uri);
    return berkas.exists && (berkas.size ?? 0) >= MIN_BYTE_LAYAK_KIRIM;
  } catch {
    return false;
  }
}

function hapusBerkas(uri) {
  if (!uri) return;
  try {
    const berkas = new File(uri);
    if (berkas.exists) berkas.delete();
  } catch {
    // Berkas cache — kalau gagal dihapus, Android yang akan membersihkannya.
  }
}

/** Batalkan pendengaran yang sedang berjalan (app ditutup, sesi dihentikan). */
export function stopListening() {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // Tidak sedang mendengar — tidak ada yang perlu dibatalkan.
  }
}
