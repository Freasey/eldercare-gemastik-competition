/**
 * Satu fungsi per endpoint backend, supaya layar tidak menyusun URL sendiri.
 * Urutan di sini mengikuti tabel endpoint di `backend/README.md`.
 */
import { api } from './client.js';

/* ---------------- auth ---------------- */

export const loginWithGoogle = (idToken) =>
  api('/api/auth/google', { method: 'POST', auth: false, body: { idToken, role: 'keluarga' } });

/** Jalan pintas development — hanya hidup kalau backend memasang ALLOW_DEV_LOGIN. */
export const devLogin = (email) =>
  api('/api/auth/dev-login', { method: 'POST', auth: false, body: { email, role: 'keluarga' } });

export const fetchMe = () => api('/api/auth/me');

/* ---------------- lansia ---------------- */

export const fetchElders = () => api('/api/elders');
export const fetchElder = (elderId) => api(`/api/elders/${elderId}`);
export const createElder = (body) => api('/api/elders', { method: 'POST', body });
export const updateElder = (elderId, body) => api(`/api/elders/${elderId}`, { method: 'PATCH', body });
export const fetchContacts = (elderId) => api(`/api/elders/${elderId}/contacts`);

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

export const registerDevice = (expoPushToken, platform) =>
  api('/api/devices', { method: 'POST', body: { expoPushToken, platform } });
