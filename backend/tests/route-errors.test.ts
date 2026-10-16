import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import type { Prisma } from '../src/generated/prisma/client.js';
import { registerApiErrorHandler } from '../src/api/errors.js';
import { registerGroupRoutes } from '../src/api/group-routes.js';
import { registerPollRoutes } from '../src/api/poll-routes.js';
import { registerResponseRoutes } from '../src/api/response-routes.js';
import { ParticipantService } from '#services/participant/participant.service';
import { PollService } from '#services/poll/poll.service';
import { ResponseService } from '#services/response/response.service';

void test('route adapters preserve client codes and propagate unexpected errors', async (t) => {
  const app = Fastify({ logger: false });
  const database = {
    group: { findUnique: async () => ({ id: 'group-1' }) },
    participant: { findUnique: async () => ({ id: 'participant-1', groupId: 'group-1' }) },
    poll: { findFirst: async () => ({ id: 'poll-1' }) },
  } as unknown as Prisma.TransactionClient;
  registerApiErrorHandler(app);
  registerGroupRoutes(app, database);
  registerPollRoutes(app, database);
  registerResponseRoutes(app, database);
  t.after(() => app.close());

  let failure: unknown;
  const reject = async () => {
    throw failure;
  };
  t.mock.method(ParticipantService.prototype, 'create', reject);
  t.mock.method(ParticipantService.prototype, 'updateProfile', reject);
  t.mock.method(PollService.prototype, 'createNext', reject);
  t.mock.method(PollService.prototype, 'close', reject);
  t.mock.method(ResponseService.prototype, 'create', reject);

  const base = `/api/groups/${'a'.repeat(32)}`;
  const participant = { displayName: 'Participant', avatarColor: 'green' };
  const createPoll = {
    method: 'POST',
    url: `${base}/polls`,
    payload: {
      startsOn: '2026-10-06',
      endsOn: '2026-10-12',
      dayStart: '16:00',
      dayEnd: '20:00',
      slotMinutes: 30,
      meetingDurationMinutes: 60,
      timeZone: 'UTC',
    },
  } as const;
  const unique = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  const cases = [
    {
      request: { method: 'POST', url: `${base}/participants`, payload: participant },
      error: unique,
      status: 409,
      code: 'PARTICIPANT_NAME_TAKEN',
    },
    {
      request: { method: 'PATCH', url: `${base}/participants/me`, payload: participant },
      error: unique,
      status: 409,
      code: 'PARTICIPANT_NAME_TAKEN',
    },
    { request: createPoll, error: unique, status: 409, code: 'POLL_STATE_CONFLICT' },
    {
      request: createPoll,
      error: new RangeError('Invalid schedule'),
      status: 422,
      code: 'INVALID_SCHEDULE',
    },
    {
      request: { method: 'POST', url: `${base}/polls/poll-1/close` },
      error: new Error('Poll not found'),
      status: 404,
      code: 'POLL_NOT_FOUND',
    },
    {
      request: { method: 'POST', url: `${base}/polls/poll-1/responses/me` },
      error: unique,
      status: 409,
      code: 'RESPONSE_ALREADY_EXISTS',
    },
    {
      request: { method: 'POST', url: `${base}/polls/poll-1/responses/me` },
      error: new Error('Response requires an open poll'),
      status: 409,
      code: 'POLL_STATE_CONFLICT',
    },
  ] as const;

  for (const item of cases) {
    for (const [error, status, code] of [
      [item.error, item.status, item.code],
      [new Error('Unexpected database failure'), 500, 'INTERNAL_ERROR'],
    ] as const) {
      failure = error;
      const response = await app.inject({
        ...item.request,
        headers: { 'x-participant-token': 't'.repeat(43) },
      });

      assert.equal(response.statusCode, status, response.body);
      assert.equal(response.json().error.code, code);
    }
  }
});
