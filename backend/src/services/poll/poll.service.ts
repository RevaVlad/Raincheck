import { randomUUID } from 'node:crypto';
import { withTransaction, type PrismaConnection } from '#infrastructure/database/prisma-database';
import type { Prisma } from '../../generated/prisma/client.js';
import { dateToPrisma, timeToPrisma, toPoll } from '#infrastructure/database/prisma-records';
import type { Poll, PollInput } from '#domain/poll/poll';
import { validatePoll } from '#domain/poll/poll.validation';
import { POLL_STATUS } from '#shared/constants';

function assertPreviousPollIsClosed(
  previous: (Pick<Poll, 'id' | 'sequenceNo'> & { status: string }) | undefined,
): void {
  if (previous?.status === POLL_STATUS.OPEN) throw new Error('Poll state conflict');
}

function nextPollMetadata(previous: Pick<Poll, 'id' | 'sequenceNo'> | undefined) {
  return previous
    ? { sequenceNo: previous.sequenceNo + 1, basedOnPollId: previous.id }
    : { sequenceNo: 1, basedOnPollId: null };
}

export class PollService {
  constructor(private readonly db: PrismaConnection) {}

  async create(
    groupId: string,
    sequenceNo: number,
    input: PollInput,
    basedOnPollId: string | null = null,
    now = new Date(),
  ): Promise<Poll> {
    const valid = validatePoll(sequenceNo, input);
    const record = await this.db.poll.create({
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
        timeZone: valid.timeZone,
        status: POLL_STATUS.OPEN,
        basedOnPollId,
        createdAt: now,
        closedAt: null,
      },
    });
    return toPoll(record);
  }
  async close(groupId: string, pollId: string, now = new Date()): Promise<Poll> {
    const existing = await this.db.poll.findFirst({
      where: { id: pollId, groupId },
      select: { id: true },
    });
    if (!existing) throw new Error('Poll not found');
    const [record] = await this.db.poll.updateManyAndReturn({
      where: { id: pollId, groupId, status: POLL_STATUS.OPEN },
      data: { status: POLL_STATUS.CLOSED, closedAt: now },
    });
    if (!record) throw new Error('Poll state conflict');
    return toPoll(record);
  }

  async list(groupId: string): Promise<Poll[]> {
    return (
      await this.db.poll.findMany({ where: { groupId }, orderBy: { createdAt: 'desc' } })
    ).map(toPoll);
  }

  async findInGroup(groupId: string, pollId: string): Promise<Poll | null> {
    const record = await this.db.poll.findFirst({ where: { id: pollId, groupId } });
    return record ? toPoll(record) : null;
  }

  async createNext(groupId: string, input: PollInput, now = new Date()): Promise<Poll> {
    return withTransaction(this.db, (transaction) =>
      this.createNextInTransaction(transaction, groupId, input, now),
    );
  }

  private async createNextInTransaction(
    transaction: Prisma.TransactionClient,
    groupId: string,
    input: PollInput,
    now: Date,
  ): Promise<Poll> {
    const [previous] = await transaction.poll.findMany({
      where: { groupId },
      orderBy: { sequenceNo: 'desc' },
      take: 1,
    });
    assertPreviousPollIsClosed(previous);
    const metadata = nextPollMetadata(previous);
    return new PollService(transaction).create(
      groupId,
      metadata.sequenceNo,
      input,
      metadata.basedOnPollId,
      now,
    );
  }
}
