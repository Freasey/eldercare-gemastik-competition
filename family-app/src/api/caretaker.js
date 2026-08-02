/**
 * Satu fungsi per endpoint backend, supaya layar tidak menyusun URL sendiri.
 * Urutan di sini mengikuti tabel endpoint di `backend/README.md`.
 */
import { api } from './client.js';

/* ---------------- auth ---------------- */

export const loginWithGoogle = (idToken) =>
  api('/api/auth/google', { method: 'POST', auth: false, body: { idToken, role: 'keluarga' } });

/**
 * Login tamu — tanpa input, selalu masuk ke akun demo. Jalan di backend lokal
 * maupun production, jadi ini jalur masuk yang dipakai app sampai Google
 * Sign-In siap.
 */
export const guestLogin = () => api('/api/auth/guest', { method: 'POST', auth: false });

export const fetchMe = () => api('/api/auth/me');

/* ---------------- lansia ---------------- */

export const fetchElders = () => api('/api/elders');
export const fetchElder = (elderId) => api(`/api/elders/${elderId}`);
export const createElder = (body) => api('/api/elders', { method: 'POST', body });
export const updateElder = (elderId, body) => api(`/api/elders/${elderId}`, { method: 'PATCH', body });
export const fetchContacts = (elderId) => api(`/api/elders/${elderId}/contacts`);

/* ---------------- perangkat lansia ---------------- */

/**
 * Kode pairing baru untuk ditampilkan sebagai QR. Umurnya pendek (15 menit),
 * jadi dipanggil saat layar dibuka, bukan disimpan.
 */
export const createPairingCode = (elderId) =>
  api(`/api/elders/${elderId}/pairing-code`, { method: 'POST' });

export const unpairElder = (elderId) => api(`/api/elders/${elderId}/unpair`, { method: 'POST' });

/* ---------------- jadwal & reminder ---------------- */

export const fetchSchedules = (elderId) => api(`/api/elders/${elderId}/schedules`);
export const createSchedule = (elderId, body) =>
  api(`/api/elders/${elderId}/schedules`, { method: 'POST', body });
export const updateSchedule = (elderId, scheduleId, body) =>
  api(`/api/elders/${elderId}/schedules/${scheduleId}`, { method: 'PATCH', body });
export const deleteSchedule = (elderId, scheduleId) =>
  api(`/api/elders/${elderId}/schedules/${scheduleId}`, { method: 'DELETE' });

/** Tanpa `date`, backend memakai hari ini. */
export const fetchReminders = (elderId, params = {}) => {
  const q = new URLSearchParams(params).toString();
  return api(`/api/elders/${elderId}/reminders${q ? `?${q}` : ''}`);
};
export const respondReminder = (elderId, reminderId, status, note) =>
  api(`/api/elders/${elderId}/reminders/${reminderId}/respond`, {
    method: 'POST',
    body: { status, note },
  });
export const fetchAdherence = (elderId) => api(`/api/elders/${elderId}/reminders/adherence`);

/* ---------------- mood, ringkasan, timeline ---------------- */

export const fetchCheckins = (elderId, days = 14) =>
  api(`/api/elders/${elderId}/checkins?days=${days}`);
export const fetchSummaries = (elderId, limit = 7) =>
  api(`/api/elders/${elderId}/summaries?limit=${limit}`);
export const fetchWeekSummary = (elderId) => api(`/api/elders/${elderId}/summaries/week`);
export const fetchTimeline = (elderId, days = 3) =>
  api(`/api/elders/${elderId}/timeline?days=${days}`);
export const fetchConversation = (elderId, conversationId) =>
  api(`/api/elders/${elderId}/conversations/${conversationId}`);

/* ---------------- assistant (intip prioritas) ---------------- */

/**
 * Kalimat yang akan diucapkan asisten ke lansia berikutnya. Read-only —
 * memanggil ini tidak membuka sesi percakapan.
 */
export const fetchAssistantContext = (elderId) => api(`/api/elders/${elderId}/assistant/context`);

/* ---------------- darurat ---------------- */

export const fetchEmergencies = (elderId) => api(`/api/elders/${elderId}/emergencies`);
export const joinEmergency = (elderId, id) =>
  api(`/api/elders/${elderId}/emergencies/${id}/join`, { method: 'POST' });
export const resolveEmergency = (elderId, id, note) =>
  api(`/api/elders/${elderId}/emergencies/${id}/resolve`, { method: 'POST', body: { note } });

/* ---------------- device (push) ---------------- */

/**
 * Nama field-nya `expoPushToken` karena begitulah kolom di backend dinamai,
 * tapi isinya sekarang token FCM mentah — lihat `notifications/push.js`.
 */
export const registerDevice = (expoPushToken, platform) =>
  api('/api/devices', { method: 'POST', body: { expoPushToken, platform } });

export const deleteDevice = (token) =>
  api(`/api/devices/${encodeURIComponent(token)}`, { method: 'DELETE' });

/** Kirim notifikasi uji ke HP ini sendiri — dipakai tombol di layar Profil. */
export const testPush = () => api('/api/devices/test', { method: 'POST' });
