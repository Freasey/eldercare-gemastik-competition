import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const DROP_ORDER = [
  'daily_summaries',
  'consents',
  'devices',
  'emergency_events',
  'cognitive_signals',
  'messages',
  'conversations',
  'checkins',
  'reminder_events',
  'schedules',
  'medications',
  'emergency_contacts',
  'caregiver_links',
  'elders',
  'users',
];

async function main() {
  const drop = process.argv.includes('--drop');

  if (drop) {
    console.log('[migrate] --drop: menghapus tabel lama...');
    await pool.query(`DROP TABLE IF EXISTS ${DROP_ORDER.join(', ')} CASCADE`);
  }

  const sql = await fs.readFile(path.join(here, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[migrate] skema selesai diterapkan.');
  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] gagal:', err.message);
  process.exit(1);
});
