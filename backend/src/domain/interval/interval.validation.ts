import { INTERVAL_KIND, PREFERENCE_DIRECTION } from '#shared/constants';
import { pollSlots } from '#shared/time/time-zone';
import type {
  AvailabilityInterval,
  IntervalInput,
  PollWindow,
  PreferenceDirection,
} from './interval.js';

export function validateInterval(
  input: IntervalInput,
  poll: PollWindow,
): PreferenceDirection | null {
  validateGeneratedBounds(input, poll);
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

function validateGeneratedBounds(input: IntervalInput, poll: PollWindow): void {
  const start = validUtcInstant(input.startAt);
  const end = validUtcInstant(input.endAt);
  const slots = pollSlots(poll);
  const first = slots.findIndex((slot) => slot.startAt === start);
  const last = slots.findIndex((slot) => slot.endAt === end);
  if (first < 0 || last < first) throw new RangeError('Interval is outside generated poll slots');
  validateContiguousSlots(slots, first, last);
}

function validateContiguousSlots(
  slots: ReturnType<typeof pollSlots>,
  first: number,
  last: number,
): void {
  for (let index = first + 1; index <= last; index++) {
    if (slots[index - 1]?.endAt !== slots[index]?.startAt) {
      throw new RangeError('Interval must contain contiguous poll slots');
    }
  }
}

function validUtcInstant(value: string): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value) {
    throw new RangeError('Interval bounds must be ISO UTC timestamps');
  }
  return value;
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
  return [...intervals].sort((left, right) => left.startAt.localeCompare(right.startAt));
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
    if (previous && previous.endAt > interval.startAt) {
      throw new RangeError('Intervals in one response must not overlap');
    }
  });
}
