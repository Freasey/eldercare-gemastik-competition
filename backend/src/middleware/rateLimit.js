/**
 * Rate limit sederhana berbasis memori proses.
 *
 * Sengaja tanpa dependency dan tanpa Redis: container di Back4app cuma satu
 * instance, jadi hitungan di memori sudah akurat. Kalau nanti di-scale ke
 * beberapa instance, angka ini jadi per-instance — ganti ke store terpusat.
 */
import { ApiError } from './errors.js';

/**
 * @param {{windowMs: number, max: number, key?: (req) => string, message?: string}} opts
 */
export function rateLimit({ windowMs, max, key, message }) {
  /** @type {Map<string, number[]>} daftar timestamp hit per kunci */
  const hits = new Map();
  let lastSweep = Date.now();

  // Buang kunci yang sudah kedaluwarsa sesekali supaya Map tidak tumbuh terus.
  function sweep(now) {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [k, times] of hits) {
      const alive = times.filter((t) => now - t < windowMs);
      if (alive.length) hits.set(k, alive);
      else hits.delete(k);
    }
  }

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    sweep(now);

    // `trust proxy` sudah diset di server.js, jadi req.ip = IP asli client.
    const bucket = key ? key(req) : req.ip || 'unknown';
    const times = (hits.get(bucket) || []).filter((t) => now - t < windowMs);

    if (times.length >= max) {
      const retryAfter = Math.ceil((windowMs - (now - times[0])) / 1000);
      res.set('Retry-After', String(retryAfter));
      return next(
        new ApiError(
          429,
          message || `Terlalu banyak permintaan. Coba lagi dalam ${retryAfter} detik.`,
          'RATE_LIMITED',
        ),
      );
    }

    times.push(now);
    hits.set(bucket, times);
    next();
  };
}

/** Kunci per user kalau sudah login, kalau belum jatuh ke IP. */
export const byUserOrIp = (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip || 'unknown'}`);
