import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { loadConfig } from '#config/config';

const config = loadConfig();
const pool = new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 2_000 });
const migrationsDir = fileURLToPath(new URL('../../migrations/', import.meta.url));

try {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('raincheck_migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(migrationsDir)).filter((name) => /^\d+_[\w-]+\.sql$/.test(name)).sort();
    const applied = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((row) => row.name));

    for (const name of files) {
      if (applied.has(name)) {
        console.log(`applied  ${name}`);
        continue;
      }
      if (process.argv.includes('--status')) {
        console.log(`pending  ${name}`);
        continue;
      }
      const sql = await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.log(`applied  ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('raincheck_migrations'))");
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
