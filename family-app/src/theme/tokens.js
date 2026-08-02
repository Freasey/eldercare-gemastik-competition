/**
 * Token warna & bentuk, dipindahkan langsung dari `mockup-keluarga/styles.css`
 * supaya app RN terlihat sama persis dengan prototipe yang sudah disetujui.
 *
 * Aturan yang ikut dibawa dari mockup: warna status TIDAK PERNAH berdiri
 * sendiri selalu dipasangkan dengan ikon + teks, supaya tetap terbaca oleh
 * pengguna dengan buta warna.
 */

const light = {
  backdrop: '#dde2df',
  surface: '#ffffff',
  surface2: '#f3f6f4',
  surface3: '#e9eeeb',
  line: 'rgba(17, 24, 28, 0.10)',
  lineStrong: 'rgba(17, 24, 28, 0.16)',

  ink: '#12181b',
  ink2: '#59646a',
  ink3: '#8b959a',

  accent: '#0e7c6b',
  accentInk: '#0a5f52',
  accentSoft: '#e2f1ee',
  onAccent: '#ffffff',

  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
  goodSoft: '#e6f5e6',
  warningSoft: '#fdf2dc',
  criticalSoft: '#fae8e8',

  series1: '#2a78d6',
  grid: '#e6e9e7',
  axis: '#c8cecb',

  shadow: 'rgba(17, 24, 28, 0.10)',
};

const dark = {
  backdrop: '#08090a',
  surface: '#171a1c',
  surface2: '#1f2427',
  surface3: '#252b2e',
  line: 'rgba(255, 255, 255, 0.10)',
  lineStrong: 'rgba(255, 255, 255, 0.18)',

  ink: '#f1f4f3',
  ink2: '#a8b2b6',
  ink3: '#7b8589',

  accent: '#3fbfa8',
  accentInk: '#6fd6c3',
  accentSoft: '#10302b',
  onAccent: '#08201c',

  good: '#4cc94c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#e56a6a',
  goodSoft: '#122c12',
  warningSoft: '#33280d',
  criticalSoft: '#341717',

  series1: '#3987e5',
  grid: '#262b2e',
  axis: '#363c3f',

  shadow: 'rgba(0, 0, 0, 0.5)',
};

export const palettes = { light, dark };

/** Nilai non-warna dipakai sama di kedua mode. */
export const radius = { card: 18, row: 12, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22 };

export const type = {
  h1: { fontSize: 21, fontWeight: '700', letterSpacing: -0.2 },
  cardTitle: { fontSize: 14.5, fontWeight: '650' },
  body: { fontSize: 13.5, fontWeight: '400' },
  sub: { fontSize: 12, fontWeight: '400' },
  mono: { fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
};

/** Bayangan kartu RN memisahkan iOS (shadow*) dan Android (elevation). */
export function cardShadow(c) {
  return {
    shadowColor: c.shadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  };
}
