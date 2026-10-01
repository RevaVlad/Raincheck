import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replaceResponseIntervals } from '#services/interval/replace-intervals';
import { confirmResponse } from '#services/response/response.service';
import { pool, withPersistedResponse } from '../../support/database.js';

test('database rejects a preferred interval without a direction', async () => {
  await withPersistedResponse(async ({ responseId }) => {
    await assert.rejects(
      () => pool.query(`INSERT INTO availability_intervals
        (id, response_id, local_date, start_time, end_time, kind, preference_direction)
        VALUES (gen_random_uuid(), $1, '2026-10-06', '18:00', '19:00', 'PREFERRED', NULL)`, [responseId]),
      (error: { code?: string }) => error.code === '23514',
    );
  });
});

test('replacing intervals demotes a confirmed response and removes its old intervals', async () => {
  await withPersistedResponse(async ({ responseId }) => {
    await replaceResponseIntervals(pool, responseId, [{
      localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED',
    }]);
    await confirmResponse(pool, responseId);
    await replaceResponseIntervals(pool, responseId, [{
      localDate: '2026-10-06', startTime: '20:00', endTime: '21:00', kind: 'UNAVAILABLE',
    }]);
    const result = await pool.query<{ state: string; confirmed_at: Date | null; start_time: string }>(
      `SELECT r.state, r.confirmed_at, i.start_time FROM poll_responses r
       JOIN availability_intervals i ON i.response_id = r.id WHERE r.id = $1`, [responseId],
    );
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]?.state, 'DRAFT');
    assert.equal(result.rows[0]?.confirmed_at, null);
    assert.equal(result.rows[0]?.start_time, '20:00:00');
  });
});

test('repeating an unchanged replacement preserves interval IDs and timestamps', async () => {
  await withPersistedResponse(async ({ responseId }) => {
    const input = [{
      localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED' as const,
    }];
    const first = await replaceResponseIntervals(pool, responseId, input, new Date('2026-10-01T12:00:00Z'));
    const second = await replaceResponseIntervals(pool, responseId, input, new Date('2026-10-02T12:00:00Z'));
    const response = await pool.query<{ updated_at: Date }>(
      'SELECT updated_at FROM poll_responses WHERE id = $1', [responseId],
    );
    assert.equal(second[0]?.id, first[0]?.id);
    assert.equal(second[0]?.createdAt.toISOString(), first[0]?.createdAt.toISOString());
    assert.equal(response.rows[0]?.updated_at.toISOString(), '2026-10-01T12:00:00.000Z');
  });
});

test('an unchanged replacement still returns a confirmed response to draft', async () => {
  await withPersistedResponse(async ({ responseId }) => {
    const input = [{
      localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED' as const,
    }];
    const [first] = await replaceResponseIntervals(pool, responseId, input);
    await confirmResponse(pool, responseId);
    const [second] = await replaceResponseIntervals(pool, responseId, input);
    const response = await pool.query<{ state: string; confirmed_at: Date | null }>(
      'SELECT state, confirmed_at FROM poll_responses WHERE id = $1', [responseId],
    );
    assert.equal(response.rows[0]?.state, 'DRAFT');
    assert.equal(response.rows[0]?.confirmed_at, null);
    assert.equal(second?.id, first?.id);
  });
});

test('invalid input leaves the previous confirmed answer untouched', async () => {
  await withPersistedResponse(async ({ responseId }) => {
    await replaceResponseIntervals(pool, responseId, [{
      localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED',
    }]);
    await confirmResponse(pool, responseId);
    await assert.rejects(() => replaceResponseIntervals(pool, responseId, [
      { localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED' },
      { localDate: '2026-10-06', startTime: '18:30', endTime: '19:30', kind: 'IF_NEEDED' },
    ]), /overlap/i);
    await assert.rejects(() => replaceResponseIntervals(pool, responseId, [{
      localDate: '2026-10-13', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED',
    }]), /date/i);
    await assert.rejects(() => replaceResponseIntervals(pool, responseId, [{
      localDate: '2026-10-06', startTime: '15:30', endTime: '16:30', kind: 'PREFERRED',
    }]), /daily window/i);
    await assert.rejects(() => replaceResponseIntervals(pool, responseId, [{
      localDate: '2026-10-06', startTime: '18:15', endTime: '19:00', kind: 'PREFERRED',
    }]), /slot/i);
    const result = await pool.query<{ state: string; confirmed_at: Date | null; start_time: string }>(
      `SELECT r.state, r.confirmed_at, i.start_time FROM poll_responses r
       JOIN availability_intervals i ON i.response_id = r.id WHERE r.id = $1`, [responseId],
    );
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]?.state, 'CONFIRMED');
    assert.ok(result.rows[0]?.confirmed_at);
    assert.equal(result.rows[0]?.start_time, '18:00:00');
  });
});

test('interval replacement rejects writes after its poll closes', async () => {
  await withPersistedResponse(async ({ pollId, responseId }) => {
    await pool.query('UPDATE polls SET status = $1, closed_at = now() WHERE id = $2', ['CLOSED', pollId]);
    await assert.rejects(() => replaceResponseIntervals(pool, responseId, [{
      localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED',
    }]), /open poll/i);
  });
});
