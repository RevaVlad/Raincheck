import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { requireOptionalParticipant } from '#services/access/require-participant';
import { ApplicationError } from '#services/errors';
import { registerApiErrorHandler } from '../src/api/errors.js';

void test('optional access tolerates invalid tokens but propagates database failures', async () => {
  const missing = { participant: { findUnique: async () => null } };
  assert.equal(await requireOptionalParticipant(missing, undefined, 'group-1'), null);
  assert.equal(await requireOptionalParticipant(missing, 'invalid', 'group-1'), null);
  const participant = {
    id: 'participant-1',
    groupId: 'group-1',
    displayName: 'Member',
    avatarColor: 'green',
  };
  const found = { participant: { findUnique: async () => participant } };
  assert.equal(await requireOptionalParticipant(found, 'token', 'group-2'), null);
  assert.equal((await requireOptionalParticipant(found, 'token', 'group-1'))?.id, 'participant-1');
  const failure = new Error('connection failed');
  const broken = {
    participant: {
      findUnique: async (): Promise<never> => {
        throw failure;
      },
    },
  };
  await assert.rejects(() => requireOptionalParticipant(broken, 'token', 'group-1'), failure);
});

void test('maps semantic errors to stable HTTP responses', async () => {
  const app = Fastify();
  registerApiErrorHandler(app);
  const cases = [
    ['UNAUTHORIZED', 401],
    ['GROUP_NOT_FOUND', 404],
    ['POLL_NOT_FOUND', 404],
    ['RESPONSE_NOT_FOUND', 404],
    ['PARTICIPANT_NAME_TAKEN', 409],
    ['RESPONSE_ALREADY_EXISTS', 409],
    ['POLL_STATE_CONFLICT', 409],
    ['INVALID_SCHEDULE', 422],
  ] as const;
  for (const [code] of cases) {
    app.get(`/${code}`, async () => {
      throw new ApplicationError(code, 'Preserved message');
    });
  }
  try {
    for (const [code, status] of cases) {
      const response = await app.inject(`/${code}`);
      assert.equal(response.statusCode, status);
      assert.equal(response.json().error.code, code);
      assert.equal(response.json().error.message, 'Preserved message');
      assert.equal(typeof response.json().error.requestId, 'string');
    }
  } finally {
    await app.close();
  }
});
