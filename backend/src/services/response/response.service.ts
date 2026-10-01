import { randomUUID } from 'node:crypto';
import { LockMode, type EntityManager } from '@mikro-orm/postgresql';
import type { PollResponse } from '#domain/response/response';
import { ParticipantEntity } from '#infrastructure/database/entities/participant.entity';
import { PollEntity } from '#infrastructure/database/entities/poll.entity';
import { ResponseEntity } from '#infrastructure/database/entities/response.entity';
import { POLL_STATUS, RESPONSE_STATE } from '#shared/constants';

export interface ResponseService {
  create(pollId: string, participantId: string, now?: Date): Promise<PollResponse>;
  confirm(responseId: string, now?: Date): Promise<PollResponse>;
  markDraft(responseId: string, now?: Date): Promise<PollResponse>;
}

export class MikroResponseService implements ResponseService {
  constructor(private readonly em: EntityManager) {}

  async create(pollId: string, participantId: string, now = new Date()): Promise<PollResponse> {
    const poll = await this.em.findOneOrFail(PollEntity, pollId, { populate: ['group'] });
    const participant = await this.em.findOneOrFail(ParticipantEntity, participantId, { populate: ['group'] });
    if (poll.status !== POLL_STATUS.OPEN) throw new Error('Response requires an open poll');
    if (poll.group.id !== participant.group.id) {
      throw new Error('Response participant must belong to the same group as the poll');
    }
    const response = this.em.create(ResponseEntity, {
      id: randomUUID(), poll, participant,
      state: RESPONSE_STATE.DRAFT, confirmedAt: null, updatedAt: now,
    });
    this.em.persist(response);
    await this.em.flush();
    return toResponse(response);
  }

  async confirm(responseId: string, now = new Date()): Promise<PollResponse> {
    return this.change(responseId, (response) => {
      if (response.state === RESPONSE_STATE.CONFIRMED) return;
      response.state = RESPONSE_STATE.CONFIRMED;
      response.confirmedAt = now;
      response.updatedAt = now;
    });
  }

  async markDraft(responseId: string, now = new Date()): Promise<PollResponse> {
    return this.change(responseId, (response) => {
      response.state = RESPONSE_STATE.DRAFT;
      response.confirmedAt = null;
      response.updatedAt = now;
    });
  }

  private async change(responseId: string, update: (response: ResponseEntity) => void): Promise<PollResponse> {
    return this.em.transactional(async (em) => {
      const response = await em.findOneOrFail(ResponseEntity, responseId, {
        populate: ['poll'], lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (response.poll.status !== POLL_STATUS.OPEN) throw new Error('Response requires an open poll');
      update(response);
      await em.flush();
      return toResponse(response);
    });
  }
}

export function toResponse(entity: ResponseEntity): PollResponse {
  const fields = {
    id: entity.id,
    pollId: entity.poll.id,
    participantId: entity.participant.id,
    updatedAt: entity.updatedAt,
  };
  if (entity.state === RESPONSE_STATE.CONFIRMED) {
    if (!entity.confirmedAt) throw new Error('Stored confirmed response has no confirmation time');
    return { ...fields, state: RESPONSE_STATE.CONFIRMED, confirmedAt: entity.confirmedAt };
  }
  return { ...fields, state: RESPONSE_STATE.DRAFT, confirmedAt: null };
}
