import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AvailabilityInterval } from '#domain/interval/interval';
import type { Poll } from '#domain/poll/poll';
import { buildSuggestions, calculateResults } from '#services/analytics/analytics';

const createdAt = new Date('2026-10-01T00:00:00.000Z');

void test('suggestions match viewer-local weekday and time, then subtract UTC overlaps', () => {
  const target = poll({
    startsOn: '2026-10-12',
    endsOn: '2026-10-12',
    dayStart: '10:30',
    dayEnd: '11:30',
    timeZone: 'UTC',
  });
  const source = [interval('source', '2026-10-05T10:30:00.000Z', '2026-10-05T11:30:00.000Z')];
  const current = [interval('current', '2026-10-12T10:30:00.000Z', '2026-10-12T11:00:00.000Z')];

  assert.deepEqual(buildSuggestions(target, 'previous', source, current, 'Asia/Kolkata'), [
    {
      sourcePollId: 'previous',
      sourceIntervalId: 'source',
      startAt: '2026-10-12T11:00:00.000Z',
      endAt: '2026-10-12T11:30:00.000Z',
      kind: 'PREFERRED',
      preferenceDirection: 'FLAT',
    },
  ]);
});

void test('results keep each UTC row separate and rank exact meeting bounds', () => {
  const target = poll({
    startsOn: '2026-10-12',
    endsOn: '2026-10-12',
    dayStart: '16:00',
    dayEnd: '17:00',
    timeZone: 'America/Los_Angeles',
  });
  const results = calculateResults(target, 1, [
    {
      participantId: 'person',
      intervals: [
        interval(
          'unavailable',
          '2026-10-12T23:00:00.000Z',
          '2026-10-12T23:30:00.000Z',
          'UNAVAILABLE',
        ),
        interval('preferred', '2026-10-12T23:30:00.000Z', '2026-10-13T00:00:00.000Z'),
      ],
    },
  ]);

  assert.deepEqual(
    results.heatmap.map(({ startAt, endAt, available, unavailable }) => ({
      startAt,
      endAt,
      available,
      unavailable,
    })),
    [
      {
        startAt: '2026-10-12T23:00:00.000Z',
        endAt: '2026-10-12T23:30:00.000Z',
        available: 0,
        unavailable: 1,
      },
      {
        startAt: '2026-10-12T23:30:00.000Z',
        endAt: '2026-10-13T00:00:00.000Z',
        available: 1,
        unavailable: 0,
      },
    ],
  );
  assert.equal(results.bestSlots[0]?.startAt, '2026-10-12T23:30:00.000Z');
  assert.equal(results.bestSlots[0]?.endAt, '2026-10-13T00:00:00.000Z');
});

function poll(
  overrides: Pick<Poll, 'startsOn' | 'endsOn' | 'dayStart' | 'dayEnd' | 'timeZone'>,
): Poll {
  return {
    id: 'poll',
    groupId: 'group',
    sequenceNo: 1,
    title: null,
    ...overrides,
    slotMinutes: 30,
    meetingDurationMinutes: 30,
    status: 'OPEN',
    basedOnPollId: null,
    createdAt,
    closedAt: null,
  };
}

function interval(
  id: string,
  startAt: string,
  endAt: string,
  kind: AvailabilityInterval['kind'] = 'PREFERRED',
): AvailabilityInterval {
  const fields = {
    id,
    responseId: id,
    startAt,
    endAt,
    createdAt,
    updatedAt: createdAt,
  };
  return kind === 'PREFERRED'
    ? { ...fields, kind, preferenceDirection: 'FLAT' }
    : { ...fields, kind, preferenceDirection: null };
}
