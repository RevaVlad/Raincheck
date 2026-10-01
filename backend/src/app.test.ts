import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import { buildApp } from './app.js';
import type { Config } from './config/config.js';

const config: Config = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl: 'postgres://localhost/raincheck',
  logLevel: 'silent',
};

test('liveness does not depend on PostgreSQL', async () => {
  const db = { query: async () => { throw new Error('unavailable'); } } as unknown as Pick<Pool, 'query'>;
  const app = buildApp(config, db);
  try {
    const response = await app.inject('/health/live');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
  } finally {
    await app.close();
  }
});

test('readiness reports an unavailable database', async () => {
  const db = { query: async () => { throw new Error('unavailable'); } } as unknown as Pick<Pool, 'query'>;
  const app = buildApp(config, db);
  try {
    const response = await app.inject('/health/ready');
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { status: 'unavailable' });
  } finally {
    await app.close();
  }
});
