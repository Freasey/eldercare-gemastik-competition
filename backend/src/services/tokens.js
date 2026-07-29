import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../middleware/errors.js';

export function signSession(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role, name: user.name },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
}

export function verifySession(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Sesi tidak valid atau sudah kedaluwarsa', 'INVALID_SESSION');
  }
}
