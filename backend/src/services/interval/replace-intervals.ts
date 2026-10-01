import type { Pool } from 'pg';
import type { AvailabilityInterval, IntervalInput } from '#entities/interval';
import { validateIntervalSet } from '#entities/interval.validation';
import { POLL_STATUS, RESPONSE_STATE } from '#shared/constants';
import { markResponseDraft } from '#services/response/response.service';
import { createInterval } from './interval.service.js';
import { loadIntervals, loadResponseContext, writeIntervals } from './interval.storage.js';

function intervalKey(interval: AvailabilityInterval): string {
  return [interval.localDate, interval.startTime, interval.endTime,
    interval.kind, interval.preferenceDirection ?? ''].join('|');
}

export async function replaceResponseIntervals(
  pool: Pool,
  responseId: string,
  inputs: readonly IntervalInput[],
  now = new Date(),
): Promise<AvailabilityInterval[]> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { window, pollStatus, responseState } = await loadResponseContext(db, responseId);
    if (pollStatus !== POLL_STATUS.OPEN) throw new Error('Response requires an open poll');

    const replacement = inputs.map((input) => createInterval(responseId, window, input, now));
    validateIntervalSet(replacement, window);
    const existing = await loadIntervals(db, responseId);
    const before = existing.map(intervalKey).sort();
    const after = replacement.map(intervalKey).sort();
    const unchanged = before.length === after.length &&
      before.every((key, index) => key === after[index]);

    if (!unchanged) await writeIntervals(db, responseId, replacement);
    if (!unchanged || responseState === RESPONSE_STATE.CONFIRMED) {
      await markResponseDraft(db, responseId, now);
    }
    await db.query('COMMIT');
    return unchanged ? existing : replacement;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
