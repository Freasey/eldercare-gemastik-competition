/**
 * Entry point untuk runtime yang punya proses hidup terus (lokal, container).
 *
 * Di Vercel file ini tidak pernah dijalankan — di sana yang dipakai
 * `api/index.js`, dan scheduler-nya dipicu cron eksternal lewat
 * `POST /api/cron/tick`.
 */
import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { startScheduler } from './services/scheduler.js';

const server = app.listen(env.port, () => {
  console.log(`[server] AI Caretaker API jalan di :${env.port} (${env.nodeEnv})`);

  // Hanya masuk akal di proses yang hidup terus. Di serverless interval-nya
  // ikut mati begitu response terkirim, jadi jangan sampai menimbulkan kesan
  // scheduler-nya aktif padahal tidak.
  if (!env.isServerless) startScheduler();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[server] ${signal} diterima, menutup...`);
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
