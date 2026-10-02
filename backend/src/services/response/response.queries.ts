import type { PollResponse, ResponseState } from '#domain/response/response';
import { toResponse } from '#infrastructure/database/prisma-records';
import type { PollResponse as ResponseRecord, Prisma } from '../../generated/prisma/client.js';

export async function insertForOpenPoll(
  client: Prisma.TransactionClient,
  id: string,
  pollId: string,
  participantId: string,
  now: Date,
): Promise<PollResponse> {
  const records = await client.$queryRaw<ResponseRecord[]>`
    INSERT INTO poll_responses (id, poll_id, participant_id, state, confirmed_at, updated_at)
    SELECT ${id}::uuid, p.id, ${participantId}::uuid, 'DRAFT', NULL, ${now}::timestamptz
    FROM polls AS p
    JOIN participants AS pt ON pt.id = ${participantId}::uuid
    WHERE p.id = ${pollId}::uuid AND p.status = 'OPEN' AND p.group_id = pt.group_id
    FOR SHARE OF p
    RETURNING id, poll_id AS "pollId", participant_id AS "participantId", state,
      confirmed_at AS "confirmedAt", updated_at AS "updatedAt"
  `;
  return requiredResponse(records[0]);
}

export async function changeStateForOpenPoll(
  client: Prisma.TransactionClient,
  id: string,
  state: ResponseState,
  now: Date,
): Promise<PollResponse> {
  const records = await client.$queryRaw<ResponseRecord[]>`
    WITH open_response AS (
      SELECT response.id
      FROM poll_responses AS response
      JOIN polls AS poll ON poll.id = response.poll_id
      WHERE response.id = ${id}::uuid AND poll.status = 'OPEN'
      FOR UPDATE OF response, poll
    )
    UPDATE poll_responses AS response
    SET
      state = ${state}::text,
      confirmed_at = CASE
        WHEN ${state}::text = 'CONFIRMED' THEN COALESCE(response.confirmed_at, ${now}::timestamptz)
        ELSE NULL
      END,
      updated_at = CASE
        WHEN response.state = ${state}::text THEN response.updated_at
        ELSE ${now}::timestamptz
      END
    FROM open_response
    WHERE response.id = open_response.id
    RETURNING response.id, response.poll_id AS "pollId", response.participant_id AS "participantId",
      response.state, response.confirmed_at AS "confirmedAt", response.updated_at AS "updatedAt"
  `;
  return requiredResponse(records[0]);
}

function requiredResponse(record: ResponseRecord | undefined): PollResponse {
  if (!record) throw new Error('Response requires an open poll');
  return toResponse(record);
}
