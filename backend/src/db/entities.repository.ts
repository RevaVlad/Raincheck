import type { PoolClient } from 'pg';
import type { Group } from '../domain/group.js';
import type { Participant } from '../domain/participant.js';
import type { Poll } from '../domain/poll.js';
import type { PollResponse } from '../domain/response.js';
import type { AvailabilityInterval } from '../domain/interval.js';

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

export async function insertInterval(db: PoolClient, interval: AvailabilityInterval): Promise<void> {
  const result = await db.query(
    `INSERT INTO availability_intervals
       (id, response_id, local_date, start_time, end_time, kind, preference_direction,
        created_at, updated_at)
     SELECT $1, response.id, $3, $4, $5, $6, $7, $8, $9
       FROM poll_responses AS response
       JOIN polls AS poll ON poll.id = response.poll_id
      WHERE response.id = $2 AND poll.status = 'OPEN'
      FOR SHARE OF poll`,
    [interval.id, interval.responseId, interval.localDate, interval.startTime,
      interval.endTime, interval.kind, interval.preferenceDirection,
      interval.createdAt, interval.updatedAt],
  );
  if (result.rowCount !== 1) {
    throw new Error('Interval requires an open poll response');
  }
}
