import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AvailabilityInterval, IntervalInput, PollWindow } from '#domain/interval/interval';
import { validateInterval, validateIntervalSet } from '#domain/interval/interval.validation';
import { IntervalEntity } from '#infrastructure/database/entities/interval.entity';
import { ResponseEntity } from '#infrastructure/database/entities/response.entity';
import {
  MikroIntervalRepository,
  type IntervalRepository,
} from '#infrastructure/database/repositories/interval.repository';
import { INTERVAL_KIND, POLL_STATUS, RESPONSE_STATE } from '#shared/constants';

export interface IntervalService {
  replace(responseId: string, inputs: readonly IntervalInput[], now?: Date): Promise<AvailabilityInterval[]>;
}

export class MikroIntervalService implements IntervalService {
  constructor(
    private readonly em: EntityManager,
    private readonly intervals: IntervalRepository = new MikroIntervalRepository(),
  ) {}

  replace(
    responseId: string,
    inputs: readonly IntervalInput[],
    now = new Date(),
  ): Promise<AvailabilityInterval[]> {
    return this.em.transactional(async (em) => {
      const response = await this.intervals.findResponseForUpdate(em, responseId);
      ensurePollIsOpen(response);
      const window = toPollWindow(response);
      const replacement = inputs.map((input) => createInterval(responseId, window, input, now));
      validateIntervalSet(replacement, window);

      const stored = await this.intervals.findByResponse(em, responseId);
      const existing = stored.map(toInterval);
      const unchanged = sameIntervals(existing, replacement);

      if (!unchanged) {
        const entities = replacement.map((interval) => toEntity(em, response, interval));
        await this.intervals.replace(em, responseId, entities);
      }
      if (!unchanged || response.state === RESPONSE_STATE.CONFIRMED) {
        response.state = RESPONSE_STATE.DRAFT;
        response.confirmedAt = null;
        response.updatedAt = now;
      }
      await em.flush();
      return unchanged ? existing : replacement;
    });
  }
}

function createInterval(
  responseId: string,
  poll: PollWindow,
  input: IntervalInput,
  now: Date,
): AvailabilityInterval {
  const preferenceDirection = validateInterval(input, poll);
  const fields = {
    id: randomUUID(), responseId,
    localDate: input.localDate, startTime: input.startTime, endTime: input.endTime,
    createdAt: now, updatedAt: now,
  };
  if (input.kind === INTERVAL_KIND.PREFERRED) {
    return { ...fields, kind: INTERVAL_KIND.PREFERRED, preferenceDirection: preferenceDirection! };
  }
  return { ...fields, kind: input.kind, preferenceDirection: null };
}

function ensurePollIsOpen(response: ResponseEntity): void {
  if (response.poll.status !== POLL_STATUS.OPEN) throw new Error('Response requires an open poll');
}

function toPollWindow(response: ResponseEntity): PollWindow {
  return {
    startsOn: response.poll.startsOn,
    endsOn: response.poll.endsOn,
    dayStart: response.poll.dayStart.slice(0, 5),
    dayEnd: response.poll.dayEnd.slice(0, 5),
    slotMinutes: response.poll.slotMinutes as 30 | 60,
  };
}

function sameIntervals(
  existing: readonly AvailabilityInterval[],
  replacement: readonly AvailabilityInterval[],
): boolean {
  const before = existing.map(intervalKey).sort();
  const after = replacement.map(intervalKey).sort();
  return before.length === after.length && before.every((key, index) => key === after[index]);
}

function intervalKey(interval: AvailabilityInterval): string {
  return [interval.localDate, interval.startTime, interval.endTime,
    interval.kind, interval.preferenceDirection ?? ''].join('|');
}

function toEntity(
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

function toInterval(entity: IntervalEntity): AvailabilityInterval {
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
