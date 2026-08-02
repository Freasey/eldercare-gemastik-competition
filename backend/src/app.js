/**
 * Perakitan aplikasi Express — tanpa `listen()`.
 *
 * Dipisah dari server.js supaya bentuk yang sama bisa dipakai dua runtime yang
 * berbeda: sebagai proses yang mendengarkan port (server.js, dipakai lokal) dan
 * sebagai handler serverless (api/index.js, dipakai Vercel). Yang membedakan
 * hanya siapa yang memanggil, bukan isinya.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { pool } from './db/pool.js';
import { isGroqConfigured } from './services/groq.js';
import { isLivekitConfigured } from './services/livekit.js';
import { isPushConfigured } from './services/push.js';

export const app = express();

// Baik Back4app maupun Vercel menaruh app di belakang satu proxy yang mengisi
// `x-forwarded-for` dengan IP asli client. Angka 1 itu jumlah hop yang
// dipercaya — penting untuk rate limit, yang kuncinya IP.
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: true, credentials: false }));

// Batas khusus untuk audio (fallback STT). HARUS didaftarkan sebelum parser
// umum di bawahnya: body-parser melewati request yang body-nya sudah terbaca,
// jadi urutan ini yang membuat 1mb tidak ikut membatasi /api/stt.
//
// Angkanya sengaja di bawah batas body Vercel (4.5 MB) supaya request yang
// kebesaran ditolak oleh pesan kita sendiri, bukan error opaque dari platform.
app.use('/api/stt', express.json({ limit: '4mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.isProd ? 'combined' : 'dev'));

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      ok: true,
      env: env.nodeEnv,
      serverless: env.isServerless,
      services: {
        database: 'ok',
        groq: isGroqConfigured() ? 'ok' : 'belum dikonfigurasi',
        livekit: isLivekitConfigured() ? 'ok' : 'belum dikonfigurasi',
        google: env.googleWebClientId ? 'ok' : 'belum dikonfigurasi',
        // Ditampilkan supaya "notifikasi darurat tidak sampai" bisa dibedakan
        // dari "service account belum dipasang di host" tanpa membaca log.
        push: isPushConfigured() ? 'ok' : 'belum dikonfigurasi',
        // Di serverless ini yang menggantikan scheduler internal. Kalau
        // kosong, sweep reminder terlewat tidak akan pernah jalan.
        cron: env.cronSecret ? 'ok' : 'belum dikonfigurasi',
      },
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.use('/api', apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
