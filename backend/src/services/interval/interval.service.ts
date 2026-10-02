import type { Database } from '#infrastructure/database/database';
import { IntervalRepository } from '#infrastructure/database/repositories/interval.repository';
import { ResponseRepository } from '#infrastructure/database/repositories/response.repository';
import type { AvailabilityInterval, IntervalInput } from '#domain/interval/interval';
import { POLL_STATUS } from '#shared/constants';
import { createIntervals, sameIntervals, toPollWindow } from './interval.operations.js';

export class IntervalService {
  constructor(private readonly db: Database) {}

  async replace(
    responseId: string,
    inputs: readonly IntervalInput[],
    now = new Date(),
  ): Promise<AvailabilityInterval[]> {
    return this.db.transaction(async (transaction) => {
      const intervals = new IntervalRepository(transaction);
      const responses = new ResponseRepository(transaction);
      const context = await intervals.findResponseForUpdate(responseId);
      requireOpenPoll(context.poll.status);
      const replacement = createIntervals(responseId, inputs, toPollWindow(context.poll), now);
      const existing = await intervals.findByResponse(responseId);
      if (sameIntervals(existing, replacement)) return existing;
      await intervals.replace(responseId, replacement);
      await responses.recordAvailabilityChange(responseId, now);
      return replacement;
    });
  }
}

function requireOpenPoll(status: string): void {
  if (status !== POLL_STATUS.OPEN) throw new Error('Response requires an open poll');
}
