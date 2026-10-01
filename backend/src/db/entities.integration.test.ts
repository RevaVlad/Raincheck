import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Pool, type PoolClient } from 'pg';
import { createGroup } from '../domain/group.js';
import { createParticipant } from '../domain/participant.js';
import { closePoll, createPoll } from '../domain/poll.js';
import { createResponse } from '../domain/response.js';
import { createInterval } from '../domain/interval.js';
import {
  insertGroup, insertParticipant, insertPoll, insertResponse, insertInterval,
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

test('all five entities persist with their relationships and normalized fields', async () => {
  await inTransaction(async (client) => {
    const group = createGroup({ name: 'Team', timezone: 'Asia/Yekaterinburg' });
    const { participant } = createParticipant(group.id, '  Alice   Smith  ');
    const poll = createPoll(group.id, 1, pollInput);
    const response = createResponse(poll.id, participant.id);
    const interval = createInterval(response.id, poll, {
      localDate: '2026-10-06', startTime: '18:00', endTime: '20:00', kind: 'PREFERRED',
    });
    await insertGroup(client, group);
    await insertParticipant(client, participant);
    await insertPoll(client, poll);
    await insertResponse(client, response);
    await insertInterval(client, interval);
    const result = await client.query<{
      group_name: string; poll_title: string; display_name_normalized: string;
      state: string; preference_direction: string;
    }>(`SELECT g.name AS group_name, poll.title AS poll_title,
               p.display_name_normalized, r.state, i.preference_direction
        FROM availability_intervals i
        JOIN poll_responses r ON r.id = i.response_id
        JOIN participants p ON p.id = r.participant_id
        JOIN polls poll ON poll.id = r.poll_id
        JOIN groups g ON g.id = poll.group_id
        WHERE i.id = $1`, [interval.id]);
    assert.deepEqual(result.rows[0], {
      group_name: 'Team', poll_title: 'Team meeting',
      display_name_normalized: 'alice smith', state: 'DRAFT', preference_direction: 'FLAT',
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

test('interval repository rejects writes after its poll closes', async () => {
  await inTransaction(async (client) => {
    const group = createGroup({ name: 'Team', timezone: 'UTC' });
    await insertGroup(client, group);
    const { participant } = createParticipant(group.id, 'Alice');
    const poll = createPoll(group.id, 1, pollInput);
    const response = createResponse(poll.id, participant.id);
    await insertParticipant(client, participant);
    await insertPoll(client, poll);
    await insertResponse(client, response);
    await client.query('UPDATE polls SET status = $1, closed_at = now() WHERE id = $2', ['CLOSED', poll.id]);
    const interval = createInterval(response.id, poll, {
      localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED',
    });
    await assert.rejects(() => insertInterval(client, interval), /open poll/i);
  });
});
