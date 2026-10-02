import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '#config/config';
import { sharedPrismaDatabase } from '../support/prisma-database.js';

const database = sharedPrismaDatabase();
const app = buildApp({ ...loadConfig(), logLevel: 'silent' }, database);
const poll = {
  title: 'Planning', startsOn: '2026-10-06', endsOn: '2026-10-12',
  dayStart: '16:00', dayEnd: '20:00', slotMinutes: 30, meetingDurationMinutes: 60,
};

async function createGroup() {
  const response = await app.inject({ method: 'POST', url: '/api/groups', payload: {
    name: '  Team  ', creatorDisplayName: ' Alice ', timezone: 'UTC', firstPoll: poll,
  } });
  assert.equal(response.statusCode, 201);
  return response.json();
}

void test('creates a group, creator, and first poll atomically and returns the creator token once', async () => {
  const created = await createGroup();
  assert.equal(created.group.name, 'Team');
  assert.equal(created.participant.displayName, 'Alice');
  assert.match(created.participantEditToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(created.currentPoll.sequenceNo, 1);
});

void test('looks up an invite, joins once, and rejects normalized duplicate participant names', async () => {
  const created = await createGroup();
  const context = await app.inject(`/api/groups/${created.group.inviteCode}`);
  assert.equal(context.statusCode, 200);
  assert.equal(context.json().group.name, 'Team');
  const joined = await app.inject({ method: 'POST', url: `/api/groups/${created.group.inviteCode}/participants`, payload: { displayName: ' Bob ' } });
  assert.equal(joined.statusCode, 201);
  assert.match(joined.json().participantEditToken, /^[A-Za-z0-9_-]{43}$/);
  const duplicate = await app.inject({ method: 'POST', url: `/api/groups/${created.group.inviteCode}/participants`, payload: { displayName: ' alice ' } });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, 'PARTICIPANT_NAME_TAKEN');
});

void test('renames the identified participant and exposes a workspace without trusting an invalid optional token', async () => {
  const created = await createGroup();
  const renamed = await app.inject({
    method: 'PATCH', url: `/api/groups/${created.group.inviteCode}/participants/me`,
    headers: { 'x-participant-token': created.participantEditToken }, payload: { displayName: ' Alice Smith ' },
  });
  assert.equal(renamed.statusCode, 200);
  assert.equal(renamed.json().participant.displayName, 'Alice Smith');
  const workspace = await app.inject({ method: 'GET', url: `/api/groups/${created.group.inviteCode}/workspace`, headers: { 'x-participant-token': 'not-a-valid-token' } });
  assert.equal(workspace.statusCode, 200);
  assert.equal(workspace.json().me, null);
  assert.equal(workspace.json().participants[0].currentPollState, 'NONE');
  assert.equal(workspace.json().polls[0].id, created.currentPoll.id);
});

void test('rejects non-UTC creation and rolls back a group when its first poll is invalid', async () => {
  const nonUtc = await app.inject({ method: 'POST', url: '/api/groups', payload: {
    name: 'Elsewhere', creatorDisplayName: 'Alice', timezone: 'Asia/Yekaterinburg', firstPoll: poll,
  } });
  assert.equal(nonUtc.statusCode, 400);
  assert.equal(nonUtc.json().error.code, 'INVALID_REQUEST');
  const invalid = await app.inject({ method: 'POST', url: '/api/groups', payload: {
    name: 'Rollback Team', creatorDisplayName: 'Alice', firstPoll: { ...poll, meetingDurationMinutes: 45 },
  } });
  assert.equal(invalid.statusCode, 422);
  assert.equal(await database.client.group.count({ where: { name: 'Rollback Team' } }), 0);
});

void test('maps normalized-invalid participant input to INVALID_REQUEST', async () => {
  const created = await createGroup();
  const response = await app.inject({ method: 'POST', url: `/api/groups/${created.group.inviteCode}/participants`, payload: { displayName: '   ' } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'INVALID_REQUEST');
});
