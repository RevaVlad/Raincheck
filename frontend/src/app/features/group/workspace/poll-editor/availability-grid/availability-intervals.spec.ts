import { compressCellsToIntervals, expandIntervalsToCells } from './availability-intervals';
import type { PollSlot } from '../../../../../core/api/api.types';

const slots: PollSlot[] = [
  { startAt: '2026-10-06T23:30:00.000Z', endAt: '2026-10-07T00:00:00.000Z' },
  { startAt: '2026-10-07T00:00:00.000Z', endAt: '2026-10-07T00:30:00.000Z' },
  { startAt: '2026-10-07T01:00:00.000Z', endAt: '2026-10-07T01:30:00.000Z' },
];

describe('UTC availability interval conversions', () => {
  it('restores saved UTC intervals into their exact cells', () => {
    expect(
      expandIntervalsToCells(
        [
          {
            startAt: slots[0].startAt,
            endAt: slots[1].endAt,
            kind: 'PREFERRED',
            preferenceDirection: 'FLAT',
          },
        ],
        slots,
      ),
    ).toEqual({
      [slots[0].startAt]: 'PREFERRED',
      [slots[1].startAt]: 'PREFERRED',
    });
  });

  it('compresses adjacent UTC slots across midnight and keeps gaps separate', () => {
    expect(
      compressCellsToIntervals(
        {
          [slots[0].startAt]: 'PREFERRED',
          [slots[1].startAt]: 'PREFERRED',
          [slots[2].startAt]: 'IF_NEEDED',
        },
        slots,
      ),
    ).toEqual([
      {
        startAt: slots[0].startAt,
        endAt: slots[1].endAt,
        kind: 'PREFERRED',
        preferenceDirection: 'FLAT',
      },
      {
        startAt: slots[2].startAt,
        endAt: slots[2].endAt,
        kind: 'IF_NEEDED',
        preferenceDirection: null,
      },
    ]);
  });

  it('round-trips cells and leaves an unselected poll slot empty', () => {
    const original = {
      [slots[0].startAt]: 'UNAVAILABLE' as const,
      [slots[2].startAt]: 'PREFERRED' as const,
    };
    const intervals = compressCellsToIntervals(original, slots);
    expect(expandIntervalsToCells(intervals, slots)).toEqual(original);
  });
});
