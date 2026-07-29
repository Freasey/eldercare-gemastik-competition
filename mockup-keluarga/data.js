/* ============================================================
 * Data contoh untuk mockup app keluarga.
 * Bentuknya sengaja dibuat mirip response backend Express
 * (lihat backend/README.md) supaya nanti tinggal ditukar fetch().
 * ============================================================ */

const DAY = 24 * 60 * 60 * 1000;

/** ISO string untuk `dayOffset` hari dari sekarang pada jam HH:MM. */
function at(dayOffset, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.now() + dayOffset * DAY);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function dateOnly(dayOffset) {
  const d = new Date(Date.now() + dayOffset * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Status reminder hari ini: yang sudah lewat dianggap selesai, kecuali yang dipaksa. */
function todayStatus(hhmm, forced) {
  if (forced) return forced;
  return new Date(at(0, hhmm)) < new Date() ? 'confirmed' : 'pending';
}

const USER = {
  id: 1,
  name: 'Daffa Ardhana',
  email: 'keluarga.demo@caretaker.id',
  role: 'keluarga',
};

const ELDERS = [
  {
    id: 5,
    name: 'Ibu Sumarni',
    shortName: 'Bu Sumarni',
    birthYear: 1953,
    phone: '0812-3456-7890',
    address: 'Jl. Kaliurang KM 5, Sleman',
    religion: 'Islam',
    prayerReminder: true,
    relation: 'Ibu kandung',
    pairedAt: at(-40, '09:00'),
    lastActiveAt: at(0, '08:24'),
    deviceBattery: 62,

    /* daysOfWeek: 0=Minggu .. 6=Sabtu, sama seperti kolom days_of_week di
       backend (schema.sql). Jalan pagi sengaja hari kerja saja, contoh
       nyata jadwal yang berbeda tiap hari. */
    schedules: [
      { id: 1, type: 'activity', title: 'Jalan pagi keliling komplek', timeOfDay: '06:00', isCritical: false, daysOfWeek: [1, 2, 3, 4, 5] },
      { id: 2, type: 'medication', title: 'Minum Amlodipine', timeOfDay: '07:00', isCritical: true, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: '5 mg', instruction: 'Sesudah sarapan' },
      { id: 3, type: 'medication', title: 'Minum Metformin (pagi)', timeOfDay: '08:00', isCritical: true, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: '500 mg', instruction: 'Sesudah makan' },
      { id: 4, type: 'medication', title: 'Minum Vitamin D3', timeOfDay: '13:00', isCritical: false, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: '1000 IU', instruction: 'Sesudah makan siang' },
      { id: 5, type: 'prayer', title: 'Waktunya sholat Maghrib', timeOfDay: '17:45', isCritical: false, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
      { id: 6, type: 'medication', title: 'Minum Metformin (malam)', timeOfDay: '19:00', isCritical: true, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: '500 mg', instruction: 'Sesudah makan malam' },
      { id: 7, type: 'sleep', title: 'Waktunya istirahat malam', timeOfDay: '21:00', isCritical: false, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    ],

    /* Reminder hari ini. Metformin malam sengaja dibiarkan belum dikonfirmasi
       supaya context engine punya sesuatu untuk diprioritaskan. */
    today: [
      { id: 101, scheduleId: 1, title: 'Jalan pagi keliling komplek', type: 'activity', time: '06:00', status: todayStatus('06:00'), isCritical: false },
      { id: 102, scheduleId: 2, title: 'Minum Amlodipine', type: 'medication', time: '07:00', status: todayStatus('07:00'), isCritical: true },
      /* sengaja dibiarkan "sudah diingatkan tapi belum dikonfirmasi" supaya
         context engine punya sesuatu yang berprioritas tinggi */
      { id: 103, scheduleId: 3, title: 'Minum Metformin (pagi)', type: 'medication', time: '08:00', status: todayStatus('08:00', 'spoken'), isCritical: true },
      { id: 104, scheduleId: 4, title: 'Minum Vitamin D3', type: 'medication', time: '13:00', status: todayStatus('13:00'), isCritical: false },
      { id: 105, scheduleId: 5, title: 'Waktunya sholat Maghrib', type: 'prayer', time: '17:45', status: todayStatus('17:45'), isCritical: false },
      { id: 106, scheduleId: 6, title: 'Minum Metformin (malam)', type: 'medication', time: '19:00', status: todayStatus('19:00', 'pending'), isCritical: true },
      { id: 107, scheduleId: 7, title: 'Waktunya istirahat malam', type: 'sleep', time: '21:00', status: todayStatus('21:00'), isCritical: false },
    ],

    /* 14 hari terakhir: kepatuhan obat + mood. Tiga hari terakhir sengaja
       ada yang terlewat — itu yang memunculkan red flag. */
    adherence: [
      { date: dateOnly(-13), taken: 4, total: 4 },
      { date: dateOnly(-12), taken: 4, total: 4 },
      { date: dateOnly(-11), taken: 4, total: 4 },
      { date: dateOnly(-10), taken: 4, total: 4 },
      { date: dateOnly(-9), taken: 4, total: 4 },
      { date: dateOnly(-8), taken: 3, total: 4 },
      { date: dateOnly(-7), taken: 4, total: 4 },
      { date: dateOnly(-6), taken: 4, total: 4 },
      { date: dateOnly(-5), taken: 4, total: 4 },
      { date: dateOnly(-4), taken: 4, total: 4 },
      /* tiga hari berturut-turut terlewat — ini yang memicu red flag */
      { date: dateOnly(-3), taken: 3, total: 4 },
      { date: dateOnly(-2), taken: 3, total: 4 },
      { date: dateOnly(-1), taken: 3, total: 4 },
      /* hari ini masih berjalan: Metformin pagi belum dikonfirmasi */
      { date: dateOnly(0), taken: 2, total: 4 },
    ],

    mood: [
      { date: dateOnly(-13), score: 4 },
      { date: dateOnly(-12), score: 4 },
      { date: dateOnly(-11), score: 4 },
      { date: dateOnly(-10), score: 4 },
      { date: dateOnly(-9), score: 3 },
      { date: dateOnly(-8), score: 4 },
      { date: dateOnly(-7), score: 4 },
      { date: dateOnly(-6), score: 3 },
      { date: dateOnly(-5), score: 4 },
      { date: dateOnly(-4), score: 3 },
      { date: dateOnly(-3), score: 3 },
      { date: dateOnly(-2), score: 2 },
      { date: dateOnly(-1), score: 2 },
      { date: dateOnly(0), score: 3 },
    ],

    redFlags: [
      {
        key: 'medication_missed_streak',
        severity: 'critical',
        label: 'Metformin terlewat 3 hari berturut-turut',
        detail: 'Jadwal ini ditandai penting. Hari ini pun belum dikonfirmasi.',
      },
      {
        key: 'mood_declining',
        severity: 'warning',
        label: 'Tren suasana hati menurun',
        detail: 'Rata-rata 3,8 → 2,8 dari skala 5 dalam dua minggu terakhir.',
      },
    ],

    cognitive: {
      trend: 'perlu diperhatikan',
      note: 'Jeda saat mencari kata sedikit meningkat minggu ini. Bukan diagnosis — hanya pola bicara yang tercatat.',
      points: [0.14, 0.15, 0.13, 0.18, 0.19, 0.22, 0.21],
    },

    conversations: [
      {
        id: 92,
        at: at(0, '08:20'),
        trigger: 'scheduled',
        openingKind: 'reminder_due_now',
        durationMin: 4,
        summary: 'Diingatkan Metformin pagi. Ibu bilang mau diminum setelah sarapan, tapi belum ada konfirmasi susulan.',
        transcriptShared: true,
        messages: [
          { role: 'assistant', text: 'Selamat pagi Bu Sumarni. Sekarang waktunya minum Metformin.', min: 0 },
          { role: 'elder', text: 'Iya, nanti ya. Ini masih masak.', min: 1 },
          { role: 'assistant', text: 'Baik, nanti saya ingatkan lagi lima belas menit lagi.', min: 2 },
          { role: 'elder', text: 'Iya.', min: 4 },
        ],
      },
      {
        id: 91,
        at: at(-1, '19:20'),
        trigger: 'button',
        openingKind: 'reminder_overdue',
        durationMin: 6,
        summary: 'Ditanya soal Metformin malam yang terlewat. Ibu bilang lupa karena ketiduran, lalu langsung minum. Suaranya terdengar agak lesu.',
        transcriptShared: true,
        messages: [
          { role: 'assistant', text: 'Bu Sumarni, tadi jam tujuh malam waktunya minum Metformin. Sudah diminum belum?', min: 0 },
          { role: 'elder', text: 'Aduh, belum. Tadi ketiduran di depan tivi.', min: 1 },
          { role: 'assistant', text: 'Tidak apa-apa, Bu. Obatnya masih bisa diminum sekarang. Saya tunggu ya.', min: 2 },
          { role: 'elder', text: 'Iya sudah ini, sudah saya minum sama air putih.', min: 4 },
          { role: 'assistant', text: 'Alhamdulillah. Ibu hari ini badannya bagaimana?', min: 5 },
          { role: 'elder', text: 'Ya begitu, agak pegal. Kurang tidur kayaknya.', min: 6 },
        ],
      },
      {
        id: 90,
        at: at(-1, '10:30'),
        trigger: 'button',
        openingKind: 'mood_checkin_overdue',
        durationMin: 4,
        summary: 'Ibu bercerita tentang tetangga yang menjenguk. Suasana hati cukup baik, tidak ada keluhan fisik.',
        transcriptShared: false,
      },
      {
        id: 89,
        at: at(-2, '07:05'),
        trigger: 'scheduled',
        openingKind: 'reminder_due_now',
        durationMin: 2,
        summary: 'Pengingat Amlodipine pagi. Dikonfirmasi sudah diminum.',
        transcriptShared: true,
        messages: [
          { role: 'assistant', text: 'Selamat pagi Bu Sumarni. Sekarang waktunya minum Amlodipine.', min: 0 },
          { role: 'elder', text: 'Iya, sudah saya minum barusan sama sarapan.', min: 1 },
          { role: 'assistant', text: 'Bagus, terima kasih sudah memberi tahu. Saya catat ya.', min: 2 },
        ],
      },
    ],

    emergencies: [
      {
        id: 2,
        at: at(-1, '20:30'),
        triggerType: 'missed_critical',
        status: 'resolved',
        detail: 'Metformin malam terlewat 3 hari berturut-turut.',
        handledBy: 'Daffa Ardhana',
        resolvedAt: at(-1, '21:15'),
      },
      {
        id: 1,
        at: at(-9, '15:40'),
        triggerType: 'keyword',
        status: 'resolved',
        detail: 'Terdeteksi kata "tolong" saat di kamar mandi. Ibu bilang cuma kepeleset sedikit, tidak jatuh.',
        confirmedByElder: true,
        handledBy: 'Daffa Ardhana',
        resolvedAt: at(-9, '16:02'),
      },
    ],

    contacts: [
      { id: 1, name: 'Daffa Ardhana', relation: 'Anak kandung', phone: '0857-1111-2222', inApp: true, priority: 1 },
      { id: 2, name: 'Rina Wulandari', relation: 'Anak kedua', phone: '0857-3333-4444', inApp: true, priority: 2 },
      { id: 3, name: 'Klinik Sehat Sleman', relation: 'Faskes terdekat', phone: '(0274) 555-321', inApp: false, priority: 3 },
    ],

    consents: [
      { key: 'share_daily_summary', label: 'Bagikan ringkasan harian', granted: true },
      { key: 'share_mood_signal', label: 'Bagikan sinyal suasana hati', granted: true },
      { key: 'share_conversation_transcript', label: 'Bagikan transkrip percakapan', granted: false },
      { key: 'fall_detection', label: 'Deteksi jatuh', granted: true },
      { key: 'always_listening', label: 'Dengarkan terus (wake word)', granted: false },
    ],

    dailySummaries: [
      { date: dateOnly(-1), taken: 3, total: 4, mood: 2, conversations: 3, highlights: ['Metformin malam terlewat', 'Tidur lebih larut dari biasanya'] },
      { date: dateOnly(-2), taken: 3, total: 4, mood: 2, conversations: 2, highlights: ['Metformin malam terlewat'] },
      { date: dateOnly(-3), taken: 3, total: 4, mood: 3, conversations: 3, highlights: ['Metformin malam terlewat', 'Jalan pagi tidak dilakukan'] },
      { date: dateOnly(-4), taken: 4, total: 4, mood: 3, conversations: 2, highlights: ['Semua obat diminum tepat waktu'] },
      { date: dateOnly(-5), taken: 3, total: 4, mood: 4, conversations: 3, highlights: ['Vitamin D3 dilewat, bilang sudah kenyang'] },
      { date: dateOnly(-6), taken: 4, total: 4, mood: 3, conversations: 2, highlights: ['Semua obat diminum tepat waktu'] },
      { date: dateOnly(-7), taken: 4, total: 4, mood: 4, conversations: 3, highlights: ['Semua obat diminum tepat waktu', 'Cerita soal cucu yang berkunjung'] },
    ],
  },

  {
    id: 6,
    name: 'Bapak Hartono',
    shortName: 'Pak Hartono',
    birthYear: 1948,
    phone: '0813-2222-1010',
    address: 'Jl. Magelang KM 8, Sleman',
    religion: 'Islam',
    prayerReminder: false,
    relation: 'Kakek',
    pairedAt: at(-12, '11:00'),
    lastActiveAt: at(0, '06:41'),
    deviceBattery: 88,

    schedules: [
      { id: 8, type: 'medication', title: 'Minum Bisoprolol', timeOfDay: '06:30', isCritical: true, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: '2,5 mg', instruction: 'Pagi sebelum makan' },
      { id: 9, type: 'checkup', title: 'Kontrol ke puskesmas', timeOfDay: '09:00', isCritical: false, daysOfWeek: [1] },
    ],

    today: [
      { id: 201, scheduleId: 8, title: 'Minum Bisoprolol', type: 'medication', time: '06:30', status: todayStatus('06:30'), isCritical: true },
      { id: 202, scheduleId: 9, title: 'Kontrol ke puskesmas', type: 'checkup', time: '09:00', status: todayStatus('09:00'), isCritical: false },
    ],

    adherence: Array.from({ length: 14 }, (_, i) => ({ date: dateOnly(i - 13), taken: 1, total: 1 })),
    mood: Array.from({ length: 14 }, (_, i) => ({ date: dateOnly(i - 13), score: i > 9 ? 4 : 4 })),

    redFlags: [],
    cognitive: { trend: 'stabil', note: 'Belum ada perubahan pola bicara yang menonjol.', points: [0.1, 0.11, 0.1, 0.09, 0.1, 0.11, 0.1] },

    conversations: [
      {
        id: 70,
        at: at(0, '06:41'),
        trigger: 'scheduled',
        openingKind: 'reminder_due_now',
        durationMin: 2,
        summary: 'Pengingat Bisoprolol pagi, langsung dikonfirmasi. Bapak bilang badan enak.',
        transcriptShared: true,
        messages: [
          { role: 'assistant', text: 'Selamat pagi Pak Hartono. Sekarang waktunya minum Bisoprolol.', min: 0 },
          { role: 'elder', text: 'Sudah, barusan.', min: 1 },
          { role: 'assistant', text: 'Bagus. Badannya hari ini bagaimana, Pak?', min: 1 },
          { role: 'elder', text: 'Enak, sehat. Mau ke sawah sebentar.', min: 2 },
        ],
      },
    ],

    emergencies: [],

    contacts: [
      { id: 4, name: 'Daffa Ardhana', relation: 'Cucu', phone: '0857-1111-2222', inApp: true, priority: 1 },
    ],

    consents: [
      { key: 'share_daily_summary', label: 'Bagikan ringkasan harian', granted: true },
      { key: 'share_mood_signal', label: 'Bagikan sinyal suasana hati', granted: true },
      { key: 'share_conversation_transcript', label: 'Bagikan transkrip percakapan', granted: true },
      { key: 'fall_detection', label: 'Deteksi jatuh', granted: false },
      { key: 'always_listening', label: 'Dengarkan terus (wake word)', granted: false },
    ],

    dailySummaries: Array.from({ length: 7 }, (_, i) => ({
      date: dateOnly(-(i + 1)),
      taken: 1,
      total: 1,
      mood: 4,
      conversations: 1,
      highlights: ['Semua obat diminum tepat waktu'],
    })),
  },
];

/* Label untuk tiap jenis pembuka percakapan — ini cerminan aturan prioritas
   di backend (services/contextEngine.js). */
const OPENING_LABELS = {
  reminder_overdue_critical: 'Pengingat penting terlewat',
  reminder_overdue: 'Pengingat terlewat',
  reminder_due_now: 'Pengingat tepat waktu',
  mood_checkin_overdue: 'Tanya kabar',
  general_greeting: 'Sapaan biasa',
};

const SCHEDULE_TYPES = {
  medication: { label: 'Obat', icon: 'pill' },
  activity: { label: 'Aktivitas', icon: 'walk' },
  prayer: { label: 'Ibadah', icon: 'moon' },
  sleep: { label: 'Istirahat', icon: 'bed' },
  meal: { label: 'Makan', icon: 'bowl' },
  checkup: { label: 'Kontrol', icon: 'stethoscope' },
};

const DEMO = { USER, ELDERS, OPENING_LABELS, SCHEDULE_TYPES, at, dateOnly };
