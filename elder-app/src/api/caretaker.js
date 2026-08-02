/**
 * Satu fungsi per endpoint backend yang dipakai sisi lansia.
 * Urutannya mengikuti tabel endpoint di `backend/README.md`.
 *
 * App lansia sengaja hanya menyentuh sebagian kecil API: masuk lewat kode
 * pairing, menjalankan sesi assistant, menjawab reminder, dan memicu darurat.
 * Semua urusan setup (jadwal, kontak, profil) milik app keluarga.
 */
import { api } from './client.js';

/* ---------------- masuk ---------------- */

/**
 * Tukar kode pairing jadi sesi. Satu-satunya jalur masuk HP lansia: tidak ada
 * Google Sign-In, tidak ada layar login (PLAN §2.6).
 */
export const pairDevice = (code) =>
  api('/api/auth/pair', { method: 'POST', auth: false, body: { code } });

/* ---------------- assistant ---------------- */

/**
 * Buka sesi. Backend yang menjalankan context-check dan memutuskan kalimat
 * pembuka beserta prioritasnya — app tidak ikut menghitung apa pun.
 *
 * @param {'button'|'scheduled'|'wake_word'|'emergency'} trigger
 */
export const openSession = (elderId, trigger) =>
  api(`/api/elders/${elderId}/assistant/sessions`, { method: 'POST', body: { trigger } });

/**
 * Satu giliran bicara.
 *
 * `expects`, `reminderId`, dan `consentKey` dikembalikan lagi apa adanya dari
 * respons sebelumnya: state percakapan dipegang backend, app cuma meneruskan.
 */
export const sendTurn = (elderId, conversationId, body) =>
  api(`/api/elders/${elderId}/assistant/sessions/${conversationId}/turns`, { method: 'POST', body });

/** @param {'silence'|'closing_phrase'|'button'|'error'} reason */
export const endSession = (elderId, conversationId, reason) =>
  api(`/api/elders/${elderId}/assistant/sessions/${conversationId}/end`, {
    method: 'POST',
    body: { reason },
  });

/* ---------------- transkripsi ---------------- */

/**
 * Fallback speech-to-text saat pengenal bawaan HP gagal (lihat voice/stt.js).
 *
 * API key Groq hanya hidup di server, jadi audionya yang naik ke backend —
 * bukan app yang memanggil Groq langsung. Batas waktunya lebih longgar dari
 * permintaan biasa: unggah audio di jaringan rumah bisa lambat, dan menyerah
 * kepagian berarti kembali ke keadaan "app tidak mendengar apa-apa" yang justru
 * ingin diperbaiki fitur ini.
 *
 * 45 detik dulu dipilih tanpa batas atas yang jelas. Ukuran yang benar
 * sebenarnya lama operasinya: unggah ~850 KB plus Whisper turbo untuk klip 20
 * detik jatuh di kisaran 3-6 detik, dan 15 detik memberi ruang lebih dari dua
 * kali lipat untuk jaringan yang buruk. Lewat dari itu bukan lagi "lambat" tapi
 * "tidak akan datang", dan lansia yang menunggu dalam diam adalah hal yang
 * paling ingin dihindari di sesi percakapan.
 *
 * Batas ini juga harus tetap di bawah `maxDuration` fungsi backend
 * (vercel.json), supaya yang menyerah selalu klien lebih dulu — menunggu lebih
 * lama dari umur fungsi berarti menanti jawaban yang sudah mati di server.
 * Menyerah di sini aman: pemanggil memperlakukannya sebagai "tidak terdengar"
 * dan sesi tetap lanjut.
 */
export const transcribeAudio = (body) =>
  api('/api/stt', { method: 'POST', body, timeoutMs: 15000 });

/* ---------------- reminder ---------------- */

/**
 * Jadwal beberapa hari ke depan, untuk di-cache dan dijadwalkan jadi
 * notifikasi lokal (PLAN §2.6 — pengingat harus tetap bunyi tanpa internet).
 */
export const fetchReminders = (elderId, days = 2) =>
  api(`/api/elders/${elderId}/reminders?days=${days}`);

/** Dipakai jalur offline: jawaban yang sempat tertunda dikirim menyusul. */
export const respondReminder = (elderId, reminderId, body) =>
  api(`/api/elders/${elderId}/reminders/${reminderId}/respond`, { method: 'POST', body });

/* ---------------- darurat ---------------- */

/** Status awal `detected` — belum mengganggu keluarga sampai dikonfirmasi. */
export const triggerEmergency = (elderId, body) =>
  api(`/api/elders/${elderId}/emergencies`, { method: 'POST', body });

/** confirmed=false menutup kejadian sebagai false positive. */
export const confirmEmergency = (elderId, eventId, confirmed) =>
  api(`/api/elders/${elderId}/emergencies/${eventId}/confirm`, {
    method: 'POST',
    body: { confirmed },
  });
