import type { PoolClient } from 'pg';
import type { AvailabilityInterval, PollWindow } from '#entities/interval';
import type { PollStatus } from '#entities/poll';
import type { ResponseState } from '#entities/response';
import { INTERVAL_KIND } from '#shared/constants';

export async function loadResponseContext(
  db: PoolClient,
  responseId: string,
): Promise<{ window: PollWindow; pollStatus: PollStatus; responseState: ResponseState }> {
  const result = await db.query<{
    poll_status: PollStatus; response_state: ResponseState;
    starts_on: string; ends_on: string; day_start: string; day_end: string;
    slot_minutes: 30 | 60;
  }>(`SELECT poll.status AS poll_status, response.state AS response_state,
             poll.starts_on::text, poll.ends_on::text,
             poll.day_start::text, poll.day_end::text, poll.slot_minutes
        FROM poll_responses AS response
        JOIN polls AS poll ON poll.id = response.poll_id
       WHERE response.id = $1
       FOR UPDATE OF response, poll`, [responseId]);
  const row = result.rows[0];
  if (!row) throw new Error('Response not found');
  return {
    pollStatus: row.poll_status,
    responseState: row.response_state,
    window: {
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      dayStart: row.day_start.slice(0, 5),
      dayEnd: row.day_end.slice(0, 5),
      slotMinutes: row.slot_minutes,
    },
  };
}

export async function loadIntervals(db: PoolClient, responseId: string): Promise<AvailabilityInterval[]> {
  const result = await db.query<{
    id: string; response_id: string; local_date: string; start_time: string;
    end_time: string; kind: AvailabilityInterval['kind'];
    preference_direction: AvailabilityInterval['preferenceDirection'];
    created_at: Date; updated_at: Date;
  }>(`SELECT id, response_id, local_date::text, start_time::text,
             end_time::text, kind, preference_direction, created_at, updated_at
        FROM availability_intervals WHERE response_id = $1`, [responseId]);
  return result.rows.map((row): AvailabilityInterval => {
    const fields = {
      id: row.id,
      responseId: row.response_id,
      localDate: row.local_date,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (row.kind === INTERVAL_KIND.PREFERRED) {
      if (!row.preference_direction) throw new Error('Stored preferred interval has no direction');
      return { ...fields, kind: INTERVAL_KIND.PREFERRED, preferenceDirection: row.preference_direction };
    }
    return { ...fields, kind: row.kind, preferenceDirection: null };
  });
}

export async function writeIntervals(
  db: PoolClient,
  responseId: string,
  intervals: readonly AvailabilityInterval[],
): Promise<void> {
  await db.query('DELETE FROM availability_intervals WHERE response_id = $1', [responseId]);
  for (const interval of intervals) {
    await db.query(
      `INSERT INTO availability_intervals
         (id, response_id, local_date, start_time, end_time, kind, preference_direction,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [interval.id, interval.responseId, interval.localDate, interval.startTime,
        interval.endTime, interval.kind, interval.preferenceDirection,
        interval.createdAt, interval.updatedAt],
    );
  }
}
