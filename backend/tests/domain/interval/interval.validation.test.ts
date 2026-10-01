import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateInterval, validateIntervalSet } from '#domain/interval/interval.validation';
import type { IntervalInput, PollWindow } from '#domain/interval/interval';

const poll: PollWindow = {
  startsOn: '2026-10-06', endsOn: '2026-10-12', dayStart: '16:00',
  dayEnd: '23:00', slotMinutes: 30,
};
const valid: IntervalInput = {
  localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED',
};

test('defaults a preferred interval direction to flat', () => {
  assert.equal(validateInterval(valid, poll), 'FLAT');
});

test('rejects an interval outside the poll date range', () => {
  assert.throws(() => validateInterval({ ...valid, localDate: '2026-10-13' }, poll), /date/i);
});

test('rejects an interval outside the daily window', () => {
  assert.throws(() => validateInterval({ ...valid, startTime: '15:30' }, poll), /daily window/i);
});

test('rejects a boundary that is not aligned to a slot', () => {
  assert.throws(() => validateInterval({ ...valid, startTime: '18:15' }, poll), /slot/i);
});

test('rejects overlapping intervals', () => {
  const first = { ...valid, kind: 'PREFERRED' as const, id: '1', responseId: 'response', preferenceDirection: 'FLAT' as const,
    createdAt: new Date(), updatedAt: new Date() };
  const second = { ...first, id: '2', startTime: '18:30', endTime: '19:30' };
  assert.throws(() => validateIntervalSet([first, second], poll), /overlap/i);
});
