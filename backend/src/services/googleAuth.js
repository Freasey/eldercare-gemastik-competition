import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { ApiError } from '../middleware/errors.js';

const client = new OAuth2Client(env.googleWebClientId);

/**
 * Verifikasi Google ID token server-side (cek signature, `aud`, `iss`, expiry).
 * ID token dari Google TIDAK dipakai sebagai session — hanya untuk identifikasi
 * awal, lalu backend menerbitkan JWT sendiri.
 */
export async function verifyGoogleIdToken(idToken) {
  if (!env.googleWebClientId) {
    throw ApiError.badRequest('GOOGLE_WEB_CLIENT_ID belum diset di server', 'GOOGLE_NOT_CONFIGURED');
  }

  let ticket;
  try {
    ticket = await client.verifyIdToken({ idToken, audience: env.googleWebClientId });
  } catch (err) {
    throw ApiError.unauthorized(`Google ID token tidak valid: ${err.message}`, 'BAD_GOOGLE_TOKEN');
  }

  const payload = ticket.getPayload();
  if (!payload?.email) throw ApiError.unauthorized('Google ID token tidak memuat email');
  if (payload.email_verified === false) throw ApiError.unauthorized('Email Google belum terverifikasi');

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
    avatarUrl: payload.picture || null,
  };
}
