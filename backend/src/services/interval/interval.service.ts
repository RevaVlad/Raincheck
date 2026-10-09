import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { toInterval } from '#infrastructure/database/prisma-records';
import type { AvailabilityInterval, IntervalInput } from '#domain/interval/interval';
import { POLL_STATUS, RESPONSE_STATE } from '#shared/constants';
import { createIntervals, sameIntervals, toPollWindow } from './interval.operations.js';
import { lockResponseContext } from './interval.queries.js';

export class IntervalService {
  constructor(private readonly db: PrismaDatabase) {}

  async replace(
    responseId: string,
    inputs: readonly IntervalInput[],
    now = new Date(),
  ): Promise<AvailabilityInterval[]> {
    return this.db.transaction(async (transaction) => {
      const context = await lockResponseContext(transaction, responseId);
      requireOpenPoll(context.poll.status);
      const replacement = createIntervals(responseId, inputs, toPollWindow(context.poll), now);
      const existing = (
        await transaction.client.availabilityInterval.findMany({
          where: { responseId },
          orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        })
      ).map(toInterval);
      if (sameIntervals(existing, replacement)) return existing;
      await transaction.client.availabilityInterval.deleteMany({ where: { responseId } });
      await transaction.client.availabilityInterval.createMany({
        data: replacement.map((interval) => ({
          ...interval,
          startAt: new Date(interval.startAt),
          endAt: new Date(interval.endAt),
        })),
      });
      await transaction.client.pollResponse.update({
        where: { id: responseId },
        data: { state: RESPONSE_STATE.DRAFT, confirmedAt: null, updatedAt: now },
      });
      return replacement;
    });
  }
}

function requireOpenPoll(status: string): void {
  if (status !== POLL_STATUS.OPEN) throw new Error('Response requires an open poll');
}
