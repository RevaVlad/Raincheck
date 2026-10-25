import { timeZoneOffsetMinutes } from '#shared/time/time-zone';

export function validateViewerTimeZone(timeZone: string): string {
  try {
    timeZoneOffsetMinutes(timeZone, new Date());
    return timeZone;
  } catch {
    throw new RangeError('A valid IANA time zone is required');
  }
}
