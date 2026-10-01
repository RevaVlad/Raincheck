import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGroup } from '#services/group/group.service';
import { closePoll, createPoll } from '#services/poll/poll.service';
import { inTransaction, pollInput } from '../../support/database.js';

const now = new Date('2026-10-01T12:00:00.000Z');

test('creates an open poll with a seven-day UTC window', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    const poll = await createPoll(db, group.id, 1, pollInput, null, now);
    assert.equal(poll.status, 'OPEN');
    assert.equal(poll.closedAt, null);
    assert.equal(poll.startsOn, '2026-10-06');
    const saved = await db.query<{ status: string }>('SELECT status FROM polls WHERE id = $1', [poll.id]);
    assert.equal(saved.rows[0]?.status, 'OPEN');
  });
});

test('rejects invalid poll dates, slots, and meeting length', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    const create = (changes: Partial<typeof pollInput>) =>
      createPoll(db, group.id, 1, { ...pollInput, ...changes });
    await assert.rejects(() => create({ endsOn: '2026-10-13' }), /seven days/i);
    await assert.rejects(() => create({ startsOn: '2026-02-30' }), /date/i);
    await assert.rejects(() => create({ slotMinutes: 45 as 30 }), /slot/i);
    await assert.rejects(() => create({ dayEnd: '16:30' }), /daily window/i);
  });
});

test('closing a poll records its close time', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    const poll = await createPoll(db, group.id, 1, pollInput);
    const closed = await closePoll(db, poll, now);
    assert.equal(closed.status, 'CLOSED');
    assert.equal(closed.closedAt?.toISOString(), now.toISOString());
    await assert.rejects(() => closePoll(db, closed), /closed/i);
  });
});

test('database rejects a meeting longer than its daily window', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    const poll = await createPoll(db, group.id, 1, pollInput);
    await assert.rejects(
      () => db.query('UPDATE polls SET day_end = $2 WHERE id = $1', [poll.id, '16:30']),
      (error: { code?: string }) => error.code === '23514',
    );
  });
});

test('database requires a previous poll from the same group', async () => {
  await inTransaction(async (db) => {
    const first = await createGroup(db, { name: 'First' });
    const second = await createGroup(db, { name: 'Second' });
    const previous = await createPoll(db, first.id, 1, pollInput);
    await assert.rejects(
      () => createPoll(db, second.id, 1, pollInput, previous.id),
      (error: { code?: string }) => error.code === '23503',
    );
  });
});

test('deleting a previous poll clears the reference', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    const previous = await createPoll(db, group.id, 1, pollInput);
    await closePoll(db, previous);
    const current = await createPoll(db, group.id, 2, pollInput, previous.id);
    await db.query('DELETE FROM polls WHERE id = $1', [previous.id]);
    const saved = await db.query<{ group_id: string; based_on_poll_id: string | null }>(
      'SELECT group_id, based_on_poll_id FROM polls WHERE id = $1', [current.id],
    );
    assert.deepEqual(saved.rows[0], { group_id: group.id, based_on_poll_id: null });
  });
});

test('database allows one open poll per group', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    await createPoll(db, group.id, 1, pollInput);
    await assert.rejects(
      () => createPoll(db, group.id, 2, pollInput),
      (error: { code?: string }) => error.code === '23505',
    );
  });
});
