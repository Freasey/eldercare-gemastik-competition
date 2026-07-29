/**
 * Groq client (free tier). Dipakai HANYA untuk memahami/merespons percakapan
 * bebas dan meringkas — bukan untuk logika jadwal/prioritas reminder
 * (itu rule-based di contextEngine.js).
 */
import { env } from '../config/env.js';
import { ApiError } from '../middleware/errors.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `Kamu adalah pendamping suara untuk lansia Indonesia. Aturan bicaramu:
- Pakai Bahasa Indonesia sehari-hari yang sopan dan hangat. Sapa dengan "Bu"/"Pak".
- Kalimat pendek, satu ide per kalimat. Jawabanmu akan dibacakan keras-keras oleh TTS,
  jadi jangan pakai emoji, markdown, singkatan, atau daftar bernomor.
- Maksimal 2 kalimat kecuali diminta bercerita.
- Jangan memberi diagnosis atau saran dosis obat. Kalau ditanya soal medis serius,
  arahkan untuk menghubungi keluarga atau dokter.
- Kalau lansia terdengar bingung atau tidak menjawab pertanyaan, ulangi dengan
  kalimat yang lebih sederhana, jangan menegur.`;

export function isGroqConfigured() {
  return Boolean(env.groqApiKey);
}

/**
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
 */
export async function chat(messages, { model = env.groqModel, temperature = 0.6, maxTokens = 200 } = {}) {
  if (!isGroqConfigured()) {
    throw ApiError.badRequest('GROQ_API_KEY belum diset di server', 'GROQ_NOT_CONFIGURED');
  }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.groqApiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 429) {
      throw new ApiError(503, 'Kuota Groq sedang habis, coba lagi sebentar lagi', 'GROQ_RATE_LIMITED');
    }
    throw new ApiError(502, `Groq error ${res.status}: ${detail.slice(0, 200)}`, 'GROQ_ERROR');
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Ubah riwayat percakapan jadi ringkasan 1-2 kalimat untuk keluarga.
 * Dipanggil saat sesi ditutup, bukan tiap turn — hemat kuota.
 */
export async function summarizeConversation(turns) {
  const transcript = turns
    .map((t) => `${t.role === 'elder' ? 'Lansia' : 'Asisten'}: ${t.content}`)
    .join('\n');

  return chat(
    [
      {
        role: 'user',
        content:
          'Ringkas percakapan berikut untuk dibaca keluarga, maksimal 2 kalimat. ' +
          'Sebutkan apakah obat dikonfirmasi diminum dan bagaimana suasana hatinya. ' +
          'Jangan menambahkan informasi yang tidak ada di percakapan.\n\n' +
          transcript,
      },
    ],
    { temperature: 0.2, maxTokens: 150 },
  );
}

/**
 * Ekstrak makna dari jawaban lansia atas sebuah reminder, tanpa LLM kalau bisa.
 * Pola jawaban lansia untuk konfirmasi obat sangat terbatas, jadi keyword
 * matching sudah cukup dan jauh lebih murah + predictable.
 *
 * @returns {'confirmed'|'skipped'|'snoozed'|'unclear'}
 */
export function interpretReminderReply(text) {
  const t = (text || '').toLowerCase();
  if (/\b(sudah|udah|dah|barusan|tadi minum|sudah minum|beres|oke sudah)\b/.test(t)) return 'confirmed';
  if (/\b(nanti|sebentar|bentar|habis ini|tunggu|lagi.*(makan|sholat|mandi))\b/.test(t)) return 'snoozed';
  if (/\b(tidak|nggak|gak|ndak|belum|lupa|habis obatnya|obatnya habis)\b/.test(t)) return 'skipped';
  return 'unclear';
}
