import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInterval } from '#services/interval/interval.service';
import { validateIntervalSet } from '#entities/interval.validation';
import { pollInput } from '../../support/database.js';

const now = new Date('2026-10-01T12:00:00.000Z');
const responseId = '9b4eebbb-8a31-4381-8c6c-a11198bb16dc';

test('preferred interval defaults to FLAT and nonpreferred interval has no direction', () => {
  const poll = pollInput;
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
  const poll = pollInput;
  const base = { localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'IF_NEEDED' as const };
  assert.throws(() => createInterval(responseId, poll, { ...base, localDate: '2026-10-13' }), /date/i);
  assert.throws(() => createInterval(responseId, poll, { ...base, startTime: '15:30' }), /daily window/i);
  assert.throws(() => createInterval(responseId, poll, { ...base, startTime: '18:15' }), /slot/i);
  assert.throws(() => createInterval(responseId, poll, { ...base, endTime: '18:00' }), /start.*end/i);
});

test('interval set rejects overlaps but permits adjacent ranges', () => {
  const poll = pollInput;
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
  const poll = pollInput;
  const first = createInterval(responseId, poll, {
    localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED',
  });
  const another = createInterval('another-response', poll, {
    localDate: '2026-10-06', startTime: '19:00', endTime: '20:00', kind: 'PREFERRED',
  });
  assert.throws(() => validateIntervalSet([first, another], poll), /same response/i);
});
