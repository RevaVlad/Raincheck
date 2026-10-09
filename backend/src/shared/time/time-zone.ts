import type { Poll, PollSlot } from '#domain/poll/poll';
import { daysInclusive, utcCalendarDate, utcTimeMinutes } from './utc.js';

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

export function pollSlots(
  poll: Pick<
    Poll,
    'startsOn' | 'endsOn' | 'dayStart' | 'dayEnd' | 'slotMinutes' | 'timeZone' | 'createdAt'
  >,
): PollSlot[] {
  const offset = timeZoneOffsetMinutes(poll.timeZone, poll.createdAt);
  const startMinute = utcTimeMinutes(poll.dayStart);
  const endMinute = utcTimeMinutes(poll.dayEnd);
  const slots: PollSlot[] = [];

  for (let day = 0; day < daysInclusive(poll.startsOn, poll.endsOn); day++) {
    const localDate = new Date(utcCalendarDate(poll.startsOn) + day * 86_400_000);
    const dateStart = localDate.getTime();
    for (
      let minute = startMinute;
      minute + poll.slotMinutes <= endMinute;
      minute += poll.slotMinutes
    ) {
      const startAt = new Date(dateStart + (minute - offset) * 60_000);
      const endAt = new Date(startAt.getTime() + poll.slotMinutes * 60_000);
      slots.push({ startAt: startAt.toISOString(), endAt: endAt.toISOString() });
    }
  }
  return slots;
}
