export interface LocalSlot {
  localDate: string;
  localTime: string;
  offset: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function convertUtcToLocalSlot(
  utcDate: string,
  utcTime: string,
  timeZone: string,
): LocalSlot {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    });
    formatters.set(zone, formatter);
  }

  const parts = formatter.formatToParts(new Date(`${utcDate}T${utcTime}:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? '';
  return {
    localDate: `${part('year')}-${part('month')}-${part('day')}`,
    localTime: `${part('hour')}:${part('minute')}`,
    offset: part('timeZoneName').replace('GMT', 'UTC'),
  };
}

export function formatLocalDate(localDate: string, timeZone: string): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: zone,
  }).format(new Date(`${localDate}T12:00:00Z`));
}

export function formatWeekday(localDate: string, timeZone: string): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: zone }).format(
    new Date(`${localDate}T12:00:00Z`),
  );
}
