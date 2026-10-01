import type { EntityManager } from '@mikro-orm/postgresql';
import type { AvailabilityInterval, IntervalInput } from '#domain/interval/interval';
import { validateIntervalSet } from '#domain/interval/interval.validation';
import {
  MikroIntervalRepository,
  type IntervalRepository,
} from '#infrastructure/database/repositories/interval.repository';
import { POLL_STATUS, RESPONSE_STATE } from '#shared/constants';
import {
  createInterval,
  sameIntervals,
  toEntity,
  toInterval,
  toPollWindow,
} from './interval.operations.js';

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

function ensurePollIsOpen(response: { poll: { status: string } }): void {
  if (response.poll.status !== POLL_STATUS.OPEN) throw new Error('Response requires an open poll');
}
