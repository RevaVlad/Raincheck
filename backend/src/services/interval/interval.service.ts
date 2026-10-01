import { randomUUID } from 'node:crypto';
import type { AvailabilityInterval, IntervalInput, PollWindow } from '#entities/interval';
import { validateInterval } from '#entities/interval.validation';
import { INTERVAL_KIND } from '#shared/constants';

export function createInterval(
  responseId: string,
  poll: PollWindow,
  input: IntervalInput,
  now = new Date(),
): AvailabilityInterval {
  const direction = validateInterval(input, poll);
  const fields = {
    id: randomUUID(), responseId,
    localDate: input.localDate, startTime: input.startTime, endTime: input.endTime,
    createdAt: now, updatedAt: now,
  };
  if (input.kind === INTERVAL_KIND.PREFERRED) {
    return { ...fields, kind: INTERVAL_KIND.PREFERRED, preferenceDirection: direction! };
  }
  return { ...fields, kind: input.kind, preferenceDirection: null };
}
