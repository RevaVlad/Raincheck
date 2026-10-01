import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createGroup } from './group.js';
import { createParticipant } from './participant.js';
import { closePoll, createPoll, ensureBasePollBelongsToGroup, ensurePollOpen } from './poll.js';
import { createResponse, confirmResponse, markResponseDraft, ensureResponseOwnership } from './response.js';
import { createInterval, validateIntervalSet } from './interval.js';

const now = new Date('2026-10-01T12:00:00.000Z');
const groupId = '0e7c988a-a7ae-4b47-96a0-9ff7a0bf4ea1';
const participantId = '21661e34-c605-47de-87c1-f46d8074926b';
const pollId = '0e943dba-c879-4260-a1c7-ce36970307c8';
const responseId = '9b4eebbb-8a31-4381-8c6c-a11198bb16dc';

const pollInput = {
  title: 'Team meeting',
  startsOn: '2026-10-06',
  endsOn: '2026-10-12',
  dayStart: '16:00',
  dayEnd: '23:00',
  slotMinutes: 30 as const,
  meetingDurationMinutes: 60,
};

test('group trims its name and generates a unique, high-entropy invite code', () => {
  const first = createGroup({ name: '  CRM Team  ', timezone: 'Asia/Yekaterinburg' }, now);
  const second = createGroup({ name: 'CRM Team', timezone: 'Asia/Yekaterinburg' }, now);
  assert.equal(first.name, 'CRM Team');
  assert.match(first.id, /^[0-9a-f-]{36}$/);
  assert.match(first.inviteCode, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.inviteCode, second.inviteCode);
  assert.equal(first.createdAt.toISOString(), now.toISOString());
});

test('group rejects blank names and invalid timezones', () => {
  assert.throws(() => createGroup({ name: '  ', timezone: 'UTC' }), /name/i);
  assert.throws(() => createGroup({ name: 'Team', timezone: 'Mars\/Olympus' }), /timezone/i);
});

test('participant normalizes display names and returns its raw token only once', () => {
  const { participant, editToken } = createParticipant(groupId, '  Влада   Петрова  ', now);
  assert.equal(participant.displayName, 'Влада Петрова');
  assert.equal(participant.displayNameNormalized, 'влада петрова');
  assert.equal(participant.groupId, groupId);
  assert.match(editToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(participant.editTokenHash, /^[0-9a-f]{64}$/);
  assert.equal(participant.editTokenHash, createHash('sha256').update(editToken).digest('hex'));
  assert.ok(!JSON.stringify(participant).includes(editToken));
});

test('poll accepts a seven-day window and rejects an oversized meeting window', () => {
  const poll = createPoll(groupId, 1, pollInput, null, now);
  assert.equal(poll.status, 'OPEN');
  assert.equal(poll.sequenceNo, 1);
  assert.equal(poll.closedAt, null);
  assert.throws(() => createPoll(groupId, 1, { ...pollInput, endsOn: '2026-10-13' }), /seven days/i);
  assert.throws(() => createPoll(groupId, 1, { ...pollInput, dayEnd: '16:30', meetingDurationMinutes: 60 }), /daily window/i);
});

test('poll validates slot alignment, calendar dates, and its base group', () => {
  assert.throws(() => createPoll(groupId, 1, { ...pollInput, slotMinutes: 45 as 30 }), /slot/i);
  assert.throws(() => createPoll(groupId, 1, { ...pollInput, startsOn: '2026-02-30' }), /date/i);
  const basePoll = createPoll(groupId, 1, pollInput);
  assert.throws(() => ensureBasePollBelongsToGroup('another-group', basePoll), /same group/i);
});

test('closing a poll records its close time and prevents response writes', () => {
  const poll = createPoll(groupId, 1, pollInput);
  const closed = closePoll(poll, now);
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.closedAt?.toISOString(), now.toISOString());
  assert.throws(() => ensurePollOpen(closed), /closed/i);
});

test('response starts in draft and editing a confirmed response returns it to draft', () => {
  const draft = createResponse(pollId, participantId, now);
  assert.equal(draft.state, 'DRAFT');
  assert.equal(draft.confirmedAt, null);
  const confirmed = confirmResponse(draft, now);
  assert.equal(confirmed.state, 'CONFIRMED');
  assert.equal(confirmed.confirmedAt?.toISOString(), now.toISOString());
  const edited = markResponseDraft(confirmed, new Date('2026-10-02T12:00:00.000Z'));
  assert.equal(edited.state, 'DRAFT');
  assert.equal(edited.confirmedAt, null);
});

test('response ownership requires the participant and poll to share a group', () => {
  assert.throws(() => ensureResponseOwnership({ groupId }, { groupId: 'another-group' }), /same group/i);
});

test('preferred interval defaults to FLAT and nonpreferred interval has no direction', () => {
  const poll = createPoll(groupId, 1, pollInput);
  const preferred = createInterval(responseId, poll, {
    localDate: '2026-10-06', startTime: '18:00', endTime: '20:00', kind: 'PREFERRED',
  }, now);
  const unavailable = createInterval(responseId, poll, {
    localDate: '2026-10-06', startTime: '20:00', endTime: '21:00', kind: 'UNAVAILABLE',
  }, now);
  assert.equal(preferred.preferenceDirection, 'FLAT');
  assert.equal(unavailable.preferenceDirection, null);
  assert.throws(() => createInterval(responseId, poll, {
    localDate: '2026-10-06', startTime: '20:00', endTime: '21:00', kind: 'UNAVAILABLE', preferenceDirection: 'LATER',
  }), /direction/i);
});

test('interval rejects dates, times, and boundaries outside the poll grid', () => {
  const poll = createPoll(groupId, 1, pollInput);
  const base = { localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'IF_NEEDED' as const };
  assert.throws(() => createInterval(responseId, poll, { ...base, localDate: '2026-10-13' }), /date/i);
  assert.throws(() => createInterval(responseId, poll, { ...base, startTime: '15:30' }), /daily window/i);
  assert.throws(() => createInterval(responseId, poll, { ...base, startTime: '18:15' }), /slot/i);
  assert.throws(() => createInterval(responseId, poll, { ...base, endTime: '18:00' }), /start.*end/i);
});

test('interval set rejects overlaps but permits adjacent ranges', () => {
  const poll = createPoll(groupId, 1, pollInput);
  const first = createInterval(responseId, poll, {
    localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED',
  });
  const adjacent = createInterval(responseId, poll, {
    localDate: '2026-10-06', startTime: '19:00', endTime: '20:00', kind: 'UNAVAILABLE',
  });
  assert.doesNotThrow(() => validateIntervalSet([first, adjacent], poll));
  const overlapping = createInterval(responseId, poll, {
    localDate: '2026-10-06', startTime: '18:30', endTime: '19:30', kind: 'IF_NEEDED',
  });
  assert.throws(() => validateIntervalSet([first, overlapping], poll), /overlap/i);
});

test('interval set cannot mix intervals from different responses', () => {
  const poll = createPoll(groupId, 1, pollInput);
  const first = createInterval(responseId, poll, {
    localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED',
  });
  const another = createInterval('another-response', poll, {
    localDate: '2026-10-06', startTime: '19:00', endTime: '20:00', kind: 'PREFERRED',
  });
  assert.throws(() => validateIntervalSet([first, another], poll), /same response/i);
});
