import { randomUUID } from 'node:crypto';
import type { AvailabilityInterval, IntervalInput, PollWindow } from '#domain/interval/interval';
import { validateInterval, validateIntervalSet } from '#domain/interval/interval.validation';
import type { Poll } from '#domain/poll/poll';
import { INTERVAL_KIND } from '#shared/constants';

export function toPollWindow(poll: Poll): PollWindow {
  return {
    startsOn: poll.startsOn,
    endsOn: poll.endsOn,
    dayStart: poll.dayStart,
    dayEnd: poll.dayEnd,
    slotMinutes: poll.slotMinutes,
  };
}

export function createIntervals(
  responseId: string,
  inputs: readonly IntervalInput[],
  window: PollWindow,
  now: Date,
): AvailabilityInterval[] {
  const intervals = inputs.map((input) => createInterval(responseId, input, window, now));
  validateIntervalSet(intervals, window);
  return intervals;
}

export function sameIntervals(
  existing: readonly AvailabilityInterval[],
  replacement: readonly AvailabilityInterval[],
): boolean {
  const before = existing.map(intervalKey).sort();
  const after = replacement.map(intervalKey).sort();
  return before.length === after.length && before.every((key, index) => key === after[index]);
}

function createInterval(
  responseId: string,
  input: IntervalInput,
  window: PollWindow,
  now: Date,
): AvailabilityInterval {
  const preferenceDirection = validateInterval(input, window);
  const fields = {
    id: randomUUID(),
    responseId,
    localDate: input.localDate,
    startTime: input.startTime,
    endTime: input.endTime,
    createdAt: now,
    updatedAt: now,
  };
  if (input.kind !== INTERVAL_KIND.PREFERRED) {
    return { ...fields, kind: input.kind, preferenceDirection: null };
  }
  if (!preferenceDirection) throw new Error('Preferred interval is missing a direction');
  return { ...fields, kind: INTERVAL_KIND.PREFERRED, preferenceDirection };
}

function intervalKey(interval: AvailabilityInterval): string {
  return [
    interval.localDate,
    interval.startTime,
    interval.endTime,
    interval.kind,
    interval.preferenceDirection ?? '',
  ].join('|');
}
