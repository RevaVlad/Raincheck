import type { Pool, PoolClient } from 'pg';
import type { Group } from '../domain/group.js';
import type { Participant } from '../domain/participant.js';
import type { Poll } from '../domain/poll.js';
import type { PollResponse } from '../domain/response.js';
import { createInterval, validateIntervalSet, type AvailabilityInterval, type IntervalInput, type PollWindow } from '../domain/interval.js';

export async function insertGroup(db: PoolClient, group: Group): Promise<void> {
  await db.query(
    `INSERT INTO groups (id, name, invite_code, timezone, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [group.id, group.name, group.inviteCode, group.timezone, group.createdAt],
  );
}

export async function insertParticipant(db: PoolClient, participant: Participant): Promise<void> {
  await db.query(
    `INSERT INTO participants
       (id, group_id, display_name, display_name_normalized, edit_token_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [participant.id, participant.groupId, participant.displayName,
      participant.displayNameNormalized, participant.editTokenHash,
      participant.createdAt, participant.updatedAt],
  );
}

export async function insertPoll(db: PoolClient, poll: Poll): Promise<void> {
  await db.query(
    `INSERT INTO polls
       (id, group_id, sequence_no, title, starts_on, ends_on, day_start, day_end,
        slot_minutes, meeting_duration_minutes, status, based_on_poll_id, created_at, closed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [poll.id, poll.groupId, poll.sequenceNo, poll.title, poll.startsOn, poll.endsOn,
      poll.dayStart, poll.dayEnd, poll.slotMinutes, poll.meetingDurationMinutes,
      poll.status, poll.basedOnPollId, poll.createdAt, poll.closedAt],
  );
}

export async function insertResponse(db: PoolClient, response: PollResponse): Promise<void> {
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
}

export async function replaceResponseIntervals(
  pool: Pool,
  responseId: string,
  inputs: readonly IntervalInput[],
  now = new Date(),
): Promise<AvailabilityInterval[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{
      status: string; starts_on: string; ends_on: string;
      day_start: string; day_end: string; slot_minutes: 30 | 60;
    }>(`SELECT poll.status, poll.starts_on::text, poll.ends_on::text,
               poll.day_start::text, poll.day_end::text, poll.slot_minutes
          FROM poll_responses AS response
          JOIN polls AS poll ON poll.id = response.poll_id
         WHERE response.id = $1
         FOR UPDATE OF response, poll`, [responseId]);
    const row = result.rows[0];
    if (!row) throw new Error('Response not found');
    if (row.status !== 'OPEN') throw new Error('Response requires an open poll');
    const pollWindow: PollWindow = {
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      dayStart: row.day_start.slice(0, 5),
      dayEnd: row.day_end.slice(0, 5),
      slotMinutes: row.slot_minutes,
    };
    const intervals = inputs.map((input) => createInterval(responseId, pollWindow, input, now));
    validateIntervalSet(intervals, pollWindow);
    await client.query('DELETE FROM availability_intervals WHERE response_id = $1', [responseId]);
    for (const interval of intervals) {
      await client.query(
        `INSERT INTO availability_intervals
           (id, response_id, local_date, start_time, end_time, kind, preference_direction,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [interval.id, interval.responseId, interval.localDate, interval.startTime,
          interval.endTime, interval.kind, interval.preferenceDirection,
          interval.createdAt, interval.updatedAt],
      );
    }
    await client.query(
      `UPDATE poll_responses SET state = 'DRAFT', confirmed_at = NULL, updated_at = $2
        WHERE id = $1`, [responseId, now],
    );
    await client.query('COMMIT');
    return intervals;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
