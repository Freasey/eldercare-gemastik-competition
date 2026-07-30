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
  allowDevLogin:
    process.env.ALLOW_DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production',

  // Login tamu — fitur produk, selalu hidup termasuk di production.
  // Tiap tamu dapat akun sendiri; yang nganggur dihapus otomatis.
  guestRetentionDays: Number(process.env.GUEST_RETENTION_DAYS || 7),
  // Sesi tamu sengaja lebih pendek dari sesi keluarga asli.
  guestJwtExpiresIn: process.env.GUEST_JWT_EXPIRES_IN || '7d',

  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

  livekitUrl: process.env.LIVEKIT_URL || '',
  livekitApiKey: process.env.LIVEKIT_API_KEY || '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
};
