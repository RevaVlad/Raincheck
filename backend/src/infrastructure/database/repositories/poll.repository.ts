import type { QueryResultRow } from 'pg';
import type { Poll } from '#domain/poll/poll';
import type { Database } from '#infrastructure/database/database';
import { requiredRow } from './required-row.js';

export interface PollRow extends QueryResultRow {
  id: string;
  group_id: string;
  sequence_no: number;
  title: string | null;
  starts_on: string;
  ends_on: string;
  day_start: string;
  day_end: string;
  slot_minutes: 30 | 60;
  meeting_duration_minutes: number;
  status: 'OPEN' | 'CLOSED';
  based_on_poll_id: string | null;
  created_at: Date;
  closed_at: Date | null;
}

const POLL_COLUMNS = `
  id,
  group_id,
  sequence_no,
  title,
  starts_on::text AS starts_on,
  ends_on::text AS ends_on,
  day_start::text AS day_start,
  day_end::text AS day_end,
  slot_minutes,
  meeting_duration_minutes,
  status,
  based_on_poll_id,
  created_at,
  closed_at
`;

const INSERT_POLL = `
  INSERT INTO polls (
    id,
    group_id,
    sequence_no,
    title,
    starts_on,
    ends_on,
    day_start,
    day_end,
    slot_minutes,
    meeting_duration_minutes,
    status,
    based_on_poll_id,
    created_at,
    closed_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  RETURNING ${POLL_COLUMNS}
`;

const CLOSE_POLL = `
  UPDATE polls
  SET status = 'CLOSED', closed_at = $2
  WHERE id = $1 AND status = 'OPEN'
  RETURNING ${POLL_COLUMNS}
`;

export function toPoll(row: PollRow): Poll {
  const fields = {
    id: row.id,
    groupId: row.group_id,
    sequenceNo: row.sequence_no,
    title: row.title,
    startsOn: row.starts_on.slice(0, 10),
    endsOn: row.ends_on.slice(0, 10),
    dayStart: row.day_start.slice(0, 5),
    dayEnd: row.day_end.slice(0, 5),
    slotMinutes: row.slot_minutes,
    meetingDurationMinutes: row.meeting_duration_minutes,
    basedOnPollId: row.based_on_poll_id,
    createdAt: row.created_at,
  };
  if (row.status === 'OPEN') return { ...fields, status: 'OPEN', closedAt: null };
  if (!row.closed_at) throw new Error('Closed poll is missing closed_at');
  return { ...fields, status: 'CLOSED', closedAt: row.closed_at };
}

export class PollRepository {
  constructor(private readonly database: Database) {}

  async insert(value: Poll): Promise<Poll> {
    const result = await this.database.query<PollRow>(INSERT_POLL, [
      value.id,
      value.groupId,
      value.sequenceNo,
      value.title,
      value.startsOn,
      value.endsOn,
      value.dayStart,
      value.dayEnd,
      value.slotMinutes,
      value.meetingDurationMinutes,
      value.status,
      value.basedOnPollId,
      value.createdAt,
      value.closedAt,
    ]);
    return toPoll(requiredRow(result, 'Poll insert did not return a row'));
  }

  async close(id: string, now: Date): Promise<Poll> {
    const result = await this.database.query<PollRow>(CLOSE_POLL, [id, now]);
    return toPoll(requiredRow(result, 'Poll not found'));
  }
}
