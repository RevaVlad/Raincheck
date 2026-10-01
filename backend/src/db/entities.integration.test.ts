import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGroup } from '../domain/group.js';
import { createParticipant } from '../domain/participant.js';
import { closePoll, createPoll } from '../domain/poll.js';
import { createResponse } from '../domain/response.js';
import { insertGroup, insertParticipant, insertPoll, insertResponse } from './insert.js';
import { replaceResponseIntervals } from './replace-response-intervals.js';
import { inTransaction, pollInput, pool, withPersistedResponse } from './test/fixture.js';

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
