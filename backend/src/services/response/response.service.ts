import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { PollResponse } from '#entities/response';
import { RESPONSE_STATE } from '#shared/constants';

export async function createResponse(
  db: PoolClient,
  pollId: string,
  participantId: string,
  now = new Date(),
): Promise<PollResponse> {
  const response: PollResponse = {
    id: randomUUID(), pollId, participantId,
    state: RESPONSE_STATE.DRAFT, confirmedAt: null, updatedAt: now,
  };
  const result = await db.query(
    `INSERT INTO poll_responses
       (id, poll_id, participant_id, state, confirmed_at, updated_at)
     SELECT $1, poll.id, participant.id, $4, $5, $6
       FROM polls AS poll
       JOIN participants AS participant ON participant.id = $3
         AND participant.group_id = poll.group_id
      WHERE poll.id = $2 AND poll.status = 'OPEN'
      FOR SHARE OF poll`,
    [response.id, response.pollId, response.participantId,
      response.state, response.confirmedAt, response.updatedAt],
  );
  if (result.rowCount !== 1) {
    throw new Error('Response requires an open poll and participant in the same group');
  }
  return response;
}

export async function confirmResponse(
  db: Pick<PoolClient, 'query'>,
  responseId: string,
  now = new Date(),
): Promise<void> {
  const result = await db.query(
    `UPDATE poll_responses AS response
        SET state = 'CONFIRMED',
            confirmed_at = COALESCE(response.confirmed_at, $2),
            updated_at = CASE WHEN response.state = 'CONFIRMED' THEN response.updated_at ELSE $2 END
       FROM polls AS poll
      WHERE response.id = $1 AND poll.id = response.poll_id AND poll.status = 'OPEN'`,
    [responseId, now],
  );
  if (result.rowCount !== 1) throw new Error('Response requires an open poll');
}

export async function markResponseDraft(db: PoolClient, responseId: string, now = new Date()): Promise<void> {
  const result = await db.query(
    `UPDATE poll_responses AS response
        SET state = $2, confirmed_at = NULL, updated_at = $3
       FROM polls AS poll
      WHERE response.id = $1 AND poll.id = response.poll_id AND poll.status = 'OPEN'`,
    [responseId, RESPONSE_STATE.DRAFT, now],
  );
  if (result.rowCount !== 1) throw new Error('Response requires an open poll');
}
