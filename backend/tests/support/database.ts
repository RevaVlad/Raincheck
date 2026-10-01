import { after } from 'node:test';
import { Pool, type PoolClient } from 'pg';
import { createGroup } from '#services/group/group.service';
import { createParticipant } from '#services/participant/participant.service';
import { createPoll } from '#services/poll/poll.service';
import { createResponse } from '#services/response/response.service';

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
  let fixture: { groupId: string; pollId: string; responseId: string };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const group = await createGroup(client, { name: 'Team' });
    const { participant } = await createParticipant(client, group.id, 'Alice');
    const poll = await createPoll(client, group.id, 1, pollInput);
    const response = await createResponse(client, poll.id, participant.id);
    fixture = { groupId: group.id, pollId: poll.id, responseId: response.id };
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  try {
    await run(fixture);
  } finally {
    await pool.query('DELETE FROM groups WHERE id = $1', [fixture.groupId]);
  }
}
