import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { pool } from './db/pool.js';
import { startScheduler } from './services/scheduler.js';
import { isGroqConfigured } from './services/groq.js';
import { isLivekitConfigured } from './services/livekit.js';
import { isPushConfigured } from './services/push.js';

const app = express();

app.set('trust proxy', 1); // Back4app menaruh container di belakang proxy
app.use(helmet());
app.use(cors({ origin: true, credentials: false }));

// Batas khusus untuk audio (fallback STT). HARUS didaftarkan sebelum parser
// umum di bawahnya: body-parser melewati request yang body-nya sudah terbaca,
// jadi urutan ini yang membuat 1mb tidak ikut membatasi /api/stt.
app.use('/api/stt', express.json({ limit: '6mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.isProd ? 'combined' : 'dev'));

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      ok: true,
      env: env.nodeEnv,
      services: {
        database: 'ok',
        groq: isGroqConfigured() ? 'ok' : 'belum dikonfigurasi',
        livekit: isLivekitConfigured() ? 'ok' : 'belum dikonfigurasi',
        google: env.googleWebClientId ? 'ok' : 'belum dikonfigurasi',
        // Ditampilkan supaya "notifikasi darurat tidak sampai" bisa dibedakan
        // dari "service account belum dipasang di Back4app" tanpa membaca log.
        push: isPushConfigured() ? 'ok' : 'belum dikonfigurasi',
      },
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.use('/api', apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`[server] AI Caretaker API jalan di :${env.port} (${env.nodeEnv})`);
  if (env.allowDevLogin) console.log('[server] dev-login AKTIF — jangan dipakai di production');
  startScheduler();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[server] ${signal} diterima, menutup...`);
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
