import { TestBed } from '@angular/core/testing';
import type { PollSlot } from '../../../../../core/api/api.types';
import { AvailabilityIntervalsService } from './availability-intervals.service';

describe('AvailabilityIntervalsService', () => {
  it('loads, paints, clears, and serializes cells by UTC slot', () => {
    TestBed.configureTestingModule({ providers: [AvailabilityIntervalsService] });
    const intervals = TestBed.inject(AvailabilityIntervalsService);
    const slots: PollSlot[] = [
      { startAt: '2026-10-06T23:30:00.000Z', endAt: '2026-10-07T00:00:00.000Z' },
      { startAt: '2026-10-07T00:00:00.000Z', endAt: '2026-10-07T00:30:00.000Z' },
    ];

    intervals.load(
      [
        {
          startAt: slots[0].startAt,
          endAt: slots[1].endAt,
          kind: 'PREFERRED',
          preferenceDirection: 'FLAT',
        },
      ],
      slots,
    );
    expect(intervals.cellAt(slots[0].startAt)).toBe('PREFERRED');
    expect(intervals.paint(slots[0].startAt, 'CLEAR')).toBe(true);
    expect(intervals.cellAt(slots[0].startAt)).toBeNull();
    expect(intervals.toIntervals(slots)).toEqual([
      {
        startAt: slots[1].startAt,
        endAt: slots[1].endAt,
        kind: 'PREFERRED',
        preferenceDirection: 'FLAT',
      },
    ]);

    intervals.reset();
    expect(intervals.toIntervals(slots)).toEqual([]);
  });
});
