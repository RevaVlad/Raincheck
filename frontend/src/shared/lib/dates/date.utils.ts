export type DateStyle = 'short' | 'long';

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function detectBrowserTimeZone(): string {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(timeZone) ? timeZone : 'UTC';
  } catch {
    return 'UTC';
  }
}

export function localCalendarDate(instant: string, timeZone: string): string {
  const parts = localDateParts(instant, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatCalendarDate(date: string, style: DateStyle): string {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: style === 'short' ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${date}T12:00:00.000Z`));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const month = value('month');
  const monthLabel = style === 'short' && !month.endsWith('.') ? `${month}.` : month;
  return `${value('day')} ${monthLabel} ${value('year')}`;
}

export function formatInstantDate(instant: string, timeZone: string, style: DateStyle): string {
  return formatCalendarDate(localCalendarDate(instant, validZone(timeZone)), style);
}

export function formatInstantTime(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: validZone(timeZone),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('hour')}:${value('minute')}`;
}

export function formatInstantWeekday(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: validZone(timeZone),
    weekday: 'short',
  }).format(new Date(instant));
}

export function formatInstantDateTime(
  instant: string,
  timeZone: string,
  style: DateStyle = 'long',
): string {
  return `${formatInstantDate(instant, timeZone, style)}, ${formatInstantTime(instant, timeZone)}`;
}

export function localScheduleTime(
  date: string,
  time: string,
  scheduleTimeZone: string,
  scheduleCreatedAt: string,
  viewTimeZone: string,
): string {
  const localAsUtc = new Date(`${date}T${time}:00.000Z`);
  const offset = timeZoneOffsetMinutes(scheduleTimeZone, new Date(scheduleCreatedAt));
  const instant = new Date(localAsUtc.getTime() - offset * 60_000).toISOString();
  return formatInstantTime(instant, viewTimeZone);
}

export function timeZoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(at);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const localAsUtc = new Date(0);
  localAsUtc.setUTCFullYear(value('year'), value('month') - 1, value('day'));
  localAsUtc.setUTCHours(value('hour'), value('minute'), value('second'), 0);
  return Math.round((localAsUtc.getTime() - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function localDateParts(instant: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: validZone(timeZone),
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { year: value('year'), month: value('month'), day: value('day') };
}

function validZone(timeZone: string): string {
  return isValidTimeZone(timeZone) ? timeZone : 'UTC';
}
