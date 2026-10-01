import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Pool, type PoolClient } from 'pg';
import { createGroup } from '../domain/group.js';
import { createParticipant } from '../domain/participant.js';
import { closePoll, createPoll } from '../domain/poll.js';
import { createResponse } from '../domain/response.js';
import {
  insertGroup, insertParticipant, insertPoll, insertResponse, replaceResponseIntervals,
} from './entities.repository.js';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is required for database integration tests');
const pool = new Pool({ connectionString: databaseUrl });
after(async () => pool.end());

async function inTransaction(run: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await run(client);
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
}

const pollInput = {
  title: 'Team meeting', startsOn: '2026-10-06', endsOn: '2026-10-12',
  dayStart: '16:00', dayEnd: '23:00', slotMinutes: 30 as const,
  meetingDurationMinutes: 60,
};

async function withPersistedResponse(
  run: (fixture: { groupId: string; pollId: string; responseId: string }) => Promise<void>,
): Promise<void> {
  const group = createGroup({ name: 'Team', timezone: 'UTC' });
  const { participant } = createParticipant(group.id, 'Alice');
  const poll = createPoll(group.id, 1, pollInput);
  const response = createResponse(poll.id, participant.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await insertGroup(client, group);
    await insertParticipant(client, participant);
    await insertPoll(client, poll);
    await insertResponse(client, response);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  try {
    await run({ groupId: group.id, pollId: poll.id, responseId: response.id });
  } finally {
    await pool.query('DELETE FROM groups WHERE id = $1', [group.id]);
  }
}

test('all five entities persist with their relationships and normalized fields', async () => {
  await withPersistedResponse(async ({ responseId }) => {
    const [interval] = await replaceResponseIntervals(pool, responseId, [{
      localDate: '2026-10-06', startTime: '18:00', endTime: '20:00', kind: 'PREFERRED',
    }]);
    const result = await pool.query<{
      group_name: string; poll_title: string; display_name_normalized: string;
      state: string; preference_direction: string;
    }>(`SELECT g.name AS group_name, poll.title AS poll_title,
               p.display_name_normalized, r.state, i.preference_direction
        FROM availability_intervals i
        JOIN poll_responses r ON r.id = i.response_id
        JOIN participants p ON p.id = r.participant_id
        JOIN polls poll ON poll.id = r.poll_id
        JOIN groups g ON g.id = poll.group_id
        WHERE i.id = $1`, [interval!.id]);
    assert.deepEqual(result.rows[0], {
      group_name: 'Team', poll_title: 'Team meeting',
      display_name_normalized: 'alice', state: 'DRAFT', preference_direction: 'FLAT',
    });
  });
});

test('database rejects a meeting longer than its daily window', async () => {
  await inTransaction(async (client) => {
    const group = createGroup({ name: 'Team', timezone: 'UTC' });
    await insertGroup(client, group);
    const poll = createPoll(group.id, 1, pollInput);
    await assert.rejects(
      () => insertPoll(client, { ...poll, dayEnd: '16:30' }),
      (error: { code?: string }) => error.code === '23514',
    );
  });
});

test('database rejects a previous poll from another group', async () => {
  await inTransaction(async (client) => {
    const firstGroup = createGroup({ name: 'First', timezone: 'UTC' });
    const secondGroup = createGroup({ name: 'Second', timezone: 'UTC' });
    await insertGroup(client, firstGroup);
    await insertGroup(client, secondGroup);
    const basePoll = createPoll(firstGroup.id, 1, pollInput);
    await insertPoll(client, basePoll);
    const nextPoll = createPoll(secondGroup.id, 1, pollInput, basePoll.id);
    await assert.rejects(
      () => insertPoll(client, nextPoll),
      (error: { code?: string }) => error.code === '23503',
    );
  });
});

test('deleting a previous poll clears the reference without changing the group', async () => {
  await inTransaction(async (client) => {
    const group = createGroup({ name: 'Team', timezone: 'UTC' });
    await insertGroup(client, group);
    const previous = closePoll(createPoll(group.id, 1, pollInput));
    await insertPoll(client, previous);
    const current = createPoll(group.id, 2, pollInput, previous.id);
    await insertPoll(client, current);
    await client.query('DELETE FROM polls WHERE id = $1', [previous.id]);
    const result = await client.query<{ group_id: string; based_on_poll_id: string | null }>(
      'SELECT group_id, based_on_poll_id FROM polls WHERE id = $1', [current.id],
    );
    assert.deepEqual(result.rows[0], { group_id: group.id, based_on_poll_id: null });
  });
});

test('database rejects a second open poll in one group', async () => {
  await inTransaction(async (client) => {
    const group = createGroup({ name: 'Team', timezone: 'UTC' });
    await insertGroup(client, group);
    await insertPoll(client, createPoll(group.id, 1, pollInput));
    await assert.rejects(
      () => insertPoll(client, createPoll(group.id, 2, pollInput)),
      (error: { code?: string }) => error.code === '23505',
    );
  });
});

test('database rejects a preferred interval without a direction', async () => {
  await inTransaction(async (client) => {
    const group = createGroup({ name: 'Team', timezone: 'UTC' });
    const { participant } = createParticipant(group.id, 'Alice');
    const poll = createPoll(group.id, 1, pollInput);
    const response = createResponse(poll.id, participant.id);
    await insertGroup(client, group);
    await insertParticipant(client, participant);
    await insertPoll(client, poll);
    await insertResponse(client, response);
    await assert.rejects(
      () => client.query(`INSERT INTO availability_intervals
        (id, response_id, local_date, start_time, end_time, kind, preference_direction)
        VALUES (gen_random_uuid(), $1, '2026-10-06', '18:00', '19:00', 'PREFERRED', NULL)`, [response.id]),
      (error: { code?: string }) => error.code === '23514',
    );
  });
});

test('response repository rejects a participant from another group', async () => {
  await inTransaction(async (client) => {
    const pollGroup = createGroup({ name: 'Poll group', timezone: 'UTC' });
    const participantGroup = createGroup({ name: 'Participant group', timezone: 'UTC' });
    await insertGroup(client, pollGroup);
    await insertGroup(client, participantGroup);
    const poll = createPoll(pollGroup.id, 1, pollInput);
    const { participant } = createParticipant(participantGroup.id, 'Alice');
    await insertPoll(client, poll);
    await insertParticipant(client, participant);
    await assert.rejects(
      () => insertResponse(client, createResponse(poll.id, participant.id)),
      /same group/i,
    );
  });
});

test('response repository rejects writes to a closed poll', async () => {
  await inTransaction(async (client) => {
    const group = createGroup({ name: 'Team', timezone: 'UTC' });
    await insertGroup(client, group);
    const { participant } = createParticipant(group.id, 'Alice');
    const poll = closePoll(createPoll(group.id, 1, pollInput));
    await insertParticipant(client, participant);
    await insertPoll(client, poll);
    await assert.rejects(
      () => insertResponse(client, createResponse(poll.id, participant.id)),
      /open poll/i,
    );
  });
});

test('replacing intervals demotes a confirmed response and removes its old intervals', async () => {
  await withPersistedResponse(async ({ responseId }) => {
    await replaceResponseIntervals(pool, responseId, [{
      localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED',
    }]);
    await pool.query(`UPDATE poll_responses SET state = 'CONFIRMED', confirmed_at = now()
      WHERE id = $1`, [responseId]);
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
    await pool.query(`UPDATE poll_responses SET state = 'CONFIRMED', confirmed_at = now()
      WHERE id = $1`, [responseId]);
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
    await pool.query(`UPDATE poll_responses SET state = 'CONFIRMED', confirmed_at = now()
      WHERE id = $1`, [responseId]);
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
