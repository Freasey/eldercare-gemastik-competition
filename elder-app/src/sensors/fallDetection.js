/**
 * Deteksi jatuh lewat accelerometer (PLAN §2.4 backend sudah lama menerima
 * `triggerType: 'fall_detection'`, sensornya yang belum ada).
 *
 * **Tiga tahap, bukan satu ambang batas.** Mendeteksi "guncangan kuat" saja
 * akan berbunyi setiap kali HP ditaruh di meja atau masuk saku. Yang dicari
 * adalah urutan yang khas jatuh:
 *
 *   1. jatuh bebas  percepatan total mendekati 0 g (HP ikut jatuh)
 *   2. benturan     lonjakan tajam saat menyentuh lantai
 *   3. diam         tidak banyak bergerak sesudahnya
 *
 * Tahap ketiga yang paling banyak membuang alarm palsu: HP yang dilempar ke
 * kasur juga melewati tahap 1 dan 2, tapi orang yang menaruhnya biasanya
 * langsung memindahkannya lagi. Orang yang benar-benar jatuh tidak.
 *
 * Deteksi ini TIDAK menggantikan konfirmasi suara. Semua yang lolos ke sini
 * masih ditanyai "Ibu baik-baik saja?" lebih dulu, dan pemanggilan keluarga
 * baru terjadi kalau jawabannya bukan "tidak" (lihat `voice/useVoiceSession.js`).
 * Ambang di bawah karenanya sengaja dibuat agak longgar: melewatkan jatuh
 * sungguhan jauh lebih mahal daripada satu pertanyaan yang tidak perlu.
 */
import { Accelerometer } from 'expo-sensors';

/** 50 Hz. Cukup untuk menangkap benturan yang lamanya ~50-100 ms. */
const INTERVAL_MS = 20;

/** Di bawah ini dianggap jatuh bebas. 1 g = diam di atas meja. */
const AMBANG_JATUH_BEBAS = 0.45;

/** Di atas ini dianggap benturan. */
const AMBANG_BENTURAN = 2.4;

/** Benturan harus datang secepat ini setelah jatuh bebas. */
const JEDA_MAKS_BENTURAN_MS = 1200;

/** Lama pengamatan "diam" setelah benturan. */
const DURASI_DIAM_MS = 2500;

/** Selisih dari 1 g yang masih dianggap tidak bergerak. */
const TOLERANSI_DIAM = 0.28;

/**
 * Berapa lama pendeteksi tidur setelah sekali berbunyi. Tanpa ini, satu
 * peristiwa jatuh memicu pertanyaan berkali-kali sementara lansianya sedang
 * berusaha menjawab yang pertama.
 */
const JEDA_ANTAR_DETEKSI_MS = 60_000;

/**
 * @param {(detail: string) => void} onJatuh dipanggil sekali per peristiwa
 * @returns {() => void} penghenti
 */
export function pantauJatuh(onJatuh) {
  let langganan = null;
  let tahap = 'menunggu'; // menunggu | jatuhBebas | mengamatiDiam
  let waktuJatuhBebas = 0;
  let waktuBenturan = 0;
  let puncakBenturan = 0;
  let bergerakSaatDiam = false;
  let tidurSampai = 0;

  Accelerometer.setUpdateInterval(INTERVAL_MS);

  langganan = Accelerometer.addListener(({ x, y, z }) => {
    const sekarang = Date.now();
    if (sekarang < tidurSampai) return;

    // expo-sensors memberi nilai dalam satuan g, jadi besaran vektor ini
    // langsung bisa dibandingkan dengan 1 g tanpa konversi.
    const besaran = Math.sqrt(x * x + y * y + z * z);

    if (tahap === 'menunggu') {
      if (besaran < AMBANG_JATUH_BEBAS) {
        tahap = 'jatuhBebas';
        waktuJatuhBebas = sekarang;
      }
      return;
    }

    if (tahap === 'jatuhBebas') {
      // Tidak ada benturan yang menyusul kemungkinan besar cuma HP yang
      // diayun atau diturunkan cepat.
      if (sekarang - waktuJatuhBebas > JEDA_MAKS_BENTURAN_MS) {
        tahap = 'menunggu';
        return;
      }
      if (besaran > AMBANG_BENTURAN) {
        tahap = 'mengamatiDiam';
        waktuBenturan = sekarang;
        puncakBenturan = besaran;
        bergerakSaatDiam = false;
      }
      return;
    }

    // tahap === 'mengamatiDiam'
    if (Math.abs(besaran - 1) > TOLERANSI_DIAM) bergerakSaatDiam = true;

    if (sekarang - waktuBenturan < DURASI_DIAM_MS) return;

    if (bergerakSaatDiam) {
      // Ada benturan, tapi sesudahnya banyak bergerak. Ini pola HP jatuh dari
      // tangan lalu dipungut, bukan orang yang tergeletak.
      tahap = 'menunggu';
      return;
    }

    tahap = 'menunggu';
    tidurSampai = sekarang + JEDA_ANTAR_DETEKSI_MS;
    onJatuh(
      `Terdeteksi pola jatuh dari sensor HP: benturan ${puncakBenturan.toFixed(1)}g lalu tidak ada gerakan selama ${Math.round(DURASI_DIAM_MS / 1000)} detik.`,
    );
  });

  return () => {
    langganan?.remove();
    langganan = null;
  };
}

/** Benar kalau HP ini punya accelerometer yang bisa dipakai. */
export async function sensorTersedia() {
  try {
    return await Accelerometer.isAvailableAsync();
  } catch {
    return false;
  }
}
