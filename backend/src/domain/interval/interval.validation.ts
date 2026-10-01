import { INTERVAL_KIND, PREFERENCE_DIRECTION } from '#shared/constants';
import { utcCalendarDate, utcTimeMinutes } from '#shared/time/utc';
import type { AvailabilityInterval, IntervalInput, PollWindow, PreferenceDirection } from './interval.js';

export function validateInterval(input: IntervalInput, poll: PollWindow): PreferenceDirection | null {
  validateDate(input.localDate, poll);
  const { start, end, dayStart } = validateTimeRange(input, poll);
  validateSlotAlignment(start, end, dayStart, poll.slotMinutes);
  validateKind(input.kind);
  return validatePreferenceDirection(input);
}

export function validateIntervalSet(
  intervals: readonly AvailabilityInterval[],
  poll: PollWindow,
): void {
  const sorted = sortIntervals(intervals);
  sorted.forEach((interval) => validateInterval(interval, poll));
  validateResponseOwnership(sorted);
  validateNoOverlaps(sorted);
}

function validateDate(localDate: string, poll: PollWindow): void {
  const date = utcCalendarDate(localDate);
  if (date < utcCalendarDate(poll.startsOn) || date > utcCalendarDate(poll.endsOn)) {
    throw new RangeError('Interval date is outside the poll');
  }
}

function validateTimeRange(input: IntervalInput, poll: PollWindow) {
  const start = utcTimeMinutes(input.startTime);
  const end = utcTimeMinutes(input.endTime);
  const dayStart = utcTimeMinutes(poll.dayStart);
  const dayEnd = utcTimeMinutes(poll.dayEnd);
  if (end <= start) throw new RangeError('Interval start must precede end');
  if (start < dayStart || end > dayEnd) throw new RangeError('Interval is outside the daily window');
  return { start, end, dayStart };
}

function validateSlotAlignment(start: number, end: number, dayStart: number, slotMinutes: number): void {
  if ((start - dayStart) % slotMinutes !== 0 || (end - dayStart) % slotMinutes !== 0) {
    throw new RangeError('Interval boundaries must align to poll slots');
  }
}

function validateKind(kind: string): void {
  if (!Object.values(INTERVAL_KIND).includes(kind as never)) {
    throw new RangeError('Invalid interval kind');
  }
}

function validatePreferenceDirection(input: IntervalInput): PreferenceDirection | null {
  if (input.kind === INTERVAL_KIND.PREFERRED) {
    const direction = input.preferenceDirection ?? PREFERENCE_DIRECTION.FLAT;
    if (!Object.values(PREFERENCE_DIRECTION).includes(direction)) {
      throw new RangeError('Invalid preference direction');
    }
    return direction;
  }
  if (input.preferenceDirection != null) {
    throw new RangeError('Preference direction is only allowed for preferred intervals');
  }
  return null;
}

function sortIntervals(intervals: readonly AvailabilityInterval[]): AvailabilityInterval[] {
  return [...intervals].sort((left, right) =>
    left.localDate.localeCompare(right.localDate) || left.startTime.localeCompare(right.startTime));
}

function validateResponseOwnership(intervals: readonly AvailabilityInterval[]): void {
  const responseId = intervals[0]?.responseId;
  if (intervals.some((interval) => interval.responseId !== responseId)) {
    throw new Error('Intervals must belong to the same response');
  }
}

function validateNoOverlaps(intervals: readonly AvailabilityInterval[]): void {
  intervals.forEach((interval, index) => {
    const previous = intervals[index - 1];
    if (previous?.localDate === interval.localDate && previous.endTime > interval.startTime) {
      throw new RangeError('Intervals in one response must not overlap');
    }
  });
}
