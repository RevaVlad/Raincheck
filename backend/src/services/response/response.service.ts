import { randomUUID } from 'node:crypto';
import type { Database } from '#infrastructure/database/database';
import {
  ResponseRepository,
  type ResponseCreationContext,
} from '#infrastructure/database/repositories/response.repository';
import type { PollResponse } from '#domain/response/response';

export class ResponseService {
  constructor(private readonly db: Database) {}

  async create(pollId: string, participantId: string, now = new Date()): Promise<PollResponse> {
    return this.db.transaction(async (transaction) => {
      const responses = new ResponseRepository(transaction);
      const context = await responses.findCreationContext(pollId, participantId);
      requireValidCreation(context);
      return responses.insertForOpenPoll(randomUUID(), pollId, participantId, now);
    });
  }

  confirm(responseId: string, now = new Date()): Promise<PollResponse> {
    return new ResponseRepository(this.db).changeStateForOpenPoll(responseId, 'CONFIRMED', now);
  }

  markDraft(responseId: string, now = new Date()): Promise<PollResponse> {
    return new ResponseRepository(this.db).changeStateForOpenPoll(responseId, 'DRAFT', now);
  }
}

function requireValidCreation(context: ResponseCreationContext): void {
  if (context.pollStatus !== 'OPEN' || !context.pollGroupId || !context.participantGroupId) {
    throw new Error('Response requires an open poll');
  }
  if (context.pollGroupId !== context.participantGroupId) {
    throw new Error('Response participant must belong to the same group as the poll');
  }
}
