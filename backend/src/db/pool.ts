import { Pool } from 'pg';
import type { Config } from '#config/config';

export function createPool(config: Config): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 30_000,
  });
}
