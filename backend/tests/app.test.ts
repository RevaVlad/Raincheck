import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp, type DatabaseHealth } from '../src/app.js';
import type { Config } from '#config/config';

const config: Config = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl: 'postgres://localhost/raincheck',
  logLevel: 'silent',
};

void test('liveness does not depend on PostgreSQL', async () => {
  const db: DatabaseHealth = { isAvailable: async () => false };
  const app = buildApp(config, db);
  try {
    const response = await app.inject('/health/live');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
  } finally {
    await app.close();
  }
});

void test('readiness reports an unavailable database', async () => {
  const db: DatabaseHealth = { isAvailable: async () => false };
  const app = buildApp(config, db);
  try {
    const response = await app.inject('/health/ready');
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { status: 'unavailable' });
  } finally {
    await app.close();
  }
});

void test('readiness reports an available database', async () => {
  const db: DatabaseHealth = { isAvailable: async () => true };
  const app = buildApp(config, db);
  try {
    const response = await app.inject('/health/ready');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
  } finally {
    await app.close();
  }
});
