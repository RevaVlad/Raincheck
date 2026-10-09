import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../../../src/app.js';
import { loadConfig } from '#config/config';
import { createPrismaClient } from '#infrastructure/database/prisma-database';
import { sharedPrismaClient } from '../../support/prisma-database.js';

void test('app readiness and shutdown share the Prisma connection', async () => {
  const config = loadConfig();
  const database = createPrismaClient(config);
  const app = buildApp({ ...config, logLevel: 'silent' }, database);
  let pid: number | undefined;
  try {
    const ready = await app.inject('/health/ready');
    assert.equal(ready.statusCode, 200);
    assert.deepEqual(ready.json(), { status: 'ok' });
    const connections = await database.$queryRaw<{ pid: number }[]>`
      SELECT pg_backend_pid() AS pid
    `;
    pid = connections[0]?.pid;
    assert.ok(pid);
  } finally {
    await app.close();
  }
  const connections = await sharedPrismaClient().$queryRaw<{ pid: number }[]>`
    SELECT pid FROM pg_stat_activity WHERE pid = ${pid}
  `;
  assert.deepEqual(connections, []);
});
