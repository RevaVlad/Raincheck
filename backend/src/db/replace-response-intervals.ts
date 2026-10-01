import type { Pool } from 'pg';
import { createInterval, validateIntervalSet, type AvailabilityInterval, type IntervalInput, type PollWindow } from '../domain/interval.js';

function intervalKey(interval: Pick<AvailabilityInterval,
  'localDate' | 'startTime' | 'endTime' | 'kind' | 'preferenceDirection'>): string {
  return [interval.localDate, interval.startTime, interval.endTime,
    interval.kind, interval.preferenceDirection ?? ''].join('|');
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
      status: string; response_state: string; starts_on: string; ends_on: string;
      day_start: string; day_end: string; slot_minutes: 30 | 60;
    }>(`SELECT poll.status, response.state AS response_state,
               poll.starts_on::text, poll.ends_on::text,
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
    const existingResult = await client.query<{
      id: string; response_id: string; local_date: string; start_time: string;
      end_time: string; kind: AvailabilityInterval['kind'];
      preference_direction: AvailabilityInterval['preferenceDirection'];
      created_at: Date; updated_at: Date;
    }>(`SELECT id, response_id, local_date::text, start_time::text,
               end_time::text, kind, preference_direction, created_at, updated_at
          FROM availability_intervals WHERE response_id = $1`, [responseId]);
    const existing = existingResult.rows.map((stored): AvailabilityInterval => ({
      id: stored.id,
      responseId: stored.response_id,
      localDate: stored.local_date,
      startTime: stored.start_time.slice(0, 5),
      endTime: stored.end_time.slice(0, 5),
      kind: stored.kind,
      preferenceDirection: stored.preference_direction,
      createdAt: stored.created_at,
      updatedAt: stored.updated_at,
    } as AvailabilityInterval));
    const existingKeys = existing.map(intervalKey).sort();
    const replacementKeys = intervals.map(intervalKey).sort();
    const unchanged = existingKeys.length === replacementKeys.length &&
      existingKeys.every((key, index) => key === replacementKeys[index]);
    if (!unchanged) {
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
    }
    if (!unchanged || row.response_state === 'CONFIRMED') {
      await client.query(
        `UPDATE poll_responses SET state = 'DRAFT', confirmed_at = NULL, updated_at = $2
          WHERE id = $1`, [responseId, now],
      );
    }
    await client.query('COMMIT');
    return unchanged ? existing : intervals;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
