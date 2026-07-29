/** Error yang aman dikirim ke client (bukan bug internal). */
export class ApiError extends Error {
  constructor(status, message, code = undefined) {
    super(message);
    this.status = status;
    this.code = code;
  }

  static badRequest(msg, code) { return new ApiError(400, msg, code); }
  static unauthorized(msg = 'Tidak terautentikasi', code) { return new ApiError(401, msg, code); }
  static forbidden(msg = 'Tidak punya akses', code) { return new ApiError(403, msg, code); }
  static notFound(msg = 'Data tidak ditemukan', code) { return new ApiError(404, msg, code); }
  static conflict(msg, code) { return new ApiError(409, msg, code); }
}

/** Bungkus handler async supaya rejection-nya masuk ke error handler Express. */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `Route ${req.method} ${req.path} tidak ada` } });
}

// eslint-disable-next-line no-unused-vars -- Express butuh 4 argumen
export function errorHandler(err, req, res, next) {
  if (err?.name === 'ZodError') {
    return res.status(400).json({
      error: {
        message: 'Data yang dikirim tidak valid',
        code: 'VALIDATION_ERROR',
        details: err.issues?.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);

  res.status(status).json({
    error: {
      message: status >= 500 ? 'Terjadi kesalahan di server' : err.message,
      code: err.code,
    },
  });
}
