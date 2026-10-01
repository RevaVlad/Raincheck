import { randomUUID } from 'node:crypto';

interface ResponseFields {
  id: string;
  pollId: string;
  participantId: string;
  updatedAt: Date;
}

export type PollResponse = ResponseFields & (
  | { state: 'DRAFT'; confirmedAt: null }
  | { state: 'CONFIRMED'; confirmedAt: Date }
);

export function createResponse(pollId: string, participantId: string, now = new Date()): PollResponse {
  return {
    id: randomUUID(), pollId, participantId,
    state: 'DRAFT', confirmedAt: null, updatedAt: now,
  };
}

export function confirmResponse(response: PollResponse, now = new Date()): PollResponse {
  return { ...response, state: 'CONFIRMED', confirmedAt: now, updatedAt: now };
}

export function markResponseDraft(response: PollResponse, now = new Date()): PollResponse {
  return { ...response, state: 'DRAFT', confirmedAt: null, updatedAt: now };
}
