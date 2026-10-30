import assert from 'node:assert/strict';
import pg from 'pg';
import pino, { type DestinationStream } from 'pino';
import test, { type TestContext } from 'node:test';
import { buildApp } from '../src/app.js';
import { AppError } from '../src/api/errors.js';
import { logEvent } from '../src/api/log-event.js';
import { createPrismaClient } from '#infrastructure/database/prisma-database';
import type { Config } from '#config/config';
import { logger } from '#shared/logger';

const config: Config = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl: 'postgres://localhost/raincheck',
  logLevel: 'info',
};

type LogRecord = Record<string, unknown> & { err?: { stack?: string; code?: string } };

function captureLogs(context: TestContext): LogRecord[] {
  const records: LogRecord[] = [];
  const stream = Reflect.get(logger, pino.symbols.streamSym) as DestinationStream;
  context.mock.method(stream, 'write', (line: string) => {
    records.push(JSON.parse(line) as LogRecord);
  });
  context.after(() => {
    for (const record of records) {
      assert.match(String(record.timestamp), /^\d{4}-.*Z$/);
      assert.equal(typeof record.level, 'string');
      assert.equal(typeof record.message, 'string');
      assert.equal(typeof record.event, 'string');
      assert.deepEqual(record.service, { name: 'raincheck-api' });
      if (String(record.event).startsWith('http.request.')) {
        assert.equal(typeof record.requestId, 'string');
        assert.equal(typeof record.method, 'string');
        assert.equal(typeof record.route, 'string');
        assert.equal(typeof record.statusCode, 'number');
        assert.equal(typeof record.duration_ms, 'number');
      }
    }
  });
  return records;
}

function createApp() {
  const app = buildApp(config, { isAvailable: async () => true, close: async () => {} });
  app.get('/api/probe/:secret', async (request) => {
    request.log = request.log.child({ groupId: 'group-1', pollId: 'poll-1' });
    logEvent(request, 'probe.business', { responseId: 'response-1' });
    return { ok: true };
  });
  app.get('/api/probe/bad-request', async () => {
    throw new AppError('INVALID_REQUEST', 400, 'Invalid request');
  });
  app.get('/api/probe/unauthorized', async () => {
    throw new AppError('UNAUTHORIZED', 401, 'Unauthorized');
  });
  app.get('/api/probe/conflict', async () => {
    throw new AppError('POLL_STATE_CONFLICT', 409, 'Poll state conflict');
  });
  app.get('/api/probe/missing', async () => {
    throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');
  });
  app.get('/api/probe/failure', async () => {
    throw new Error('Operation failed\nparticipant-secret-and-invite-code-must-not-be-logged');
  });
  return app;
}

void test('generates a UUID request ID without logging path or query secrets', async (t) => {
  const records = captureLogs(t);
  const app = createApp();
  try {
    const response = await app.inject(
      '/api/probe/invite-code-secret?token=participant-token-secret',
    );
    const requestId = response.headers['x-request-id'];
    assert.equal(response.statusCode, 200);
    assert.match(
      String(requestId),
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
    );

    const notFound = await app.inject(
      '/api/unmatched/invite-code-secret?token=participant-token-secret',
    );
    assert.equal(notFound.statusCode, 404);
    assert.equal(typeof notFound.headers['x-request-id'], 'string');
    const completed = records.filter((record) => record.event === 'http.request.completed');
    assert.equal(completed.length, 2);
    assert.equal(completed[0]?.requestId, requestId);
    assert.equal(completed[0]?.route, '/api/probe/:secret');
    assert.equal(completed[1]?.route, 'unmatched');
    const business = records.find((record) => record.event === 'probe.business');
    assert.equal(business?.requestId, requestId);
    assert.equal(business?.groupId, 'group-1');
    assert.equal(business?.pollId, 'poll-1');
    assert.equal(business?.responseId, 'response-1');
    assert.equal(business?.message, 'probe.business');
    assert.doesNotMatch(JSON.stringify(records), /invite-code-secret|participant-token-secret/);
  } finally {
    await app.close();
  }
});

void test('preserves request IDs and safe errors for API failures', async (t) => {
  const records = captureLogs(t);
  const app = createApp();
  try {
    for (const [path, statusCode] of [
      ['bad-request', 400],
      ['unauthorized', 401],
      ['conflict', 409],
      ['missing', 404],
    ] as const) {
      const response = await app.inject(`/api/probe/${path}`);
      assert.equal(response.statusCode, statusCode);
      assert.equal(response.json().error.requestId, response.headers['x-request-id']);
      const entry = records.find(
        (record) => record.event === 'http.request.error' && record.statusCode === statusCode,
      );
      assert.equal(entry?.level, statusCode === 404 ? 'info' : 'warn');
      assert.equal(entry?.err, undefined);
    }

    const failure = await app.inject('/api/probe/failure');
    assert.equal(failure.statusCode, 500);
    assert.equal(failure.json().error.requestId, failure.headers['x-request-id']);
    assert.equal(failure.json().error.code, 'INTERNAL_ERROR');
    assert.equal(failure.json().error.message, 'Internal server error');
    const errors = records.filter((record) => record.event === 'http.request.error');
    assert.equal(errors.length, 5);
    assert.equal(errors.at(-1)?.level, 'error');
    assert.equal(records.filter((record) => record.err?.stack).length, 1);
    assert.match(errors.at(-1)?.err?.stack ?? '', /\n\s+at /);
    assert.doesNotMatch(JSON.stringify(records), /participant-secret|invite-code-must/);
    assert.equal(records.filter((record) => record.event === 'probe.business').length, 0);
  } finally {
    await app.close();
  }
});

void test('successful health checks produce no logs', async (t) => {
  const records = captureLogs(t);
  const app = createApp();
  try {
    const response = await app.inject('/health/live');
    assert.equal(response.statusCode, 200);
    assert.equal(typeof response.headers['x-request-id'], 'string');
    assert.equal((await app.inject('/health/ready')).statusCode, 200);
    assert.deepEqual(records, []);
  } finally {
    await app.close();
  }
});

void test('PostgreSQL pool errors emit a sanitized pool log', async (t) => {
  const records = captureLogs(t);
  const poolPrototype = pg.Pool.prototype as unknown as {
    on: (event: string, listener: (error: Error) => void) => unknown;
  };
  const originalOn = poolPrototype.on;
  let poolErrorListener: ((error: Error) => void) | undefined;
  poolPrototype.on = function (event, listener) {
    if (event === 'error') poolErrorListener = listener;
    return originalOn.call(this, event, listener);
  };
  const database = createPrismaClient({
    ...config,
    databaseUrl: 'postgres://user:secret@127.0.0.1:1/raincheck',
  });
  try {
    await database.$connect();
    assert.ok(poolErrorListener);
    poolErrorListener(
      Object.assign(new Error('Pool failed\nparticipant-secret-and-database-url-secret'), {
        code: 'ECONNRESET',
      }),
    );
    assert.equal(records.length, 1);
    assert.equal(records[0]?.event, 'database.pool_error');
    assert.equal(records[0]?.level, 'error');
    assert.equal(records[0]?.err?.code, 'ECONNRESET');
    assert.doesNotMatch(JSON.stringify(records), /participant-secret|database-url-secret/);
  } finally {
    poolPrototype.on = originalOn;
    await database.$disconnect();
  }
});
