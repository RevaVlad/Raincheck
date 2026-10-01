const MILLISECONDS_PER_DAY = 86_400_000;

export function utcCalendarDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('Invalid calendar date');
  const [year, month, day] = value.split('-').map(Number);
  const epoch = Date.UTC(year!, month! - 1, day!);
  if (new Date(epoch).toISOString().slice(0, 10) !== value) {
    throw new RangeError('Invalid calendar date');
  }
  return epoch;
}

export function utcTimeMinutes(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new RangeError('Invalid UTC time');
  const [hour, minute] = value.split(':').map(Number);
  return hour! * 60 + minute!;
}

export function daysInclusive(start: string, end: string): number {
  return (utcCalendarDate(end) - utcCalendarDate(start)) / MILLISECONDS_PER_DAY + 1;
}
