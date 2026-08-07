/**
 * Token warna, bentuk, dan huruf.
 *
 * Diambil dari redesign "Elda Companion" (prototipe Lovable). Prototipe itu
 * menulis warnanya dalam `oklch()`, yang TIDAK dikenal React Native, jadi
 * nilainya di sini adalah hasil konversi ke sRGB nilai oklch aslinya
 * dicantumkan sebagai komentar supaya bisa dilacak balik ke prototipe.
 *
 * Aturan yang tetap dibawa dari mockup lama: warna status TIDAK PERNAH berdiri
 * sendiri selalu dipasangkan dengan ikon + teks, supaya tetap terbaca oleh
 * pengguna dengan buta warna.
 */

/**
 * Nama keluarga huruf, bukan bobot angka.
 *
 * Di Android, `fontWeight` TIDAK bekerja untuk huruf yang dimuat sendiri:
 * yang dipakai cuma `fontFamily`, dan tiap bobot adalah berkas terpisah.
 * Karena itu seluruh skala di bawah menyebut fontFamily, bukan fontWeight
 * memakai fontWeight akan membuat semua teks tampil dengan bobot Regular di
 * Android sementara di iOS terlihat benar.
 */
export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

const light = {
  backdrop: '#fcfaf6',       // oklch(98.5% .005 85)  latar krem hangat
  surface: '#fffffd',        // oklch(99.9% .002 90)  kartu
  surface2: '#f2f0eb',       // oklch(95.5% .007 85)  muted
  surface3: '#e7e4dc',
  line: '#e6e4de',           // oklch(91.8% .008 85)
  lineStrong: '#d6d2c8',

  ink: '#1f2125',            // oklch(24.6% .009 265)
  ink2: '#686c74',           // oklch(53% .014 265)
  ink3: '#9a9ea6',

  /**
   * Teal-nya SENGAJA tidak ikut prototipe.
   *
   * Prototipe memakai `#37858e`, tapi teks putih di atasnya cuma 4,28:1
   * gagal WCAG AA untuk teks ukuran normal, dan label tombol di app ini
   * semuanya 15px. Yang dipertahankan adalah `#0e7c6b`, warna yang sudah
   * dipakai branding (splash, ikon notifikasi) dan oleh app lansia
   * (`elder-app/src/theme.js`, yang komentarnya menyebut kesamaan itu
   * disengaja). Karakter redesign datang dari latar krem, huruf besar, dan
   * kartu-per-baris bukan dari teal-nya.
   *
   * DUA token, dan bedanya bukan selera:
   * - `accent`    isian: tombol, bilah, batang grafik, ubin ikon.
   * - `accentInk` semua teks teal di atas latar terang: jam baris, tautan,
   *   label tab aktif, angka besar grafik.
   *
   * Memakai `accent` untuk teks adalah kesalahan yang mudah terulang: di
   * monitor terang warnanya terlihat cukup gelap, dan angkanya baru ketahuan
   * salah saat benar-benar diukur.
   */
  accent: '#0e7c6b',
  accentInk: '#0a5f52',
  accentSoft: '#e2f1ee',
  onAccent: '#ffffff',

  // Hijau sage dipakai sebagai latar ubin ikon, memberi variasi tanpa
  // menambah arti warna netral, bukan penanda status.
  sage: '#b3d6c4',           // oklch(84.5% .045 163)
  sageSoft: '#e3f3eb',       // oklch(95.1% .02 163)

  // Latar aprikot untuk kartu naratif (kalimat berikutnya dari asisten).
  // Bukan penanda status juga netral, cuma hangat.
  warm: '#fbf2e7',           // oklch(96.6% .018 75)

  good: '#4db355',           // oklch(68.5% .163 145)
  goodSoft: '#e2f7e4',       // oklch(95.5% .032 148)
  warning: '#f7bb21',        // oklch(82.6% .163 84)
  warningInk: '#754b00',     // oklch(45% .1 75)   teks di atas warningSoft
  warningSoft: '#fef8e1',    // oklch(97.7% .031 95)
  critical: '#d02121',       // oklch(55.2% .208 27.5)
  criticalSoft: '#ffecea',   // oklch(95.8% .022 25)

  series1: '#0e7c6b',
  grid: '#ece9e2',
  axis: '#d6d2c8',

  shadow: 'rgba(31, 33, 37, 0.07)',
};

/**
 * Varian gelap tidak ada di prototipe Lovable (yang hanya mendefinisikan
 * `:root`), jadi diturunkan di sini. Arah hue-nya sengaja dijaga sama: latar
 * gelapnya hangat, bukan biru, supaya terasa satu keluarga dengan mode terang.
 * Teal utama dinaikkan terangnya karena `#37858e` terlalu redup di atas gelap.
 */
const dark = {
  backdrop: '#15140f',
  surface: '#1f1d18',
  surface2: '#2a2721',
  surface3: '#35312a',
  line: 'rgba(255, 255, 255, 0.10)',
  lineStrong: 'rgba(255, 255, 255, 0.18)',

  ink: '#f5f2ec',
  ink2: '#a9a49a',
  ink3: '#7d7970',

  accent: '#3fbfa8',
  accentInk: '#6fd6c3',
  accentSoft: '#10302b',
  onAccent: '#08201c',

  sage: '#4e7d66',
  sageSoft: '#1c3329',

  warm: '#2b2318',

  good: '#5cc264',
  goodSoft: '#14301a',
  warning: '#f7bb21',
  warningInk: '#f0c96a',
  warningSoft: '#33280d',
  critical: '#e56a6a',
  criticalSoft: '#3a1a1a',

  series1: '#3fbfa8',
  grid: '#2b2822',
  axis: '#3d3931',

  shadow: 'rgba(0, 0, 0, 0.55)',
};

export const palettes = { light, dark };

/** Nilai non-warna dipakai sama di kedua mode. */
export const radius = { card: 18, row: 14, tile: 14, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22 };

/**
 * Skala huruf. Lebih besar dari versi sebelumnya di semua tingkat itu
 * perubahan paling terasa dari redesign, dan pembacanya memang orang yang
 * sedang memantau orang tuanya sambil mengerjakan hal lain.
 */
export const type = {
  screenTitle: { fontFamily: font.extrabold, fontSize: 27, letterSpacing: -0.5 },
  screenSub: { fontFamily: font.medium, fontSize: 13.5 },
  statNumber: { fontFamily: font.extrabold, fontSize: 34, letterSpacing: -1 },
  statSuffix: { fontFamily: font.semibold, fontSize: 13 },
  cardTitle: { fontFamily: font.bold, fontSize: 16.5, letterSpacing: -0.2 },
  rowTitle: { fontFamily: font.bold, fontSize: 15.5, letterSpacing: -0.1 },
  rowTime: { fontFamily: font.bold, fontSize: 15, fontVariant: ['tabular-nums'] },
  body: { fontFamily: font.regular, fontSize: 14.5, lineHeight: 22 },
  quote: { fontFamily: font.semibold, fontSize: 16, lineHeight: 25 },
  sub: { fontFamily: font.regular, fontSize: 13, lineHeight: 19 },
  label: { fontFamily: font.bold, fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase' },
  button: { fontFamily: font.bold, fontSize: 15 },
  chip: { fontFamily: font.semibold, fontSize: 13.5 },
  pill: { fontFamily: font.bold, fontSize: 11.5 },
};

/**
 * Bayangan kartu jauh lebih tipis daripada versi sebelumnya. Di atas latar
 * krem, bayangan yang kuat terbaca sebagai kotor; pemisah utamanya sekarang
 * garis tepi, bukan bayangan. RN memisahkan iOS (shadow*) dan Android
 * (elevation).
 */
export function cardShadow(c) {
  return {
    shadowColor: c.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  };
}
