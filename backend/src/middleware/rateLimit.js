/**
 * Rate limit terpusat di Postgres.
 *
 * Sebelumnya hitungannya disimpan di `Map` memori proses akurat selama
 * backend cuma satu container. Di serverless asumsi itu runtuh: tiap instance
 * punya Map sendiri, jadi batas efektifnya terkalikan jumlah instance yang
 * kebetulan hidup, dan jumlah itu tidak kita kendalikan.
 *
 * Yang membuat ini bukan sekadar soal kuota: `POST /api/auth/pair` memakai kode
 * pairing sebagai kredensial, sehingga pelemahan batas percobaan langsung jadi
 * pelemahan keamanan.
 *
 * Postgres dipilih daripada Redis karena Neon sudah ada menambah vendor,
 * akun, dan env var baru tidak sepadan untuk lima endpoint. Biayanya satu
 * round-trip per request, dan setiap route yang memakai limiter ini toh
 * menyentuh database sesudahnya.
 */
import { one } from '../db/pool.js';
import { ApiError } from './errors.js';

/**
 * Catat satu hit lalu kembalikan posisi terkini di jendelanya.
 *
 * Satu statement, bukan SELECT lalu UPDATE, supaya dua request yang datang
 * bersamaan di dua instance berbeda tidak sama-sama membaca hitungan lama.
 * Jendela yang sudah lewat di-reset di statement yang sama.
 */
async function catatHit(bucket, windowMs) {
  return one(
    `INSERT INTO rate_limits (bucket, window_start, hits)
     VALUES ($1, now(), 1)
     ON CONFLICT (bucket) DO UPDATE
        SET hits = CASE
                     WHEN rate_limits.window_start < now() - ($2 || ' milliseconds')::interval
                     THEN 1
                     ELSE rate_limits.hits + 1
                   END,
            window_start = CASE
                     WHEN rate_limits.window_start < now() - ($2 || ' milliseconds')::interval
                     THEN now()
                     ELSE rate_limits.window_start
                   END
      RETURNING hits, window_start`,
    [bucket, windowMs],
  );
}

/**
 * @param {{name: string, windowMs: number, max: number, key?: (req) => string, message?: string}} opts
 *   `name` memisahkan kuota antar-limiter di dalam satu tabel bersama. Wajib
 *   dan ditulis manual, bukan diturunkan dari URL: router assistant dipasang di
 *   bawah `/api/elders/:elderId`, jadi memakai path akan membuat kuotanya
 *   per-lansia padahal maksudnya per-user lintas lansia.
 */
export function rateLimit({ name, windowMs, max, key, message }) {
  if (!name) throw new Error('rateLimit butuh `name` supaya kuotanya tidak tercampur limiter lain');

  return function rateLimitMiddleware(req, res, next) {
    // `trust proxy` sudah diset di app.js, jadi req.ip = IP asli client.
    const bucket = `${name}:${key ? key(req) : req.ip || 'unknown'}`;

    catatHit(bucket, windowMs)
      .then((row) => {
        if (!row || row.hits <= max) return next();

        const sisaMs = new Date(row.window_start).getTime() + windowMs - Date.now();
        const retryAfter = Math.max(1, Math.ceil(sisaMs / 1000));
        res.set('Retry-After', String(retryAfter));

        next(
          new ApiError(
            429,
            message || `Terlalu banyak permintaan. Coba lagi dalam ${retryAfter} detik.`,
            'RATE_LIMITED',
          ),
        );
      })
      .catch((err) => {
        // Sengaja fail-open. Limiter yang menolak request saat database
        // bermasalah tidak menambah keamanan apa pun handler di belakangnya
        // pasti gagal juga karena semuanya butuh database tapi mengubah
        // gangguan sesaat jadi penolakan total, termasuk untuk jalur darurat.
        console.error('[rateLimit] gagal, request diteruskan:', err.message);
        next();
      });
  };
}

/** Kunci per user kalau sudah login, kalau belum jatuh ke IP. */
export const byUserOrIp = (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip || 'unknown'}`);

/**
 * Buang baris yang jendelanya sudah lewat. Dipanggil dari scheduler tanpa
 * ini tabelnya tumbuh terus oleh kunci IP yang tidak pernah muncul lagi.
 *
 * Ambangnya sengaja jauh lebih longgar dari jendela terpanjang yang dipakai
 * (1 jam) supaya tidak pernah menghapus jendela yang masih dihitung.
 */
export async function sweepRateLimits() {
  const row = await one(
    `WITH terhapus AS (
       DELETE FROM rate_limits WHERE window_start < now() - interval '24 hours'
       RETURNING 1
     )
     SELECT count(*)::int AS jumlah FROM terhapus`,
  );
  return { rateLimits: row?.jumlah ?? 0 };
}
