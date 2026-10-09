import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePoll } from '#domain/poll/poll.validation';
import type { PollInput } from '#domain/poll/poll';

const validPoll: PollInput = {
  title: ' Team sync ',
  startsOn: '2026-10-06',
  endsOn: '2026-10-12',
  dayStart: '16:00',
  dayEnd: '23:00',
  timeZone: 'Europe/Berlin',
  slotMinutes: 30,
  meetingDurationMinutes: 60,
};

void test('normalizes a valid poll', () => {
  assert.equal(validatePoll(1, validPoll).title, 'Team sync');
});

void test('rejects an invalid sequence number', () => {
  assert.throws(() => validatePoll(0, validPoll), /sequence/i);
});

void test('rejects an invalid date range', () => {
  assert.throws(() => validatePoll(1, { ...validPoll, endsOn: '2026-10-13' }), /seven days/i);
});

void test('rejects an invalid daily window', () => {
  assert.throws(() => validatePoll(1, { ...validPoll, dayEnd: '16:00' }), /day end/i);
});

void test('rejects an invalid poll time zone', () => {
  assert.throws(() => validatePoll(1, { ...validPoll, timeZone: 'No/SuchZone' }), /time zone/i);
});

void test('rejects an unsupported slot size', () => {
  assert.throws(() => validatePoll(1, { ...validPoll, slotMinutes: 45 as 30 }), /slot/i);
});

void test('rejects a meeting that does not fit the window', () => {
  assert.throws(
    () => validatePoll(1, { ...validPoll, dayEnd: '16:30', meetingDurationMinutes: 60 }),
    /window/i,
  );
});
