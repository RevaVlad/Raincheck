import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pollSlots, timeZoneOffsetMinutes } from '#shared/time/time-zone';
import { daysInclusive, utcTimeMinutes } from '#shared/time/utc';

void test('UTC date math stays stable across a daylight-saving change', () => {
  const previousZone = process.env['TZ'];
  try {
    process.env['TZ'] = 'Europe/Berlin';
    assert.equal(daysInclusive('2026-03-28', '2026-03-30'), 3);
    assert.equal(utcTimeMinutes('23:30'), 23 * 60 + 30);
  } finally {
    if (previousZone === undefined) delete process.env['TZ'];
    else process.env['TZ'] = previousZone;
  }
});

void test('poll slots keep the creation offset and preserve exact UTC bounds', () => {
  const poll = {
    id: 'poll-1',
    groupId: 'group-1',
    sequenceNo: 1,
    title: null,
    startsOn: '2026-03-28',
    endsOn: '2026-03-29',
    dayStart: '09:00',
    dayEnd: '10:00',
    slotMinutes: 30 as const,
    meetingDurationMinutes: 30,
    timeZone: 'Europe/Berlin',
    basedOnPollId: null,
    createdAt: new Date('2026-03-01T12:00:00.000Z'),
    status: 'OPEN' as const,
    closedAt: null,
  };

  assert.equal(timeZoneOffsetMinutes('Asia/Kolkata', poll.createdAt), 330);
  assert.deepEqual(pollSlots(poll), [
    { startAt: '2026-03-28T08:00:00.000Z', endAt: '2026-03-28T08:30:00.000Z' },
    { startAt: '2026-03-28T08:30:00.000Z', endAt: '2026-03-28T09:00:00.000Z' },
    { startAt: '2026-03-29T08:00:00.000Z', endAt: '2026-03-29T08:30:00.000Z' },
    { startAt: '2026-03-29T08:30:00.000Z', endAt: '2026-03-29T09:00:00.000Z' },
  ]);
});

void test('poll slots can cross UTC midnight without shifting the calendar day', () => {
  const poll = {
    id: 'poll-2',
    groupId: 'group-1',
    sequenceNo: 1,
    title: null,
    startsOn: '2026-10-08',
    endsOn: '2026-10-08',
    dayStart: '00:00',
    dayEnd: '01:00',
    slotMinutes: 30 as const,
    meetingDurationMinutes: 30,
    timeZone: 'Asia/Kolkata',
    basedOnPollId: null,
    createdAt: new Date('2026-10-08T12:00:00.000Z'),
    status: 'OPEN' as const,
    closedAt: null,
  };

  assert.deepEqual(pollSlots(poll), [
    { startAt: '2026-10-07T18:30:00.000Z', endAt: '2026-10-07T19:00:00.000Z' },
    { startAt: '2026-10-07T19:00:00.000Z', endAt: '2026-10-07T19:30:00.000Z' },
  ]);
});
