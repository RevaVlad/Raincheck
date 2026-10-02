import { compressCellsToIntervals, expandIntervalsToCells } from './availability-intervals';

describe('availability interval conversions', () => {
  it('expands intervals into 30-minute cells with an exclusive end', () => {
    expect(
      expandIntervalsToCells([
        {
          localDate: '2026-10-06',
          startTime: '09:00',
          endTime: '10:00',
          kind: 'PREFERRED',
        },
      ]),
    ).toEqual({
      '2026-10-06|09:00': 'PREFERRED',
      '2026-10-06|09:30': 'PREFERRED',
    });
  });

  it('expands intervals into 60-minute cells', () => {
    expect(
      expandIntervalsToCells(
        [
          {
            localDate: '2026-10-06',
            startTime: '09:00',
            endTime: '11:00',
            kind: 'IF_NEEDED',
          },
        ],
        60,
      ),
    ).toEqual({
      '2026-10-06|09:00': 'IF_NEEDED',
      '2026-10-06|10:00': 'IF_NEEDED',
    });
  });

  it('compresses adjacent cells and serializes preference direction', () => {
    expect(
      compressCellsToIntervals(
        {
          '2026-10-06|09:00': 'PREFERRED',
          '2026-10-06|09:30': 'PREFERRED',
          '2026-10-06|10:00': 'UNAVAILABLE',
        },
      ),
    ).toEqual([
      {
        localDate: '2026-10-06',
        startTime: '09:00',
        endTime: '10:00',
        kind: 'PREFERRED',
        preferenceDirection: 'FLAT',
      },
      {
        localDate: '2026-10-06',
        startTime: '10:00',
        endTime: '10:30',
        kind: 'UNAVAILABLE',
        preferenceDirection: null,
      },
    ]);
  });

  it('splits intervals when adjacent cells have different kinds', () => {
    const intervals = compressCellsToIntervals(
      {
        '2026-10-06|09:00': 'PREFERRED',
        '2026-10-06|09:30': 'IF_NEEDED',
      },
    );

    expect(intervals.map(({ startTime, endTime, kind }) => [startTime, endTime, kind])).toEqual([
      ['09:00', '09:30', 'PREFERRED'],
      ['09:30', '10:00', 'IF_NEEDED'],
    ]);
  });

  it('keeps gaps as separate intervals', () => {
    const intervals = compressCellsToIntervals(
      {
        '2026-10-06|09:00': 'PREFERRED',
        '2026-10-06|10:00': 'PREFERRED',
      },
    );

    expect(intervals.map(({ startTime, endTime }) => [startTime, endTime])).toEqual([
      ['09:00', '09:30'],
      ['10:00', '10:30'],
    ]);
  });

  it('sorts intervals by date and start time', () => {
    const intervals = compressCellsToIntervals({
      '2026-10-07|09:00': 'UNAVAILABLE',
      '2026-10-06|10:00': 'IF_NEEDED',
      '2026-10-06|09:00': 'PREFERRED',
    });

    expect(intervals.map(({ localDate, startTime }) => [localDate, startTime])).toEqual([
      ['2026-10-06', '09:00'],
      ['2026-10-06', '10:00'],
      ['2026-10-07', '09:00'],
    ]);
  });

  it('compresses 60-minute cells into 60-minute intervals', () => {
    expect(
      compressCellsToIntervals(
        {
          '2026-10-06|09:00': 'IF_NEEDED',
          '2026-10-06|10:00': 'IF_NEEDED',
        },
        60,
      ),
    ).toEqual([
      {
        localDate: '2026-10-06',
        startTime: '09:00',
        endTime: '11:00',
        kind: 'IF_NEEDED',
        preferenceDirection: null,
      },
    ]);
  });

  it('round-trips supported MVP intervals at 30- and 60-minute slot sizes', () => {
    const intervals = [
      {
        localDate: '2026-10-06',
        startTime: '09:00',
        endTime: '10:00',
        kind: 'PREFERRED' as const,
      },
      {
        localDate: '2026-10-06',
        startTime: '10:30',
        endTime: '11:00',
        kind: 'UNAVAILABLE' as const,
      },
      {
        localDate: '2026-10-07',
        startTime: '14:00',
        endTime: '15:00',
        kind: 'IF_NEEDED' as const,
      },
    ];

    const cells = expandIntervalsToCells(intervals);

    expect(compressCellsToIntervals(cells)).toEqual([
      {
        ...intervals[0],
        preferenceDirection: 'FLAT',
      },
      {
        ...intervals[1],
        preferenceDirection: null,
      },
      {
        ...intervals[2],
        preferenceDirection: null,
      },
    ]);

    expect(compressCellsToIntervals(expandIntervalsToCells([intervals[2]], 60), 60)).toEqual([
      { ...intervals[2], preferenceDirection: null },
    ]);
  });
});
