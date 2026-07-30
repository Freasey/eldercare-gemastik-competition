import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../middleware/errors.js';

/**
 * @param {object} user baris `users`
 * @param {{guest?: boolean, expiresIn?: string}} [opts]
 *   `guest: true` ikut masuk ke payload supaya middleware bisa membedakan
 *   sesi tamu dari sesi keluarga asli tanpa query tambahan.
 */
export function signSession(user, opts = {}) {
  const payload = { sub: String(user.id), email: user.email, role: user.role, name: user.name };
  if (opts.guest) payload.guest = true;

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: opts.expiresIn || env.jwtExpiresIn,
  });
}

export function verifySession(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Sesi tidak valid atau sudah kedaluwarsa', 'INVALID_SESSION');
  }
}
