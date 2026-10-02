import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import { AppError } from '../src/api/errors.js';
import type { Config } from '#config/config';

const config: Config = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl: 'postgres://localhost/raincheck',
  logLevel: 'silent',
};

void test('liveness does not depend on PostgreSQL', async () => {
  const db = { isAvailable: async () => false, close: async () => {} };
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
  const db = { isAvailable: async () => false, close: async () => {} };
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
  const db = { isAvailable: async () => true, close: async () => {} };
  const app = buildApp(config, db);
  try {
    const response = await app.inject('/health/ready');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
  } finally {
    await app.close();
  }
});

void test('closing the app disconnects its shared readiness database once', async () => {
  let connections = 1;
  const database = {
    isAvailable: async () => connections > 0,
    close: async () => {
      connections -= 1;
    },
  };
  const app = buildApp(config, database);
  assert.equal((await app.inject('/health/ready')).statusCode, 200);
  await app.close();
  await app.close();
  assert.equal(connections, 0);
});

void test('closing the app after a failed startup disconnects its database', async () => {
  let connections = 1;
  const app = buildApp(config, {
    isAvailable: async () => true,
    close: async () => {
      connections -= 1;
    },
  });
  app.addHook('onReady', async () => {
    throw new Error('startup failed');
  });
  await assert.rejects(() => app.listen({ host: config.host, port: 0 }), /startup failed/);
  await app.close();
  assert.equal(connections, 0);
});

void test('the app returns stable API errors without changing health behavior', async () => {
  const db = { isAvailable: async () => true, close: async () => {} };
  const app = buildApp(config, db);
  app.get('/api/test-error', async () => {
    throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');
  });
  try {
    const response = await app.inject('/api/test-error');
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, 'GROUP_NOT_FOUND');
    assert.equal(typeof response.json().error.requestId, 'string');
  } finally {
    await app.close();
  }
});
