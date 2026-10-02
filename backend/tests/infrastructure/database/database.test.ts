import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import { buildApp } from '../../../src/app.js';
import { loadConfig } from '#config/config';
import { Database } from '#infrastructure/database/database';

void test('idle pool errors preserve health checks and allow recovery and shutdown', async (t) => {
  let pool: Pool | undefined;
  let available = true;
  t.mock.method(Pool.prototype, 'query', function (this: Pool) {
    pool = this;
    if (!available) return Promise.reject(new Error('PostgreSQL unavailable'));
    return Promise.resolve({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
  });
  t.mock.method(console, 'error', () => {});
  const config = loadConfig();
  const database = Database.create(config);
  const app = buildApp({ ...config, logLevel: 'silent' }, database);
  try {
    assert.equal((await app.inject('/health/ready')).statusCode, 200);
    const idlePool = pool;
    assert.ok(idlePool);
    available = false;
    assert.doesNotThrow(() => idlePool.emit('error', new Error('idle client disconnected')));
    const ready = await app.inject('/health/ready');
    assert.equal(ready.statusCode, 503);
    assert.deepEqual(ready.json(), { status: 'unavailable' });
    assert.equal((await app.inject('/health/live')).statusCode, 200);
    assert.doesNotThrow(() =>
      idlePool.emit('error', new Error('another idle client disconnected')),
    );
    available = true;
    const recovered = await app.inject('/health/ready');
    assert.equal(recovered.statusCode, 200);
    assert.deepEqual(recovered.json(), { status: 'ok' });
  } finally {
    await app.close();
    await database.close();
  }
});
