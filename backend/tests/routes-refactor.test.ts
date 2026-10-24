import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { GroupService } from '#services/group/group.service';
import { ParticipantService } from '#services/participant/participant.service';
import { PollService } from '#services/poll/poll.service';
import { ResponseService } from '#services/response/response.service';
import {
  groupsCreated,
  participantsCreated,
  pollsCreated,
  responsesCreated,
} from '#infrastructure/metrics';
import { registerApiErrorHandler } from '../src/api/errors.js';
import { registerGroupRoutes } from '../src/api/group-routes.js';
import { registerPollRoutes } from '../src/api/poll-routes.js';
import { registerResponseRoutes } from '../src/api/response-routes.js';
import { routeFixtures } from './support/route-fixtures.js';

void test('creation routes count committed writes and preserve response DTOs', async (t) => {
  const fixture = routeFixtures();
  const app = Fastify();
  registerApiErrorHandler(app);
  registerGroupRoutes(app, fixture.database);
  registerPollRoutes(app, fixture.database);
  registerResponseRoutes(app, fixture.database);
  t.after(() => app.close());
  let failure: Error | undefined;
  const successful =
    <T>(value: T) =>
    async () => {
      if (failure) throw failure;
      return value;
    };
  t.mock.method(GroupService.prototype, 'create', successful(fixture.group));
  t.mock.method(
    ParticipantService.prototype,
    'create',
    successful({ participant: fixture.participant, editToken: fixture.token }),
  );
  t.mock.method(PollService.prototype, 'createNext', successful(fixture.poll));
  t.mock.method(ResponseService.prototype, 'create', successful(fixture.response));
  const base = `/api/groups/${fixture.group.inviteCode}`;
  const headers = { 'x-participant-token': fixture.token };
  const counters = [groupsCreated, participantsCreated, pollsCreated, responsesCreated];
  const values = async () =>
    Promise.all(counters.map(async (counter) => (await counter.get()).values[0]?.value));
  const requests = [
    { method: 'POST', url: '/api/groups', payload: { name: 'Team' } },
    {
      method: 'POST',
      url: `${base}/participants`,
      payload: { displayName: 'Member', avatarColor: 'green' },
    },
    {
      method: 'POST',
      url: `${base}/polls`,
      headers,
      payload: {
        startsOn: fixture.poll.startsOn,
        endsOn: fixture.poll.endsOn,
        dayStart: '16:00',
        dayEnd: '20:00',
        slotMinutes: 30,
        meetingDurationMinutes: 60,
        timeZone: 'UTC',
      },
    },
    { method: 'POST', url: `${base}/polls/poll-1/responses/me`, headers },
  ] as const;
  assert.deepEqual(await values(), [0, 0, 0, 0]);
  const responses = [];
  for (const request of requests) {
    const response = await app.inject(request);
    assert.equal(response.statusCode, 201, response.body);
    responses.push(response.json());
  }
  assert.deepEqual(await values(), [1, 1, 1, 1]);
  assert.deepEqual(responses[0], {
    group: { id: 'group-1', name: 'Team', inviteCode: fixture.group.inviteCode },
    currentPoll: null,
  });
  assert.equal(responses[1].participantEditToken, fixture.token);
  assert.equal('editTokenHash' in responses[1].participant, false);
  assert.equal(responses[2].poll.createdAt, fixture.now.toISOString());
  assert.equal(responses[2].poll.closedAt, null);
  assert.deepEqual(responses[3], {
    id: 'response-1',
    state: 'DRAFT',
    confirmedAt: null,
    intervals: [],
  });
  failure = Object.assign(new Error('unique constraint'), { code: 'P2002' });
  for (const [index, request] of requests.entries()) {
    const response = await app.inject(request);
    assert.equal(response.statusCode, index === 0 ? 500 : 409, response.body);
  }
  const invalid = await app.inject({
    method: 'POST',
    url: '/api/groups',
    payload: { name: 'Team', extra: true },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error.message, 'Only the group name is accepted');
  assert.deepEqual(await values(), [1, 1, 1, 1]);
});

void test('read routes preserve anonymous access and confirmed response DTOs', async (t) => {
  const fixture = routeFixtures();
  const app = Fastify();
  registerApiErrorHandler(app);
  registerGroupRoutes(app, fixture.database);
  registerResponseRoutes(app, fixture.database);
  t.after(() => app.close());
  const base = `/api/groups/${fixture.group.inviteCode}`;
  const workspace = await app.inject({
    url: `${base}/workspace`,
    headers: { 'x-participant-token': 'invalid' },
  });
  assert.equal(workspace.statusCode, 200, workspace.body);
  assert.equal(workspace.json().me, null);
  assert.deepEqual(workspace.json().participants, [
    { id: 'participant-1', displayName: 'Member', avatarColor: 'green', currentPollState: 'DRAFT' },
  ]);
  assert.equal('editTokenHash' in workspace.json().participants[0], false);
  assert.ok(workspace.json().currentPoll.slots.length > 0);
  const preview = await app.inject(base);
  assert.deepEqual(preview.json(), {
    group: { name: 'Team' },
    currentPoll: { id: 'poll-1', sequenceNo: 1, startsOn: '2026-10-06', endsOn: '2026-10-12' },
  });
  t.mock.method(ResponseService.prototype, 'confirm', async () => ({
    ...fixture.response,
    state: 'CONFIRMED',
    confirmedAt: fixture.now,
  }));
  const confirmed = await app.inject({
    method: 'POST',
    url: `${base}/polls/poll-1/responses/me/confirm`,
    headers: { 'x-participant-token': fixture.token },
  });
  assert.equal(confirmed.statusCode, 200, confirmed.body);
  assert.deepEqual(confirmed.json(), {
    id: 'response-1',
    state: 'CONFIRMED',
    confirmedAt: fixture.now.toISOString(),
    intervals: [],
  });
  const unauthorized = await app.inject(`${base}/polls/poll-1/responses/me`);
  assert.equal(unauthorized.statusCode, 401);
  t.mock.method(ResponseService.prototype, 'deleteForOpenPoll', async () => false);
  const missing = await app.inject({
    method: 'DELETE',
    url: `${base}/polls/poll-1/responses/me`,
    headers: { 'x-participant-token': fixture.token },
  });
  assert.equal(missing.statusCode, 404);
  t.mock.method(ResponseService.prototype, 'deleteForOpenPoll', async () => true);
  const deleted = await app.inject({
    method: 'DELETE',
    url: `${base}/polls/poll-1/responses/me`,
    headers: { 'x-participant-token': fixture.token },
  });
  assert.equal(deleted.statusCode, 204);
  assert.equal(deleted.body, '');
});
