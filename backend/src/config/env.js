import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(here, '../../../.env');

// Fallback: kalau backend/.env belum dibuat, pakai .env di root project.
if (!process.env.DATABASE_URL && fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
}

function required(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Env ${key} wajib diisi (cek backend/.env atau .env root).`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 4000),
  timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Jakarta',

  databaseUrl: required('DATABASE_URL'),

  googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID || '',
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',

  /**
   * Kredensial pemicu scheduler dari luar (routes/cron.routes.js).
   *
   * Wajib diisi begitu backend jalan di serverless: di sana tidak ada proses
   * yang hidup terus, jadi satu-satunya yang menjalankan sweep reminder
   * terlewat adalah cron eksternal yang memanggil endpoint itu. Dibiarkan
   * kosong = endpoint mati total (503), bukan terbuka.
   */
  cronSecret: process.env.CRON_SECRET || '',

  /**
   * Di serverless tidak ada proses panjang: tiap instance punya pool sendiri
   * dan bisa ada puluhan instance sekaligus, jadi `max` besar justru menghabiskan
   * kuota koneksi Neon. Dipakai juga untuk memutuskan apakah scheduler internal
   * ikut dinyalakan (lihat server.js).
   */
  isServerless: Boolean(process.env.VERCEL),

  // Login tamu fitur produk, selalu hidup termasuk di production.
  // Tiap tamu dapat akun sendiri; yang nganggur dihapus otomatis.
  guestRetentionDays: Number(process.env.GUEST_RETENTION_DAYS || 7),
  // Sesi tamu sengaja lebih pendek dari sesi keluarga asli.
  guestJwtExpiresIn: process.env.GUEST_JWT_EXPIRES_IN || '7d',

  // Device lansia tidak punya layar login: kalau sesinya kedaluwarsa, app-nya
  // mati total tanpa ada yang bisa memperbaiki dari sisi lansia. Karena itu
  // umurnya sengaja sangat panjang; pencabutan akses dilakukan keluarga lewat
  // "putuskan perangkat", bukan lewat expiry (lihat services/pairing.js).
  elderJwtExpiresIn: process.env.ELDER_JWT_EXPIRES_IN || '3650d',

  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  // Dipakai jalur fallback STT (services/stt.js) saat pengenal suara bawaan HP
  // lansia gagal menangkap ucapan. Turbo dipilih karena yang dikirim cuma
  // potongan 10-20 detik dan latensi lebih penting daripada akurasi terakhir.
  groqSttModel: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',

  /**
   * Service account Firebase untuk FCM V1 (services/push.js).
   *
   * Dua bentuk, sengaja: di laptop file JSON-nya ada di disk, sedangkan di
   * container Back4app tidak ada file apa pun yang bisa ditunjuk di sana
   * isinya dititipkan sebagai env var base64 (base64 supaya newline di
   * private key tidak rusak saat ditempel ke dashboard).
   */
  firebaseServiceAccountB64: process.env.FIREBASE_SERVICE_ACCOUNT_B64 || '',
  firebaseServiceAccountPath: process.env.FIREBASE_FCM_SERVICE_ACCOUNT_JSON_PATH || '',

  livekitUrl: process.env.LIVEKIT_URL || '',
  livekitApiKey: process.env.LIVEKIT_API_KEY || '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
};
