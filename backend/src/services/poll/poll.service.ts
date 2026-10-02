import { randomUUID } from 'node:crypto';
import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { dateToPrisma, timeToPrisma, toPoll } from '#infrastructure/database/prisma-records';
import type { Poll, PollInput } from '#domain/poll/poll';
import { validatePoll } from '#domain/poll/poll.validation';
import { POLL_STATUS } from '#shared/constants';

export class PollService {
  constructor(private readonly db: PrismaDatabase) {}

  async create(
    groupId: string,
    sequenceNo: number,
    input: PollInput,
    basedOnPollId: string | null = null,
    now = new Date(),
  ): Promise<Poll> {
    const valid = validatePoll(sequenceNo, input);
    const record = await this.db.client.poll.create({
      data: {
        id: randomUUID(),
        groupId,
        sequenceNo,
        title: valid.title,
        startsOn: dateToPrisma(valid.startsOn),
        endsOn: dateToPrisma(valid.endsOn),
        dayStart: timeToPrisma(valid.dayStart),
        dayEnd: timeToPrisma(valid.dayEnd),
        slotMinutes: valid.slotMinutes,
        meetingDurationMinutes: valid.meetingDurationMinutes,
        status: POLL_STATUS.OPEN,
        basedOnPollId,
        createdAt: now,
        closedAt: null,
      },
    });
    return toPoll(record);
  }
  async close(pollId: string, now = new Date()): Promise<Poll> {
    const [record] = await this.db.client.poll.updateManyAndReturn({
      where: { id: pollId, status: POLL_STATUS.OPEN },
      data: { status: POLL_STATUS.CLOSED, closedAt: now },
    });
    if (!record) throw new Error('Poll not found');
    return toPoll(record);
  }

  async list(groupId: string): Promise<Poll[]> {
    return (
      await this.db.client.poll.findMany({ where: { groupId }, orderBy: { createdAt: 'desc' } })
    ).map(toPoll);
  }

  async findInGroup(groupId: string, pollId: string): Promise<Poll | null> {
    const record = await this.db.client.poll.findFirst({ where: { id: pollId, groupId } });
    return record ? toPoll(record) : null;
  }

  async createNext(groupId: string, input: PollInput, now = new Date()): Promise<Poll> {
    return this.db.transaction(async (transaction) => {
      const current = await transaction.client.poll.findFirst({
        where: { groupId, status: POLL_STATUS.OPEN },
      });
      if (!current) throw new Error('Poll state conflict');
      const [closed] = await transaction.client.poll.updateManyAndReturn({
        where: { id: current.id, status: POLL_STATUS.OPEN },
        data: { status: POLL_STATUS.CLOSED, closedAt: now },
      });
      if (!closed) throw new Error('Poll state conflict');
      return new PollService(transaction).create(
        groupId,
        current.sequenceNo + 1,
        input,
        current.id,
        now,
      );
    });
  }
}
