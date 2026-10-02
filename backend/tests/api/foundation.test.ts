import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import Fastify from 'fastify';
import {
  AppError,
  registerApiErrorHandler,
} from '../../src/api/errors.js';
import { resolveParticipant } from '../../src/api/participant-identity.js';

void test('serializes application errors with a request ID', async () => {
  const app = Fastify({ logger: false });
  registerApiErrorHandler(app);
  app.get('/protected', async () => {
    throw new AppError('UNAUTHORIZED', 401, 'Participant token is required');
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/protected' });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, 'UNAUTHORIZED');
    assert.equal(response.json().error.message, 'Participant token is required');
    assert.equal(typeof response.json().error.requestId, 'string');
  } finally {
    await app.close();
  }
});

void test('maps malformed request validation and unexpected errors without leaking internals', async () => {
  const app = Fastify({ logger: false });
  registerApiErrorHandler(app);
  app.post('/input', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        additionalProperties: false,
        properties: { name: { type: 'string' } },
      },
    },
    handler: async () => {
      throw new Error('database password should not escape');
    },
  });
  try {
    const invalid = await app.inject({ method: 'POST', url: '/input', payload: {} });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, 'INVALID_REQUEST');
    assert.equal(typeof invalid.json().error.requestId, 'string');

    const failed = await app.inject({ method: 'POST', url: '/input', payload: { name: 'A' } });
    assert.equal(failed.statusCode, 500);
    assert.deepEqual(failed.json().error.code, 'INTERNAL_ERROR');
    assert.equal(failed.json().error.message, 'Internal server error');
  } finally {
    await app.close();
  }
});

void test('requires a participant token and scopes it to the requested group', async () => {
  const token = 'safe-token';
  const participant = { id: 'participant-1', groupId: 'group-1', displayName: 'Masha' };
  const database = {
    client: {
      participant: {
        findUnique: async ({ where }: { where: { editTokenHash: string } }) =>
          where.editTokenHash === createHash('sha256').update(token).digest('hex') ? participant : null,
      },
    },
  };

  await assert.rejects(
    () => resolveParticipant(database, undefined, 'group-1'),
    (error: unknown) => error instanceof AppError && error.code === 'UNAUTHORIZED',
  );
  await assert.rejects(
    () => resolveParticipant(database, token, 'group-2'),
    (error: unknown) => error instanceof AppError && error.code === 'UNAUTHORIZED',
  );
  assert.equal((await resolveParticipant(database, token, 'group-1')).id, participant.id);
});
