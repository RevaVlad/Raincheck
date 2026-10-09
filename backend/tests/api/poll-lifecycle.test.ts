import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '#config/config';
import { sharedPrismaDatabase } from '../support/prisma-database.js';

const database = sharedPrismaDatabase();
const app = buildApp({ ...loadConfig(), logLevel: 'silent' }, database);
const pollInput = {
  title: null,
  startsOn: '2026-10-07',
  endsOn: '2026-10-13',
  dayStart: '16:00',
  dayEnd: '23:00',
  slotMinutes: 30,
  meetingDurationMinutes: 60,
  timeZone: 'UTC',
};

async function createGroup() {
  const response = await app.inject({
    method: 'POST',
    url: '/api/groups',
    payload: { name: `Lifecycle ${randomUUID()}` },
  });
  assert.equal(response.statusCode, 201, response.body);
  return { response, created: response.json() };
}

async function join(inviteCode: string, displayName = 'Alex') {
  const response = await app.inject({
    method: 'POST',
    url: `/api/groups/${inviteCode}/participants`,
    payload: { displayName, avatarColor: 'green' },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { participantEditToken: string; participant: { id: string } };
}

async function createPoll(inviteCode: string, token: string) {
  return app.inject({
    method: 'POST',
    url: `/api/groups/${inviteCode}/polls`,
    headers: { 'x-participant-token': token },
    payload: pollInput,
  });
}

async function createPollScenario() {
  const { created } = await createGroup();
  const member = await join(created.group.inviteCode);
  const createdPoll = await createPoll(created.group.inviteCode, member.participantEditToken);
  assert.equal(createdPoll.statusCode, 201, createdPoll.body);
  return { group: created.group, member, poll: createdPoll.json().poll };
}

async function closePoll(inviteCode: string, pollId: string, token?: string) {
  return app.inject({
    method: 'POST',
    url: `/api/groups/${inviteCode}/polls/${pollId}/close`,
    headers: token ? { 'x-participant-token': token } : {},
  });
}

async function expectScopedClose(inviteCode: string, pollId: string): Promise<void> {
  const otherGroup = await createGroup();
  const otherMember = await join(otherGroup.created.group.inviteCode);
  const unauthorized = await closePoll(inviteCode, pollId);
  assert.equal(unauthorized.statusCode, 401, unauthorized.body);

  const outOfScope = await closePoll(
    otherGroup.created.group.inviteCode,
    pollId,
    otherMember.participantEditToken,
  );
  assert.equal(outOfScope.statusCode, 404, outOfScope.body);
  assert.equal(outOfScope.json().error.code, 'POLL_NOT_FOUND');
}

async function expectClosedPollCanContinue(
  inviteCode: string,
  groupId: string,
  pollId: string,
  token: string,
  closeResults: Awaited<ReturnType<typeof app.inject>>[],
): Promise<void> {
  assert.deepEqual(closeResults.map((result) => result.statusCode).sort(), [200, 409]);
  const closed = closeResults.find((result) => result.statusCode === 200);
  const conflict = closeResults.find((result) => result.statusCode === 409);
  assert.ok(closed);
  assert.ok(conflict);
  assert.equal(closed.json().poll.status, 'CLOSED');
  assert.ok(closed.json().poll.closedAt);
  assert.equal(conflict.json().error.code, 'POLL_STATE_CONFLICT');

  const archivedResults = await app.inject(`/api/groups/${inviteCode}/polls/${pollId}/results`);
  assert.equal(archivedResults.statusCode, 200, archivedResults.body);
  const next = await createPoll(inviteCode, token);
  assert.equal(next.statusCode, 201, next.body);
  assert.equal(next.json().poll.sequenceNo, 2);
  assert.equal(next.json().poll.basedOnPollId, pollId);
  assert.equal(
    await database.client.pollResponse.count({ where: { pollId: next.json().poll.id } }),
    0,
  );
  assert.equal(await database.client.poll.count({ where: { groupId } }), 2);
}

async function createSavedResponse() {
  const { created } = await createGroup();
  const member = await join(created.group.inviteCode);
  const createdPoll = await createPoll(created.group.inviteCode, member.participantEditToken);
  const poll = createdPoll.json().poll;
  const responseUrl = `/api/groups/${created.group.inviteCode}/polls/${poll.id}/responses/me`;
  const headers = { 'x-participant-token': member.participantEditToken };
  const response = await app.inject({ method: 'POST', url: responseUrl, headers });
  assert.equal(response.statusCode, 201, response.body);

  const saved = await app.inject({
    method: 'PUT',
    url: responseUrl,
    headers,
    payload: {
      intervals: [
        {
          startAt: '2026-10-07T16:00:00.000Z',
          endAt: '2026-10-07T17:00:00.000Z',
          kind: 'PREFERRED',
          preferenceDirection: 'FLAT',
        },
      ],
    },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.deepEqual(
    saved.json().intervals.map((interval: { startAt: string; endAt: string }) => ({
      startAt: interval.startAt,
      endAt: interval.endAt,
    })),
    [{ startAt: '2026-10-07T16:00:00.000Z', endAt: '2026-10-07T17:00:00.000Z' }],
  );
  const reopened = await app.inject({ method: 'GET', url: responseUrl, headers });
  assert.equal(reopened.statusCode, 200, reopened.body);
  assert.deepEqual(reopened.json().intervals, saved.json().intervals);
  return { created, member, poll, responseUrl, headers };
}

async function expectClosedWritesAreRejected(responseUrl: string, headers: Record<string, string>) {
  for (const [method, url, payload] of [
    ['POST', responseUrl, undefined],
    ['PUT', responseUrl, { intervals: [] }],
    ['DELETE', responseUrl, undefined],
    ['POST', `${responseUrl}/confirm`, undefined],
  ] as const) {
    const result = await app.inject({ method, url, headers, payload });
    assert.equal(result.statusCode, 409, result.body);
    assert.equal(result.json().error.code, 'POLL_STATE_CONFLICT');
  }
}

async function expectArchivedResponse(pollId: string): Promise<void> {
  const archived = await database.client.pollResponse.findFirstOrThrow({
    where: { pollId },
    include: { intervals: true },
  });
  assert.equal(archived.intervals.length, 1);
}

void test('creates a group without a poll and creates its first poll separately', async () => {
  const { response, created } = await createGroup();
  assert.equal(response.statusCode, 201, response.body);
  assert.equal(created.currentPoll, null);

  const workspace = await app.inject(`/api/groups/${created.group.inviteCode}/workspace`);
  assert.equal(workspace.statusCode, 200, workspace.body);
  assert.equal(workspace.json().currentPoll, null);
  assert.deepEqual(workspace.json().polls, []);

  const member = await join(created.group.inviteCode);
  const first = await createPoll(created.group.inviteCode, member.participantEditToken);
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(first.json().poll.sequenceNo, 1);
  assert.equal(first.json().poll.basedOnPollId, null);
  assert.equal(first.json().poll.timeZone, 'UTC');
  const activeWorkspace = await app.inject(`/api/groups/${created.group.inviteCode}/workspace`);
  assert.equal(activeWorkspace.statusCode, 200, activeWorkspace.body);
  assert.equal(activeWorkspace.json().currentPoll.timeZone, 'UTC');
  assert.equal(activeWorkspace.json().currentPoll.slots[0].startAt, '2026-10-07T16:00:00.000Z');

  const duplicate = await createPoll(created.group.inviteCode, member.participantEditToken);
  assert.equal(duplicate.statusCode, 409, duplicate.body);
  assert.equal(duplicate.json().error.code, 'POLL_STATE_CONFLICT');
  const current = await database.client.poll.findFirstOrThrow({
    where: { groupId: created.group.id, status: 'OPEN' },
  });
  assert.equal(current.id, first.json().poll.id);
});

void test('requires a valid IANA time zone when creating a poll', async () => {
  const { created } = await createGroup();
  const member = await join(created.group.inviteCode);
  const withoutTimeZone: Record<string, unknown> = { ...pollInput };
  delete withoutTimeZone['timeZone'];
  const missing = await app.inject({
    method: 'POST',
    url: `/api/groups/${created.group.inviteCode}/polls`,
    headers: { 'x-participant-token': member.participantEditToken },
    payload: withoutTimeZone,
  });
  assert.equal(missing.statusCode, 400, missing.body);

  const invalid = await app.inject({
    method: 'POST',
    url: `/api/groups/${created.group.inviteCode}/polls`,
    headers: { 'x-participant-token': member.participantEditToken },
    payload: { ...pollInput, timeZone: 'No/SuchZone' },
  });
  assert.equal(invalid.statusCode, 422, invalid.body);
  assert.equal(invalid.json().error.code, 'INVALID_SCHEDULE');
});

void test('requires a group participant to create a poll', async () => {
  const { created } = await createGroup();
  const response = await app.inject({
    method: 'POST',
    url: `/api/groups/${created.group.inviteCode}/polls`,
    payload: pollInput,
  });

  assert.equal(response.statusCode, 401, response.body);
  assert.equal(await database.client.poll.count({ where: { groupId: created.group.id } }), 0);
});

void test('allows only one concurrent first poll creation', async () => {
  const { created } = await createGroup();
  const member = await join(created.group.inviteCode);

  const results = await Promise.all([
    createPoll(created.group.inviteCode, member.participantEditToken),
    createPoll(created.group.inviteCode, member.participantEditToken),
  ]);

  assert.deepEqual(results.map((result) => result.statusCode).sort(), [201, 409]);
  const polls = await database.client.poll.findMany({ where: { groupId: created.group.id } });
  assert.equal(polls.length, 1);
  assert.equal(polls[0]?.sequenceNo, 1);
});

void test(
  'closes a scoped poll once and permits the next poll ' + 'without copying responses',
  async () => {
    const { group, member, poll } = await createPollScenario();
    await expectScopedClose(group.inviteCode, poll.id);
    const closeResults = await Promise.all([
      closePoll(group.inviteCode, poll.id, member.participantEditToken),
      closePoll(group.inviteCode, poll.id, member.participantEditToken),
    ]);
    await expectClosedPollCanContinue(
      group.inviteCode,
      group.id,
      poll.id,
      member.participantEditToken,
      closeResults,
    );
  },
);

void test(
  'rejects response writes and deletion after close ' + 'while preserving archived data',
  async () => {
    const { created, member, poll, responseUrl, headers } = await createSavedResponse();
    const close = await closePoll(created.group.inviteCode, poll.id, member.participantEditToken);
    assert.equal(close.statusCode, 200, close.body);
    await expectClosedWritesAreRejected(responseUrl, headers);
    await expectArchivedResponse(poll.id);
  },
);

void test('serializes concurrent response deletion with poll closure', async () => {
  const { created } = await createGroup();
  const member = await join(created.group.inviteCode);
  const createdPoll = await createPoll(created.group.inviteCode, member.participantEditToken);
  const poll = createdPoll.json().poll;
  const responseUrl = `/api/groups/${created.group.inviteCode}/polls/${poll.id}/responses/me`;
  const headers = { 'x-participant-token': member.participantEditToken };
  const response = await app.inject({ method: 'POST', url: responseUrl, headers });
  assert.equal(response.statusCode, 201, response.body);

  const [deleted, closed] = await Promise.all([
    app.inject({ method: 'DELETE', url: responseUrl, headers }),
    app.inject({
      method: 'POST',
      url: `/api/groups/${created.group.inviteCode}/polls/${poll.id}/close`,
      headers,
    }),
  ]);

  assert.equal(closed.statusCode, 200, closed.body);
  assert.ok([204, 409].includes(deleted.statusCode));
  const responseCount = await database.client.pollResponse.count({ where: { pollId: poll.id } });
  assert.equal(responseCount, deleted.statusCode === 204 ? 0 : 1);
});
