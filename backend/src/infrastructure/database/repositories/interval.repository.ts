import type { QueryResultRow } from 'pg';
import type {
  AvailabilityInterval,
  IntervalKind,
  PreferenceDirection,
} from '#domain/interval/interval';
import type { Poll } from '#domain/poll/poll';
import type { PollResponse, ResponseState } from '#domain/response/response';
import type { Database } from '#infrastructure/database/database';
import { type PollRow, toPoll } from './poll.repository.js';
import { requiredRow } from './required-row.js';
import { type ResponseRow, toResponse } from './response.repository.js';

interface ResponseContextRow extends QueryResultRow {
  response_id: string;
  poll_id: string;
  participant_id: string;
  response_state: ResponseState;
  confirmed_at: Date | null;
  response_updated_at: Date;
  group_id: string;
  sequence_no: number;
  title: string | null;
  starts_on: string;
  ends_on: string;
  day_start: string;
  day_end: string;
  slot_minutes: 30 | 60;
  meeting_duration_minutes: number;
  poll_status: 'OPEN' | 'CLOSED';
  based_on_poll_id: string | null;
  poll_created_at: Date;
  closed_at: Date | null;
}

interface IntervalRow extends QueryResultRow {
  id: string;
  response_id: string;
  local_date: string;
  start_time: string;
  end_time: string;
  kind: IntervalKind;
  preference_direction: PreferenceDirection | null;
  created_at: Date;
  updated_at: Date;
}

const FIND_RESPONSE_FOR_UPDATE = `
  SELECT
    response.id AS response_id,
    response.poll_id,
    response.participant_id,
    response.state AS response_state,
    response.confirmed_at,
    response.updated_at AS response_updated_at,
    poll.group_id,
    poll.sequence_no,
    poll.title,
    poll.starts_on::text AS starts_on,
    poll.ends_on::text AS ends_on,
    poll.day_start::text AS day_start,
    poll.day_end::text AS day_end,
    poll.slot_minutes,
    poll.meeting_duration_minutes,
    poll.status AS poll_status,
    poll.based_on_poll_id,
    poll.created_at AS poll_created_at,
    poll.closed_at
  FROM poll_responses AS response
  JOIN polls AS poll ON poll.id = response.poll_id
  WHERE response.id = $1
  FOR UPDATE OF response, poll
`;

const FIND_INTERVALS = `
  SELECT
    id,
    response_id,
    local_date::text AS local_date,
    start_time::text AS start_time,
    end_time::text AS end_time,
    kind,
    preference_direction,
    created_at,
    updated_at
  FROM availability_intervals
  WHERE response_id = $1
  ORDER BY local_date, start_time
`;

const DELETE_INTERVALS = `
  DELETE FROM availability_intervals
  WHERE response_id = $1
`;

const INSERT_INTERVAL = `
  INSERT INTO availability_intervals (
    id,
    response_id,
    local_date,
    start_time,
    end_time,
    kind,
    preference_direction,
    created_at,
    updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`;

export interface ResponseContext {
  response: PollResponse;
  poll: Poll;
}

function responseRow(row: ResponseContextRow): ResponseRow {
  return {
    id: row.response_id,
    poll_id: row.poll_id,
    participant_id: row.participant_id,
    state: row.response_state,
    confirmed_at: row.confirmed_at,
    updated_at: row.response_updated_at,
  };
}

function pollRow(row: ResponseContextRow): PollRow {
  return {
    id: row.poll_id,
    group_id: row.group_id,
    sequence_no: row.sequence_no,
    title: row.title,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    day_start: row.day_start,
    day_end: row.day_end,
    slot_minutes: row.slot_minutes,
    meeting_duration_minutes: row.meeting_duration_minutes,
    status: row.poll_status,
    based_on_poll_id: row.based_on_poll_id,
    created_at: row.poll_created_at,
    closed_at: row.closed_at,
  };
}

function toInterval(row: IntervalRow): AvailabilityInterval {
  const fields = {
    id: row.id,
    responseId: row.response_id,
    localDate: row.local_date.slice(0, 10),
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.kind !== 'PREFERRED') {
    return { ...fields, kind: row.kind, preferenceDirection: null };
  }
  if (!row.preference_direction) throw new Error('Preferred interval is missing a direction');
  return { ...fields, kind: 'PREFERRED', preferenceDirection: row.preference_direction };
}

export class IntervalRepository {
  constructor(private readonly database: Database) {}

  async findResponseForUpdate(id: string): Promise<ResponseContext> {
    const result = await this.database.query<ResponseContextRow>(FIND_RESPONSE_FOR_UPDATE, [id]);
    const row = requiredRow(result, 'Response not found');
    return { response: toResponse(responseRow(row)), poll: toPoll(pollRow(row)) };
  }

  async findByResponse(id: string): Promise<AvailabilityInterval[]> {
    const result = await this.database.query<IntervalRow>(FIND_INTERVALS, [id]);
    return result.rows.map(toInterval);
  }

  async replace(responseId: string, intervals: readonly AvailabilityInterval[]): Promise<void> {
    await this.database.query(DELETE_INTERVALS, [responseId]);
    for (const interval of intervals) {
      await this.database.query(INSERT_INTERVAL, [
        interval.id,
        interval.responseId,
        interval.localDate,
        interval.startTime,
        interval.endTime,
        interval.kind,
        interval.preferenceDirection,
        interval.createdAt,
        interval.updatedAt,
      ]);
    }
  }
}
