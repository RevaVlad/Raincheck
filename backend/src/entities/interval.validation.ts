import { INTERVAL_KIND, PREFERENCE_DIRECTION } from '#shared/constants';
import { utcCalendarDate, utcTimeMinutes } from '#shared/utils/time';
import type { AvailabilityInterval, IntervalInput, PollWindow, PreferenceDirection } from './interval.js';

export function validateInterval(input: IntervalInput, poll: PollWindow): PreferenceDirection | null {
  const date = utcCalendarDate(input.localDate);
  if (date < utcCalendarDate(poll.startsOn) || date > utcCalendarDate(poll.endsOn)) {
    throw new RangeError('Interval date is outside the poll');
  }
  const start = utcTimeMinutes(input.startTime);
  const end = utcTimeMinutes(input.endTime);
  if (end <= start) throw new RangeError('Interval start must precede end');
  const dayStart = utcTimeMinutes(poll.dayStart);
  const dayEnd = utcTimeMinutes(poll.dayEnd);
  if (start < dayStart || end > dayEnd) throw new RangeError('Interval is outside the daily window');
  if ((start - dayStart) % poll.slotMinutes !== 0 || (end - dayStart) % poll.slotMinutes !== 0) {
    throw new RangeError('Interval boundaries must align to poll slots');
  }
  if (!Object.values(INTERVAL_KIND).includes(input.kind)) throw new RangeError('Invalid interval kind');
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

export function validateIntervalSet(intervals: readonly AvailabilityInterval[], poll: PollWindow): void {
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
