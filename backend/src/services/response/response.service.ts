import { randomUUID } from 'node:crypto';
import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import type { PollResponse } from '#domain/response/response';
import { changeStateForOpenPoll, insertForOpenPoll } from './response.queries.js';
import { toResponse } from '#infrastructure/database/prisma-records';

export class ResponseService {
  constructor(private readonly db: PrismaDatabase) {}

  async create(pollId: string, participantId: string, now = new Date()): Promise<PollResponse> {
    return this.db.transaction(async (transaction) => {
      const [poll, participant] = await Promise.all([
        transaction.client.poll.findUnique({
          where: { id: pollId },
          select: { groupId: true, status: true },
        }),
        transaction.client.participant.findUnique({
          where: { id: participantId },
          select: { groupId: true },
        }),
      ]);
      if (!poll || poll.status !== 'OPEN' || !participant) {
        throw new Error('Response requires an open poll');
      }
      if (poll.groupId !== participant.groupId) {
        throw new Error('Response participant must belong to the same group as the poll');
      }
      return insertForOpenPoll(transaction.client, randomUUID(), pollId, participantId, now);
    });
  }

  confirm(responseId: string, now = new Date()): Promise<PollResponse> {
    return changeStateForOpenPoll(this.db.client, responseId, 'CONFIRMED', now);
  }

  markDraft(responseId: string, now = new Date()): Promise<PollResponse> {
    return changeStateForOpenPoll(this.db.client, responseId, 'DRAFT', now);
  }

  async findForParticipant(pollId: string, participantId: string): Promise<PollResponse | null> {
    const record = await this.db.client.pollResponse.findUnique({
      where: { pollId_participantId: { pollId, participantId } },
    });
    return record ? toResponse(record) : null;
  }

  async deleteForOpenPoll(pollId: string, participantId: string): Promise<boolean> {
    const poll = await this.db.client.poll.findUnique({
      where: { id: pollId },
      select: { status: true },
    });
    if (!poll || poll.status !== 'OPEN') throw new Error('Response requires an open poll');
    return (
      (await this.db.client.pollResponse.deleteMany({ where: { pollId, participantId } })).count > 0
    );
  }
}
