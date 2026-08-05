/**
 * Label yang dipakai bersama beberapa layar. Kunci-kuncinya harus tetap sama
 * dengan backend: `type` mengikuti CHECK di `schedules` (schema.sql), dan
 * `opening_kind` mengikuti OPENING_PRIORITY di `services/contextEngine.js`.
 */

/**
 * `tint` menentukan warna ubin ikon di daftar: obat & kontrol memakai teal
 * (`accent`), sisanya hijau sage. Pembedanya sekadar ritme visual bukan
 * penanda status, jadi tidak ada arti yang hilang kalau warnanya tak terlihat.
 */
export const SCHEDULE_TYPES = {
  medication: { label: 'Obat', icon: 'pill', tint: 'accent' },
  activity: { label: 'Aktivitas', icon: 'walk', tint: 'sage' },
  prayer: { label: 'Ibadah', icon: 'moon', tint: 'sage' },
  sleep: { label: 'Istirahat', icon: 'bed', tint: 'sage' },
  meal: { label: 'Makan', icon: 'bowl', tint: 'sage' },
  checkup: { label: 'Kontrol', icon: 'stethoscope', tint: 'accent' },
};

export function scheduleMeta(type) {
  return SCHEDULE_TYPES[type] || SCHEDULE_TYPES.activity;
}

/** Nama manusiawi untuk tiap jenis pembuka percakapan. */
export const OPENING_LABELS = {
  reminder_overdue_critical: 'Pengingat penting terlewat',
  reminder_overdue: 'Pengingat terlewat',
  reminder_due_now: 'Pengingat tepat waktu',
  mood_checkin_overdue: 'Tanya kabar',
  // Backend punya prioritas ini (contextEngine.js: OPENING_PRIORITY), tapi
  // labelnya belum pernah ditulis di sini jadi kartu Beranda menampilkan
  // teks cadangan "Pembuka percakapan" setiap kali asisten hendak meminta izin.
  consent_request: 'Minta izin privasi',
  general_greeting: 'Sapaan biasa',
};

export const EMERGENCY_TITLES = {
  keyword: 'Kata bahaya terdeteksi',
  fall_detection: 'Terdeteksi jatuh',
  missed_critical: 'Pengingat penting terlewat',
  manual: 'Dipicu manual',
};

export const EMERGENCY_STATUS = {
  detected: { label: 'Baru terdeteksi', tone: 'warning' },
  cancelled: { label: 'Alarm palsu', tone: 'neutral' },
  escalated: { label: 'Perlu ditangani', tone: 'critical' },
  acknowledged: { label: 'Sedang ditangani', tone: 'warning' },
  resolved: { label: 'Selesai', tone: 'good' },
};

/** Label consent kuncinya dibuat backend di `elders.routes.js` saat profil dibuat. */
export const CONSENT_LABELS = {
  share_daily_summary: 'Bagikan ringkasan harian',
  share_mood_signal: 'Bagikan sinyal suasana hati',
  share_conversation_transcript: 'Bagikan transkrip percakapan',
  fall_detection: 'Deteksi jatuh',
  always_listening: 'Dengarkan terus (wake word)',
};

/** Severity red flag dari contextEngine: high | medium. */
export const FLAG_TONE = { high: 'critical', medium: 'warning' };
