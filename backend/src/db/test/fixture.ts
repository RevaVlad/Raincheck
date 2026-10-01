import { after } from 'node:test';
import { Pool, type PoolClient } from 'pg';
import { createGroup } from '../../domain/group.js';
import { createParticipant } from '../../domain/participant.js';
import { createPoll } from '../../domain/poll.js';
import { createResponse } from '../../domain/response.js';
import { insertGroup, insertParticipant, insertPoll, insertResponse } from '../insert.js';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is required for database integration tests');
export const pool = new Pool({ connectionString: databaseUrl });
after(async () => pool.end());

export const pollInput = {
  title: 'Team meeting', startsOn: '2026-10-06', endsOn: '2026-10-12',
  dayStart: '16:00', dayEnd: '23:00', slotMinutes: 30 as const,
  meetingDurationMinutes: 60,
};

export async function inTransaction(run: (client: PoolClient) => Promise<void>): Promise<void> {
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

export async function withPersistedResponse(
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
