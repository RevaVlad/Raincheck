import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AvailabilityInterval, IntervalInput, PollWindow } from '#domain/interval/interval';
import { validateInterval } from '#domain/interval/interval.validation';
import { IntervalEntity } from '#infrastructure/database/entities/interval.entity';
import { ResponseEntity } from '#infrastructure/database/entities/response.entity';
import { INTERVAL_KIND } from '#shared/constants';

export function createInterval(
  responseId: string,
  poll: PollWindow,
  input: IntervalInput,
  now: Date,
): AvailabilityInterval {
  const direction = validateInterval(input, poll);
  const fields = {
    id: randomUUID(), responseId,
    localDate: input.localDate, startTime: input.startTime, endTime: input.endTime,
    createdAt: now, updatedAt: now,
  };
  return input.kind === INTERVAL_KIND.PREFERRED
    ? { ...fields, kind: INTERVAL_KIND.PREFERRED, preferenceDirection: direction! }
    : { ...fields, kind: input.kind, preferenceDirection: null };
}

export function toPollWindow(response: ResponseEntity): PollWindow {
  return {
    startsOn: response.poll.startsOn,
    endsOn: response.poll.endsOn,
    dayStart: response.poll.dayStart.slice(0, 5),
    dayEnd: response.poll.dayEnd.slice(0, 5),
    slotMinutes: response.poll.slotMinutes as 30 | 60,
  };
}

export function sameIntervals(
  existing: readonly AvailabilityInterval[],
  replacement: readonly AvailabilityInterval[],
): boolean {
  const before = existing.map(intervalKey).sort();
  const after = replacement.map(intervalKey).sort();
  return before.length === after.length && before.every((key, index) => key === after[index]);
}

export function toEntity(
  em: EntityManager,
  response: ResponseEntity,
  interval: AvailabilityInterval,
): IntervalEntity {
  return em.create(IntervalEntity, {
    id: interval.id,
    response,
    localDate: interval.localDate,
    startTime: interval.startTime,
    endTime: interval.endTime,
    kind: interval.kind,
    preferenceDirection: interval.preferenceDirection,
    createdAt: interval.createdAt,
    updatedAt: interval.updatedAt,
  });
}

export function toInterval(entity: IntervalEntity): AvailabilityInterval {
  const fields = {
    id: entity.id,
    responseId: entity.response.id,
    localDate: entity.localDate,
    startTime: entity.startTime.slice(0, 5),
    endTime: entity.endTime.slice(0, 5),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
  if (entity.kind === INTERVAL_KIND.PREFERRED) {
    if (!entity.preferenceDirection) throw new Error('Stored preferred interval has no direction');
    return { ...fields, kind: INTERVAL_KIND.PREFERRED, preferenceDirection: entity.preferenceDirection };
  }
  return { ...fields, kind: entity.kind, preferenceDirection: null };
}

function intervalKey(interval: AvailabilityInterval): string {
  return [interval.localDate, interval.startTime, interval.endTime,
    interval.kind, interval.preferenceDirection ?? ''].join('|');
}
