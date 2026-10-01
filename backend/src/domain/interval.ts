import { randomUUID } from 'node:crypto';
import { calendarDate, timeMinutes, type Poll } from './poll.js';

export type IntervalKind = 'UNAVAILABLE' | 'IF_NEEDED' | 'PREFERRED';
export type PreferenceDirection = 'EARLIER' | 'FLAT' | 'LATER';

interface IntervalFields {
  id: string;
  responseId: string;
  localDate: string;
  startTime: string;
  endTime: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AvailabilityInterval = IntervalFields & (
  | { kind: 'PREFERRED'; preferenceDirection: PreferenceDirection }
  | { kind: 'UNAVAILABLE' | 'IF_NEEDED'; preferenceDirection: null }
);

export interface IntervalInput {
  localDate: string;
  startTime: string;
  endTime: string;
  kind: IntervalKind;
  preferenceDirection?: PreferenceDirection | null;
}

function validateInterval(input: IntervalInput, poll: Poll): PreferenceDirection | null {
  const localDate = calendarDate(input.localDate);
  if (localDate < calendarDate(poll.startsOn) || localDate > calendarDate(poll.endsOn)) {
    throw new RangeError('Interval date is outside the poll');
  }
  const start = timeMinutes(input.startTime);
  const end = timeMinutes(input.endTime);
  if (end <= start) {
    throw new RangeError('Interval start must precede end');
  }
  const dayStart = timeMinutes(poll.dayStart);
  const dayEnd = timeMinutes(poll.dayEnd);
  if (start < dayStart || end > dayEnd) {
    throw new RangeError('Interval is outside the daily window');
  }
  if ((start - dayStart) % poll.slotMinutes !== 0 || (end - dayStart) % poll.slotMinutes !== 0) {
    throw new RangeError('Interval boundaries must align to poll slots');
  }
  if (!['UNAVAILABLE', 'IF_NEEDED', 'PREFERRED'].includes(input.kind)) {
    throw new RangeError('Invalid interval kind');
  }
  if (input.kind === 'PREFERRED') {
    const direction = input.preferenceDirection ?? 'FLAT';
    if (!['EARLIER', 'FLAT', 'LATER'].includes(direction)) {
      throw new RangeError('Invalid preference direction');
    }
    return direction;
  }
  if (input.preferenceDirection != null) {
    throw new RangeError('Preference direction is only allowed for preferred intervals');
  }
  return null;
}

export function createInterval(
  responseId: string,
  poll: Poll,
  input: IntervalInput,
  now = new Date(),
): AvailabilityInterval {
  const preferenceDirection = validateInterval(input, poll);
  const fields: IntervalFields = {
    id: randomUUID(), responseId,
    localDate: input.localDate, startTime: input.startTime, endTime: input.endTime,
    createdAt: now, updatedAt: now,
  };
  if (input.kind === 'PREFERRED') {
    return { ...fields, kind: 'PREFERRED', preferenceDirection: preferenceDirection! };
  }
  return { ...fields, kind: input.kind, preferenceDirection: null };
}

export function validateIntervalSet(intervals: readonly AvailabilityInterval[], poll: Poll): void {
  const sorted = [...intervals].sort((a, b) =>
    a.localDate.localeCompare(b.localDate) || a.startTime.localeCompare(b.startTime));
  for (const [index, interval] of sorted.entries()) {
    validateInterval(interval, poll);
    if (interval.responseId !== sorted[0]?.responseId) {
      throw new Error('Intervals must belong to the same response');
    }
    const previous = sorted[index - 1];
    if (previous && previous.localDate === interval.localDate && previous.endTime > interval.startTime) {
      throw new RangeError('Intervals in one response must not overlap');
    }
  }
}
