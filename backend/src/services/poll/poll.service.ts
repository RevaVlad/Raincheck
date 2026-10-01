import { randomUUID } from 'node:crypto';
import { LockMode, type EntityManager } from '@mikro-orm/postgresql';
import type { Poll, PollInput } from '#domain/poll/poll';
import { ensurePollOpen, validatePoll } from '#domain/poll/poll.validation';
import { GroupEntity } from '#infrastructure/database/entities/group.entity';
import { PollEntity } from '#infrastructure/database/entities/poll.entity';
import { POLL_STATUS } from '#shared/constants';

export interface PollService {
  create(
    groupId: string,
    sequenceNo: number,
    input: PollInput,
    basedOnPollId?: string | null,
    now?: Date,
  ): Promise<Poll>;
  close(pollId: string, now?: Date): Promise<Poll>;
}

export class MikroPollService implements PollService {
  constructor(private readonly em: EntityManager) {}

  async create(
    groupId: string,
    sequenceNo: number,
    input: PollInput,
    basedOnPollId: string | null = null,
    now = new Date(),
  ): Promise<Poll> {
    const valid = validatePoll(sequenceNo, input);
    const poll = this.em.create(PollEntity, {
      id: randomUUID(),
      group: this.em.getReference(GroupEntity, groupId),
      sequenceNo,
      ...valid,
      status: POLL_STATUS.OPEN,
      basedOnPoll: basedOnPollId ? this.em.getReference(PollEntity, basedOnPollId) : null,
      createdAt: now,
      closedAt: null,
    });
    this.em.persist(poll);
    await this.em.flush();
    return toPoll(poll);
  }

  async close(pollId: string, now = new Date()): Promise<Poll> {
    return this.em.transactional(async (em) => {
      const poll = await em.findOneOrFail(PollEntity, pollId, { lockMode: LockMode.PESSIMISTIC_WRITE });
      ensurePollOpen(poll.status);
      poll.status = POLL_STATUS.CLOSED;
      poll.closedAt = now;
      await em.flush();
      return toPoll(poll);
    });
  }
}

export function toPoll(entity: PollEntity): Poll {
  const fields = {
    id: entity.id,
    groupId: entity.group.id,
    sequenceNo: entity.sequenceNo,
    title: entity.title ?? null,
    startsOn: entity.startsOn,
    endsOn: entity.endsOn,
    dayStart: entity.dayStart.slice(0, 5),
    dayEnd: entity.dayEnd.slice(0, 5),
    slotMinutes: entity.slotMinutes as 30 | 60,
    meetingDurationMinutes: entity.meetingDurationMinutes,
    basedOnPollId: entity.basedOnPoll?.id ?? null,
    createdAt: entity.createdAt,
  };
  if (entity.status === POLL_STATUS.CLOSED) {
    if (!entity.closedAt) throw new Error('Stored closed poll has no close time');
    return { ...fields, status: POLL_STATUS.CLOSED, closedAt: entity.closedAt };
  }
  return { ...fields, status: POLL_STATUS.OPEN, closedAt: null };
}
