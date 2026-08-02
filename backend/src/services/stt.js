/**
 * Fallback speech-to-text lewat Groq Whisper (PLAN §4).
 *
 * Jalur normalnya BUKAN ini: pengenal suara bawaan Android gratis, jalan tanpa
 * internet, dan tidak menghabiskan kuota. Yang ditangani di sini adalah kasus
 * yang di lapangan justru sering — HP tanpa layanan Google, bahasa Indonesia
 * belum terpasang, atau suara lansia terlalu pelan untuk pengenal bawaan.
 * Tanpa fallback, semua kasus itu berakhir sama: app diam dan lansia mengira
 * dirinya tidak didengar.
 *
 * API key Groq tidak pernah dikirim ke app — makanya audionya yang naik ke
 * server, bukan app yang memanggil Groq langsung.
 */
import { env } from '../config/env.js';
import { ApiError } from '../middleware/errors.js';

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

/** Batas ukuran audio yang diterima. ~20 detik m4a jauh di bawah angka ini. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * @param {Buffer} audio berkas audio utuh (m4a/wav/webm/ogg)
 * @param {{mimeType?: string, filename?: string, language?: string, prompt?: string}} [opts]
 * @returns {Promise<{text: string}>}
 */
export async function transcribe(audio, opts = {}) {
  const { mimeType = 'audio/m4a', filename = 'ucapan.m4a', language = 'id', prompt } = opts;

  if (!env.groqApiKey) {
    throw ApiError.badRequest('GROQ_API_KEY belum diset di server', 'GROQ_NOT_CONFIGURED');
  }
  if (audio.length > MAX_AUDIO_BYTES) {
    throw ApiError.badRequest('Audio terlalu besar', 'AUDIO_TOO_LARGE');
  }

  const form = new FormData();
  form.append('file', new Blob([audio], { type: mimeType }), filename);
  form.append('model', env.groqSttModel);
  form.append('language', language);
  form.append('response_format', 'json');
  // Temperature 0: yang diminta transkrip apa adanya, bukan tebakan yang enak
  // dibaca. Salah dengar yang "masuk akal" lebih berbahaya di sini — jawaban
  // soal obat ditafsirkan dari teks ini.
  form.append('temperature', '0');
  if (prompt) form.append('prompt', prompt);

  let res;
  try {
    res = await fetch(GROQ_STT_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.groqApiKey}` },
      body: form,
    });
  } catch (err) {
    throw new ApiError(503, `Tidak bisa menghubungi Groq: ${err.message}`, 'GROQ_UNREACHABLE');
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 429) {
      throw new ApiError(503, 'Kuota Groq sedang habis, coba lagi sebentar lagi', 'GROQ_RATE_LIMITED');
    }
    throw new ApiError(502, `Groq menolak transkripsi (${res.status}): ${detail.slice(0, 200)}`, 'GROQ_ERROR');
  }

  const data = await res.json();
  return { text: (data.text || '').trim() };
}
