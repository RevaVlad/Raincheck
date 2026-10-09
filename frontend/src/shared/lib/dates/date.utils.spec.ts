import {
  detectBrowserTimeZone,
  formatCalendarDate,
  formatInstantTime,
  localCalendarDate,
  localScheduleTime,
} from './date.utils';

describe('local date and time formatting', () => {
  it('keeps calendar date strings fixed at UTC midnight boundaries', () => {
    expect(formatCalendarDate('2026-10-07', 'long')).toBe('7 октября 2026');
    expect(formatCalendarDate('2026-10-07', 'short')).toBe('7 окт. 2026');
  });

  it('formats exact moments in the viewing zone without an offset label', () => {
    expect(formatInstantTime('2026-10-08T09:30:00.000Z', 'Asia/Yekaterinburg')).toBe('14:30');
  });

  it('computes tomorrow from the device calendar date', () => {
    expect(localCalendarDate('2026-10-06T20:30:00.000Z', 'Asia/Yekaterinburg')).toBe('2026-10-07');
  });

  it('copies a previous poll time as it appears in the viewing zone', () => {
    expect(
      localScheduleTime(
        '2026-10-06',
        '16:00',
        'America/Los_Angeles',
        '2026-10-01T10:00:00.000Z',
        'Asia/Yekaterinburg',
      ),
    ).toBe('04:00');
  });

  it('falls back to UTC when the browser cannot report a valid zone', () => {
    const original = Intl.DateTimeFormat;
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('time zone unavailable');
    });
    try {
      expect(detectBrowserTimeZone()).toBe('UTC');
    } finally {
      vi.restoreAllMocks();
      expect(Intl.DateTimeFormat).toBe(original);
    }
  });
});
