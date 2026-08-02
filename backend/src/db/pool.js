import pg from 'pg';
import { env } from '../config/env.js';

// Neon butuh SSL. `sslmode=require` di connection string sudah cukup untuk
// driver ini, tapi kita set eksplisit supaya jalan juga di host yang
// connection string-nya tidak membawa parameter itu (mis. Back4app).
// Ukuran pool ditentukan bentuk runtime-nya, bukan angka tetap. Satu container
// yang hidup terus boleh menahan beberapa koneksi; di serverless tiap instance
// punya pool sendiri dan jumlah instance-nya tidak kita kendalikan, jadi satu
// koneksi per instance adalah satu-satunya angka yang tidak menghabiskan kuota
// Neon saat trafik naik. Endpoint `-pooler` (PgBouncer) di DATABASE_URL yang
// menanggung multiplexing-nya.
export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: env.isServerless ? 1 : 5,
  idleTimeoutMillis: env.isServerless ? 10_000 : 30_000,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Ambil satu baris, atau null. */
export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

/** Ambil semua baris. */
export async function many(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

/** Jalankan callback dalam satu transaksi. */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
