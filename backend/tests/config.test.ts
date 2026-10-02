import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '#config/config';

void test('requires a PostgreSQL connection URL', () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL is required/);
  assert.throws(() => loadConfig({ DATABASE_URL: 'https://example.com' }), /PostgreSQL URL/);
});

void test('loads valid defaults and rejects invalid port', () => {
  const config = loadConfig({ DATABASE_URL: 'postgres://localhost/raincheck' });
  assert.equal(config.port, 3000);
  assert.equal(config.host, '127.0.0.1');
  assert.throws(() => loadConfig({ DATABASE_URL: config.databaseUrl, PORT: '0' }), /PORT/);
});
