import type { QueryResultRow } from 'pg';
import type { PollStatus } from '#domain/poll/poll';
import type { PollResponse, ResponseState } from '#domain/response/response';
import type { Database } from '#infrastructure/database/database';
import { requiredRow } from './required-row.js';

export interface ResponseRow extends QueryResultRow {
  id: string;
  poll_id: string;
  participant_id: string;
  state: ResponseState;
  confirmed_at: Date | null;
  updated_at: Date;
}

interface ResponseCreationContextRow extends QueryResultRow {
  poll_group_id: string | null;
  participant_group_id: string | null;
  poll_status: PollStatus | null;
}

const FIND_CREATION_CONTEXT = `
  SELECT
    p.group_id AS poll_group_id,
    pt.group_id AS participant_group_id,
    p.status AS poll_status
  FROM (SELECT 1) AS input
  LEFT JOIN polls AS p ON p.id = $1
  LEFT JOIN participants AS pt ON pt.id = $2
`;

const INSERT_RESPONSE = `
  INSERT INTO poll_responses (
    id,
    poll_id,
    participant_id,
    state,
    confirmed_at,
    updated_at
  )
  SELECT $1, p.id, $3, 'DRAFT', NULL, $4
  FROM polls AS p
  JOIN participants AS pt ON pt.id = $3
  WHERE
    p.id = $2
    AND p.status = 'OPEN'
    AND p.group_id = pt.group_id
  FOR SHARE OF p
  RETURNING id, poll_id, participant_id, state, confirmed_at, updated_at
`;

const CHANGE_RESPONSE = `
  WITH open_response AS (
    SELECT response.id
    FROM poll_responses AS response
    JOIN polls AS poll ON poll.id = response.poll_id
    WHERE response.id = $1 AND poll.status = 'OPEN'
    FOR UPDATE OF response, poll
  )
  UPDATE poll_responses AS response
  SET
    state = $2,
    confirmed_at = CASE
      WHEN $2 = 'CONFIRMED' THEN COALESCE(response.confirmed_at, $3)
      ELSE NULL
    END,
    updated_at = CASE WHEN response.state = $2 THEN response.updated_at ELSE $3 END
  FROM open_response
  WHERE
    response.id = open_response.id
  RETURNING
    response.id,
    response.poll_id,
    response.participant_id,
    response.state,
    response.confirmed_at,
    response.updated_at
`;

const RECORD_AVAILABILITY_CHANGE = `
  UPDATE poll_responses
  SET state = 'DRAFT', confirmed_at = NULL, updated_at = $2
  WHERE id = $1
`;

export interface ResponseCreationContext {
  pollGroupId: string | null;
  participantGroupId: string | null;
  pollStatus: PollStatus | null;
}

export function toResponse(row: ResponseRow): PollResponse {
  const fields = {
    id: row.id,
    pollId: row.poll_id,
    participantId: row.participant_id,
    updatedAt: row.updated_at,
  };
  if (row.state === 'DRAFT') return { ...fields, state: 'DRAFT', confirmedAt: null };
  if (!row.confirmed_at) throw new Error('Confirmed response is missing confirmed_at');
  return { ...fields, state: 'CONFIRMED', confirmedAt: row.confirmed_at };
}

export class ResponseRepository {
  constructor(private readonly database: Database) {}

  async findCreationContext(
    pollId: string,
    participantId: string,
  ): Promise<ResponseCreationContext> {
    const result = await this.database.query<ResponseCreationContextRow>(FIND_CREATION_CONTEXT, [
      pollId,
      participantId,
    ]);
    const row = requiredRow(result, 'Response creation context was not returned');
    return {
      pollGroupId: row.poll_group_id,
      participantGroupId: row.participant_group_id,
      pollStatus: row.poll_status,
    };
  }

  async insertForOpenPoll(
    id: string,
    pollId: string,
    participantId: string,
    now: Date,
  ): Promise<PollResponse> {
    const result = await this.database.query<ResponseRow>(INSERT_RESPONSE, [
      id,
      pollId,
      participantId,
      now,
    ]);
    return toResponse(requiredRow(result, 'Response requires an open poll'));
  }

  async changeStateForOpenPoll(id: string, state: ResponseState, now: Date): Promise<PollResponse> {
    const result = await this.database.query<ResponseRow>(CHANGE_RESPONSE, [id, state, now]);
    return toResponse(requiredRow(result, 'Response requires an open poll'));
  }

  async recordAvailabilityChange(responseId: string, now: Date): Promise<void> {
    await this.database.query(RECORD_AVAILABILITY_CHANGE, [responseId, now]);
  }
}
