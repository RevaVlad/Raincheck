import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '#config/config';
import { sharedPrismaDatabase } from '../support/prisma-database.js';
import { calculateResults } from '#services/analytics/analytics';
import type { Poll } from '#domain/poll/poll';
import type { AvailabilityInterval } from '#domain/interval/interval';

const database = sharedPrismaDatabase();
const app = buildApp({ ...loadConfig(), logLevel: 'silent' }, database);
const basePoll = {
  startsOn: '2026-10-05',
  endsOn: '2026-10-11',
  dayStart: '16:00',
  dayEnd: '20:00',
  slotMinutes: 30,
  meetingDurationMinutes: 60,
};
const nextPoll = { ...basePoll, startsOn: '2026-10-12', endsOn: '2026-10-18' };

async function request(method: 'POST' | 'PUT', url: string, token: string, payload?: object) {
  const response = await app.inject({
    method,
    url,
    headers: { 'x-participant-token': token },
    payload,
  });
  assert.equal(
    response.statusCode,
    method === 'POST' && url.endsWith('/responses/me') ? 201 : 200,
    response.body,
  );
  return response.json();
}

async function submitResponse(
  url: string,
  token: string,
  interval: {
    localDate: string;
    startTime: string;
    endTime: string;
    kind: string;
    preferenceDirection: string | null;
  },
) {
  await request('POST', url, token);
  await request('PUT', url, token, { intervals: [interval] });
  await request('POST', `${url}/confirm`, token);
}

async function createScenario() {
  const created = await app.inject({
    method: 'POST',
    url: '/api/groups',
    payload: { name: 'Analytics team', creatorDisplayName: 'Alice', firstPoll: basePoll },
  });
  assert.equal(created.statusCode, 201, created.body);
  const { group, currentPoll, participantEditToken: token } = created.json();
  const responseUrl = `/api/groups/${group.inviteCode}/polls/${currentPoll.id}/responses/me`;
  await submitResponse(responseUrl, token, {
    localDate: '2026-10-06',
    startTime: '16:00',
    endTime: '18:00',
    kind: 'PREFERRED',
    preferenceDirection: 'FLAT',
  });
  const createdNext = await app.inject({
    method: 'POST',
    url: `/api/groups/${group.inviteCode}/polls`,
    headers: { 'x-participant-token': token },
    payload: nextPoll,
  });
  assert.equal(createdNext.statusCode, 201, createdNext.body);
  const poll = createdNext.json().poll;
  const nextResponseUrl = `/api/groups/${group.inviteCode}/polls/${poll.id}/responses/me`;
  await submitResponse(nextResponseUrl, token, {
    localDate: '2026-10-13',
    startTime: '16:00',
    endTime: '17:00',
    kind: 'UNAVAILABLE',
    preferenceDirection: null,
  });
  return { group, poll, token };
}

void test(
  'maps confirmed previous availability to the target weekday ' +
    'and subtracts explicit current intervals',
  async () => {
    const { group, poll, token } = await createScenario();
    const response = await app.inject({
      method: 'GET',
      url: `/api/groups/${group.inviteCode}/polls/${poll.id}/suggestions/me`,
      headers: { 'x-participant-token': token },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(
      response
        .json()
        .suggestions.map(
          (suggestion: {
            localDate: string;
            startTime: string;
            endTime: string;
            kind: string;
          }) => ({
            localDate: suggestion.localDate,
            startTime: suggestion.startTime,
            endTime: suggestion.endTime,
            kind: suggestion.kind,
          }),
        ),
      [{ localDate: '2026-10-13', startTime: '17:00', endTime: '18:00', kind: 'PREFERRED' }],
    );
  },
);

void test(
  'returns every heatmap cell and ranks the best meeting windows ' +
    'from confirmed responses only',
  async () => {
    const { group, poll } = await createScenario();
    const response = await app.inject(`/api/groups/${group.inviteCode}/polls/${poll.id}/results`);
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.deepEqual(body.participantSummary, { total: 1, confirmed: 1, pending: 0 });
    assert.equal(body.heatmap.length, 56);
    assert.deepEqual(
      body.heatmap.find(
        (cell: { localDate: string; startTime: string }) =>
          cell.localDate === '2026-10-13' && cell.startTime === '16:00',
      ),
      {
        localDate: '2026-10-13',
        startTime: '16:00',
        endTime: '16:30',
        available: 0,
        ifNeeded: 0,
        preferred: 0,
        unavailable: 1,
        averageSoftScore: 0,
      },
    );
    assert.deepEqual(body.bestSlots[0], {
      localDate: '2026-10-12',
      startTime: '16:00',
      endTime: '17:00',
      available: 1,
      ifNeeded: 0,
      averageSoftScore: 0.5,
      stars: 3,
    });
    assert.equal(body.bestSlots.length, 3);
  },
);

void test('returns the selected poll state for every group participant', async () => {
  const { group, poll } = await createScenario();
  const bob = await app.inject({
    method: 'POST',
    url: `/api/groups/${group.inviteCode}/participants`,
    payload: { displayName: 'Bob' },
  });
  assert.equal(bob.statusCode, 201, bob.body);
  const bobToken = bob.json().participantEditToken;
  const bobResponseUrl = `/api/groups/${group.inviteCode}/polls/${poll.id}/responses/me`;
  await request('POST', bobResponseUrl, bobToken);

  const cara = await app.inject({
    method: 'POST',
    url: `/api/groups/${group.inviteCode}/participants`,
    payload: { displayName: 'Cara' },
  });
  assert.equal(cara.statusCode, 201, cara.body);

  const response = await app.inject(`/api/groups/${group.inviteCode}/polls/${poll.id}/results`);
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json().participantSummary, { total: 3, confirmed: 1, pending: 2 });
  assert.deepEqual(
    Object.fromEntries(
      response
        .json()
        .participants.map((participant: { displayName: string; state: string }) => [
          participant.displayName,
          participant.state,
        ]),
    ),
    { Alice: 'CONFIRMED', Bob: 'DRAFT', Cara: 'NONE' },
  );
});

void test('considers the final meeting window of the daily range', () => {
  const poll: Poll = {
    id: 'poll',
    groupId: 'group',
    sequenceNo: 1,
    title: null,
    startsOn: '2026-10-12',
    endsOn: '2026-10-12',
    dayStart: '16:00',
    dayEnd: '20:00',
    slotMinutes: 30,
    meetingDurationMinutes: 60,
    status: 'OPEN',
    basedOnPollId: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    closedAt: null,
  };
  const interval: AvailabilityInterval = {
    id: 'interval',
    responseId: 'response',
    localDate: '2026-10-12',
    startTime: '19:00',
    endTime: '20:00',
    kind: 'PREFERRED',
    preferenceDirection: 'FLAT',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  assert.equal(
    calculateResults(poll, 1, [{ participantId: 'participant', intervals: [interval] }])
      .bestSlots[0]?.startTime,
    '19:00',
  );
});
