/**
 * POST /api/stt transkripsi audio, dipakai app lansia sebagai FALLBACK saat
 * pengenal suara bawaan HP gagal (lihat services/stt.js).
 *
 * Audionya dikirim base64 di dalam JSON, bukan multipart. Alasannya praktis:
 * potongan yang dikirim cuma belasan detik, dan menghindari multipart berarti
 * backend tidak perlu dependency parser tambahan sementara sisi app cukup
 * memakai `fetch` biasa.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { byUserOrIp, rateLimit } from '../middleware/rateLimit.js';
import { MAX_AUDIO_BYTES, transcribe } from '../services/stt.js';

export const sttRouter = Router();

sttRouter.use(requireAuth);

// Tiap panggilan memakai kuota Groq. Angkanya longgar untuk percakapan wajar
// (satu giliran bicara = satu panggilan) tapi menutup HP yang error berulang.
sttRouter.use(
  rateLimit({
    name: 'stt',
    windowMs: 60_000,
    max: 20,
    key: byUserOrIp,
    message: 'Terlalu banyak permintaan transkripsi. Coba lagi sebentar lagi.',
  }),
);

const schema = z.object({
  audioBase64: z.string().min(100).max(Math.ceil(MAX_AUDIO_BYTES * 1.4)),
  mimeType: z.string().max(100).optional(),
  filename: z.string().max(100).optional(),
  language: z.string().max(10).optional(),
  /** Konteks singkat supaya Whisper tidak salah dengar nama obat. */
  prompt: z.string().max(300).optional(),
});

sttRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { audioBase64, mimeType, filename, language, prompt } = schema.parse(req.body);
    const audio = Buffer.from(audioBase64, 'base64');
    const { text } = await transcribe(audio, { mimeType, filename, language, prompt });
    res.json({ text });
  }),
);
