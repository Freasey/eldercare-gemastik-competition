import { one } from '../db/pool.js';
import { ApiError, asyncHandler } from './errors.js';
import { verifySession } from '../services/tokens.js';

/** Wajib login. Mengisi req.user dari JWT + baris users. */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw ApiError.unauthorized('Header Authorization: Bearer <token> tidak ada');

  const payload = verifySession(token);
  const user = await one('SELECT * FROM users WHERE id = $1', [payload.sub]);
  if (!user) throw ApiError.unauthorized('User tidak ditemukan');

  req.user = user;
  next();
});

/** Batasi ke role tertentu, mis. requireRole('keluarga'). */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Butuh role: ${roles.join(' atau ')}`));
    }
    next();
  };
}

/**
 * Pastikan user yang login berhak atas :elderId — entah sebagai caregiver
 * yang ter-link, atau sebagai lansia itu sendiri. Mengisi req.elder.
 */
export const requireElderAccess = asyncHandler(async (req, res, next) => {
  const elderId = req.params.elderId || req.body.elderId;
  if (!elderId) throw ApiError.badRequest('elderId wajib diisi');

  const elder = await one(
    `SELECT e.* FROM elders e
      WHERE e.id = $1
        AND (
          e.user_id = $2
          OR EXISTS (
            SELECT 1 FROM caregiver_links cl
             WHERE cl.elder_id = e.id AND cl.caregiver_user_id = $2
          )
        )`,
    [elderId, req.user.id],
  );

  if (!elder) throw ApiError.forbidden('Anda tidak terhubung dengan lansia ini');

  req.elder = elder;
  next();
});
