import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePoll } from '#domain/poll/poll.validation';
import type { PollInput } from '#domain/poll/poll';

const validPoll: PollInput = {
  title: ' Team sync ', startsOn: '2026-10-06', endsOn: '2026-10-12',
  dayStart: '16:00', dayEnd: '23:00', slotMinutes: 30,
  meetingDurationMinutes: 60,
};

test('normalizes a valid poll', () => {
  assert.equal(validatePoll(1, validPoll).title, 'Team sync');
});

test('rejects an invalid sequence number', () => {
  assert.throws(() => validatePoll(0, validPoll), /sequence/i);
});

test('rejects an invalid date range', () => {
  assert.throws(() => validatePoll(1, { ...validPoll, endsOn: '2026-10-13' }), /seven days/i);
});

test('rejects an invalid daily window', () => {
  assert.throws(() => validatePoll(1, { ...validPoll, dayEnd: '16:00' }), /day end/i);
});

test('rejects an unsupported slot size', () => {
  assert.throws(() => validatePoll(1, { ...validPoll, slotMinutes: 45 as 30 }), /slot/i);
});

test('rejects a meeting that does not fit the window', () => {
  assert.throws(() => validatePoll(1, { ...validPoll, dayEnd: '16:30', meetingDurationMinutes: 60 }), /window/i);
});
