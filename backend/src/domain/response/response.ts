import type { RESPONSE_STATE } from '#shared/constants';

export type ResponseState = (typeof RESPONSE_STATE)[keyof typeof RESPONSE_STATE];

interface ResponseFields {
  id: string;
  pollId: string;
  participantId: string;
  updatedAt: Date;
}

export type PollResponse = ResponseFields &
  ({ state: 'DRAFT'; confirmedAt: null } | { state: 'CONFIRMED'; confirmedAt: Date });
