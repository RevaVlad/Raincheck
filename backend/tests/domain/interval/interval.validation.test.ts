import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateInterval, validateIntervalSet } from '#domain/interval/interval.validation';
import type { AvailabilityInterval, IntervalInput, PollWindow } from '#domain/interval/interval';

const poll: PollWindow = {
  startsOn: '2026-10-06',
  endsOn: '2026-10-12',
  dayStart: '16:00',
  dayEnd: '23:00',
  slotMinutes: 30,
  timeZone: 'UTC',
  createdAt: new Date('2026-10-01T12:00:00.000Z'),
};
const valid: IntervalInput = {
  startAt: '2026-10-06T18:00:00.000Z',
  endAt: '2026-10-06T19:00:00.000Z',
  kind: 'PREFERRED',
};

void test('defaults a preferred interval direction to flat', () => {
  assert.equal(validateInterval(valid, poll), 'FLAT');
});

void test('accepts a UTC interval crossing midnight when it covers generated poll slots', () => {
  const localEvening: PollWindow = {
    ...poll,
    startsOn: '2026-10-06',
    endsOn: '2026-10-06',
    dayStart: '16:00',
    dayEnd: '17:00',
    timeZone: 'America/Los_Angeles',
  };
  assert.equal(
    validateInterval(
      {
        startAt: '2026-10-06T23:00:00.000Z',
        endAt: '2026-10-07T00:00:00.000Z',
        kind: 'IF_NEEDED',
      },
      localEvening,
    ),
    null,
  );
});

void test('rejects an interval outside the poll date range', () => {
  assert.throws(
    () =>
      validateInterval(
        { ...valid, startAt: '2026-10-13T18:00:00.000Z', endAt: '2026-10-13T19:00:00.000Z' },
        poll,
      ),
    /poll/i,
  );
});

void test('rejects an interval outside the daily window', () => {
  assert.throws(
    () => validateInterval({ ...valid, startAt: '2026-10-06T15:30:00.000Z' }, poll),
    /poll slot/i,
  );
});

void test('rejects a boundary that is not aligned to a generated slot', () => {
  assert.throws(
    () => validateInterval({ ...valid, startAt: '2026-10-06T18:15:00.000Z' }, poll),
    /poll slot/i,
  );
});

void test('rejects overlapping intervals by their exact UTC instants', () => {
  const first: AvailabilityInterval = {
    ...valid,
    id: '1',
    responseId: 'response',
    kind: 'PREFERRED',
    preferenceDirection: 'FLAT',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const second = {
    ...first,
    id: '2',
    startAt: '2026-10-06T18:30:00.000Z',
    endAt: '2026-10-06T19:30:00.000Z',
  };
  assert.throws(() => validateIntervalSet([first, second], poll), /overlap/i);
});
