/**
 * Wake word — memulai percakapan tanpa menyentuh apa pun (PLAN §2.5, §2.6).
 *
 * **Batas yang harus jujur disebut: ini hanya bekerja selagi app terbuka di
 * layar.** Wake word yang benar-benar selalu siap butuh model kata-kunci yang
 * berjalan di foreground service, dan itu pekerjaan native tersendiri. Yang ada
 * di sini memakai pengenal suara bawaan Android dalam mode `continuous`, jadi
 * berhenti begitu app masuk latar belakang.
 *
 * Dalam pemakaian yang dituju, keterbatasan itu tidak sebesar kelihatannya: app
 * lansia memang dirancang untuk terbuka terus dan layarnya dijaga tetap menyala
 * (`useKeepAwake` di SessionScreen). Yang diselesaikan fitur ini adalah "HP
 * tergeletak di meja, app terbuka, tapi lansia harus bangkit untuk menyentuhnya".
 *
 * Karena itu pula izin `always_listening` TETAP belum ditanyakan sebagai
 * consent: mikrofonnya hanya hidup selama layar sesi terbuka dan berhenti
 * seketika saat percakapan mulai — bukan "selalu mendengarkan" dalam arti yang
 * dijanjikan nama izin itu.
 */
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

/**
 * Kata pembangun. Dibuat beberapa varian karena pengenal bawaan sering menulis
 * ulang kata yang bunyinya mirip, dan lansia tidak akan mengucapkannya dengan
 * jeda yang persis sama setiap kali.
 *
 * Sengaja BUKAN kata yang lazim muncul dalam percakapan biasa: sapaan sehari-
 * hari seperti "halo" saja akan membuka sesi setiap kali ada tamu datang.
 */
const POLA_BANGUN = [
  /\bhalo\s+teman\b/i,
  /\bhai\s+teman\b/i,
  /\bteman\s+bicara\b/i,
  /\bhalo\s+asisten\b/i,
];

/**
 * Frasa yang diberikan ke pengenal sebagai konteks. Ini menaikkan peluang
 * "teman bicara" tertulis utuh, bukan jadi "teman bicaranya".
 */
const KONTEKS = ['halo teman', 'teman bicara', 'halo asisten'];

/**
 * Mulai ulang otomatis: mode continuous pun berhenti sendiri di sebagian HP
 * setelah beberapa menit sunyi.
 */
const JEDA_MULAI_ULANG_MS = 800;

export function adalahKataBangun(teks) {
  const bersih = (teks || '').toLowerCase().trim();
  return POLA_BANGUN.some((pola) => pola.test(bersih));
}

/**
 * Dengarkan kata pembangun sampai dihentikan.
 *
 * @param {() => void} onBangun dipanggil sekali; pemanggil bertanggung jawab
 *   menghentikan pemantauan sebelum memulai sesi — mikrofon tidak bisa dipakai
 *   dua-duanya sekaligus.
 * @returns {() => void} penghenti
 */
export function pantauKataBangun(onBangun) {
  let berhenti = false;
  let jadwalUlang = null;
  const langganan = [];

  const bersihkan = () => {
    langganan.forEach((s) => s?.remove?.());
    langganan.length = 0;
    clearTimeout(jadwalUlang);
  };

  const mulaiUlang = () => {
    if (berhenti) return;
    clearTimeout(jadwalUlang);
    jadwalUlang = setTimeout(jalankan, JEDA_MULAI_ULANG_MS);
  };

  const jalankan = () => {
    if (berhenti) return;
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'id-ID',
        interimResults: true,
        continuous: true,
        // Berbeda dari `listenOnce`: di sini pengenalan on-device DIUTAMAKAN.
        // Mengirim aliran mikrofon terus-menerus ke server hanya untuk menunggu
        // satu kata adalah pemborosan kuota sekaligus masalah privasi. Kalau
        // model on-device belum ada, pengenal akan menolak start dan wake word
        // mati — itu hasil yang benar, bukan yang harus diakali.
        requiresOnDeviceRecognition: true,
        addsPunctuation: false,
        contextualStrings: KONTEKS,
      });
    } catch {
      mulaiUlang();
    }
  };

  langganan.push(
    ExpoSpeechRecognitionModule.addListener('result', (event) => {
      if (berhenti) return;
      const teks = event.results?.[0]?.transcript ?? '';
      if (!adalahKataBangun(teks)) return;

      // Hentikan diri sendiri lebih dulu: sesi percakapan butuh mikrofon yang
      // sama, dan pengenal yang masih jalan akan merebutnya.
      berhenti = true;
      bersihkan();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // sudah berhenti
      }
      onBangun();
    }),
  );

  langganan.push(ExpoSpeechRecognitionModule.addListener('end', mulaiUlang));
  langganan.push(
    ExpoSpeechRecognitionModule.addListener('error', (event) => {
      // `no-speech` wajar dan sering: tidak ada yang bicara. Yang lain dicatat
      // supaya kegagalan terus-menerus (mis. model on-device tidak ada) bisa
      // terlihat di log, bukan hilang diam-diam.
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[wake] pengenal berhenti:', event.error);
      }
      mulaiUlang();
    }),
  );

  jalankan();

  return () => {
    berhenti = true;
    bersihkan();
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // tidak sedang jalan
    }
  };
}
