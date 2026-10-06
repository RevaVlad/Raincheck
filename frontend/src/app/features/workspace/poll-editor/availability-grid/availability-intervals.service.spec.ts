import { TestBed } from '@angular/core/testing';

import { AvailabilityIntervalsService } from './availability-intervals.service';

describe('AvailabilityIntervalsService', () => {
  let intervals: AvailabilityIntervalsService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AvailabilityIntervalsService] });
    intervals = TestBed.inject(AvailabilityIntervalsService);
  });

  it.each([
    {
      slotMinutes: 30,
      loadedEnd: '10:00',
      clearedTime: '09:30',
      paintedTime: '10:00',
      expected: [
        {
          localDate: '2026-10-06',
          startTime: '09:00',
          endTime: '09:30',
          kind: 'PREFERRED',
          preferenceDirection: 'FLAT',
        },
        {
          localDate: '2026-10-06',
          startTime: '10:00',
          endTime: '10:30',
          kind: 'IF_NEEDED',
          preferenceDirection: null,
        },
      ],
    },
    {
      slotMinutes: 60,
      loadedEnd: '11:00',
      clearedTime: '10:00',
      paintedTime: '11:00',
      expected: [
        {
          localDate: '2026-10-06',
          startTime: '09:00',
          endTime: '10:00',
          kind: 'PREFERRED',
          preferenceDirection: 'FLAT',
        },
        {
          localDate: '2026-10-06',
          startTime: '11:00',
          endTime: '12:00',
          kind: 'IF_NEEDED',
          preferenceDirection: null,
        },
      ],
    },
  ])('loads, paints, clears, and serializes $slotMinutes-minute cells', ({
    slotMinutes,
    loadedEnd,
    clearedTime,
    paintedTime,
    expected,
  }) => {
    intervals.load(
      [
        {
          localDate: '2026-10-06',
          startTime: '09:00',
          endTime: loadedEnd,
          kind: 'PREFERRED',
        },
      ],
      slotMinutes,
    );

    expect(intervals.cellAt('2026-10-06', '09:00')).toBe('PREFERRED');
    expect(intervals.paint('2026-10-06', clearedTime, 'CLEAR')).toBe(true);
    expect(intervals.cellAt('2026-10-06', clearedTime)).toBeNull();
    expect(intervals.paint('2026-10-06', paintedTime, 'IF_NEEDED')).toBe(true);
    expect(intervals.toIntervals(slotMinutes)).toEqual(expected);
  });

  it('resets cells when a different poll is loaded', () => {
    intervals.load(
      [
        {
          localDate: '2026-10-06',
          startTime: '09:00',
          endTime: '09:30',
          kind: 'PREFERRED',
        },
      ],
      30,
    );

    intervals.reset();

    expect(intervals.cellAt('2026-10-06', '09:00')).toBeNull();
    expect(intervals.toIntervals(30)).toEqual([]);
  });
});
