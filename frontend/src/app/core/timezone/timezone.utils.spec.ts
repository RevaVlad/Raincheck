import {
  convertUtcToLocalSlot,
  formatLocalDate,
  formatWeekday,
  isValidTimeZone,
} from './timezone.utils';

describe('timezone functions', () => {
  it('validates zones and falls back to UTC for invalid inputs', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(convertUtcToLocalSlot('2026-03-08', '06:30', 'Not/AZone')).toMatchObject({
      localDate: '2026-03-08',
      localTime: '06:30',
      offset: 'UTC+00:00',
    });
  });

  it('formats Russian dates and weekdays with an explicit timezone', () => {
    const date = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date('2026-10-02T12:00:00Z'));
    const weekday = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(new Date('2026-10-02T12:00:00Z'));

    expect(formatLocalDate('2026-10-02', 'UTC')).toBe(date);
    expect(formatWeekday('2026-10-02', 'UTC')).toBe(weekday);
  });
});
