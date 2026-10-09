import { randomUUID } from 'node:crypto';
import { withTransaction, type PrismaConnection } from '#infrastructure/database/prisma-database';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PollResponse } from '#domain/response/response';
import { changeStateForOpenPoll, insertForOpenPoll } from './response.queries.js';
import { toResponse } from '#infrastructure/database/prisma-records';

export class ResponseService {
  constructor(private readonly db: PrismaConnection) {}

  async create(pollId: string, participantId: string, now = new Date()): Promise<PollResponse> {
    return withTransaction(this.db, async (transaction) => {
      const [poll, participant] = await Promise.all([
        transaction.poll.findUnique({
          where: { id: pollId },
          select: { groupId: true, status: true },
        }),
        transaction.participant.findUnique({
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
      return insertForOpenPoll(transaction, randomUUID(), pollId, participantId, now);
    });
  }

  confirm(responseId: string, now = new Date()): Promise<PollResponse> {
    return changeStateForOpenPoll(this.db, responseId, 'CONFIRMED', now);
  }

  markDraft(responseId: string, now = new Date()): Promise<PollResponse> {
    return changeStateForOpenPoll(this.db, responseId, 'DRAFT', now);
  }

  async findForParticipant(pollId: string, participantId: string): Promise<PollResponse | null> {
    const record = await this.db.pollResponse.findUnique({
      where: { pollId_participantId: { pollId, participantId } },
    });
    return record ? toResponse(record) : null;
  }

  async deleteForOpenPoll(pollId: string, participantId: string): Promise<boolean> {
    return withTransaction(this.db, async (transaction) => {
      // The no-op update locks the poll row so deletion serializes with closure.
      const [poll] = await transaction.poll.updateManyAndReturn({
        where: { id: pollId, status: 'OPEN' },
        data: { status: 'OPEN' },
      });
      if (!poll) throw new Error('Response requires an open poll');
      return (
        (await transaction.pollResponse.deleteMany({ where: { pollId, participantId } }))
          .count > 0
      );
    });
  }
}
