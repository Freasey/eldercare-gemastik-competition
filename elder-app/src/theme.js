/**
 * Satu tema tetap, tidak mengikuti mode gelap sistem.
 *
 * Alasannya bukan malas: tampilan yang berubah sendiri antara terang dan gelap
 * membingungkan pengguna yang tidak pernah menyentuh pengaturan, dan latar
 * gelap dengan teks terang justru lebih sulit dibaca mata dengan katarak
 * (halo di sekeliling huruf). Jadi dikunci terang, kontras tinggi, huruf besar.
 *
 * Warna aksen sengaja sama dengan app keluarga supaya dua sisi ekosistem ini
 * terlihat satu keluarga.
 */
export const colors = {
  backdrop: '#f4f7f6',
  ink: '#12181b',
  ink2: '#4b565c',
  accent: '#0e7c6b',
  accentSoft: '#d9ece8',
  onAccent: '#ffffff',
  listening: '#0e7c6b',
  thinking: '#7a8a90',
  speaking: '#2a78d6',
  critical: '#c22f2f',
  criticalSoft: '#fbe6e6',
};

/**
 * Skala huruf. Titik terkecil di app ini (18) kira-kira sebesar teks judul di
 * app biasa — tidak ada satu pun teks yang boleh lebih kecil dari itu.
 */
export const type = {
  caption: 30,
  captionSmall: 24,
  status: 18,
  code: 44,
  hint: 20,
};
