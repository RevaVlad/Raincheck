import { randomUUID } from 'node:crypto';
import type { Database } from '#infrastructure/database/database';
import { PollRepository } from '#infrastructure/database/repositories/poll.repository';
import type { Poll, PollInput } from '#domain/poll/poll';
import { validatePoll } from '#domain/poll/poll.validation';
import { POLL_STATUS } from '#shared/constants';

export class PollService {
  constructor(private readonly db: Database) {}

  async create(
    groupId: string,
    sequenceNo: number,
    input: PollInput,
    basedOnPollId: string | null = null,
    now = new Date(),
  ): Promise<Poll> {
    const valid = validatePoll(sequenceNo, input);
    return new PollRepository(this.db).insert({
      id: randomUUID(),
      groupId,
      sequenceNo,
      ...valid,
      status: POLL_STATUS.OPEN,
      basedOnPollId,
      createdAt: now,
      closedAt: null,
    });
  }
  async close(pollId: string, now = new Date()): Promise<Poll> {
    return new PollRepository(this.db).close(pollId, now);
  }
}
