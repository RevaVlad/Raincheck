import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '#config/config';
import { Database } from './database.js';

const MIGRATION_VERSION = '001_initial';
const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;
const FIND_MIGRATION = `
  SELECT version
  FROM schema_migrations
  WHERE version = $1
`;
const RECORD_MIGRATION = `
  INSERT INTO schema_migrations (version)
  VALUES ($1)
`;

async function migrationSql(): Promise<string> {
  const directory = dirname(fileURLToPath(import.meta.url));
  return readFile(resolve(directory, 'migrations/001_initial.sql'), 'utf8');
}

async function isApplied(database: Database): Promise<boolean> {
  const result = await database.query<{ version: string }>(FIND_MIGRATION, [MIGRATION_VERSION]);
  return result.rows[0] !== undefined;
}

function reportStatus(applied: boolean): void {
  console.log(applied ? '001_initial applied' : '001_initial pending');
}

async function applyMigration(database: Database): Promise<void> {
  const sql = await migrationSql();
  await database.transaction(async (transaction) => {
    await transaction.query(sql);
    await transaction.query(RECORD_MIGRATION, [MIGRATION_VERSION]);
  });
  console.log('applied 001_initial');
}

async function run(): Promise<void> {
  const database = Database.create(loadConfig());
  try {
    await database.query(CREATE_MIGRATIONS_TABLE);
    const applied = await isApplied(database);
    if (process.argv.includes('--status')) return reportStatus(applied);
    if (applied) return console.log('001_initial already applied');
    await applyMigration(database);
  } finally {
    await database.close();
  }
}

await run();
