import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inTransaction, pollInput } from '../../support/database.js';

const now = new Date('2026-10-01T12:00:00.000Z');

void test('creates and closes a poll through its service contract', async () => {
  await inTransaction(async ({ groups, polls }) => {
    const group = await groups.create({ name: 'Team' });
    const poll = await polls.create(group.id, 1, pollInput, null, now);
    const closed = await polls.close(poll.id, now);
    assert.equal(poll.status, 'OPEN');
    assert.equal(closed.status, 'CLOSED');
    assert.ok(closed.closedAt);
    assert.equal(closed.closedAt.toISOString(), now.toISOString());
  });
});

void test('allows only one open poll per group', async () => {
  await inTransaction(async ({ groups, polls }) => {
    const group = await groups.create({ name: 'Team' });
    await polls.create(group.id, 1, pollInput);
    await assert.rejects(() => polls.create(group.id, 2, pollInput), { code: '23505' });
  });
});

void test('requires a previous poll from the same group', async () => {
  await inTransaction(async ({ groups, polls }) => {
    const first = await groups.create({ name: 'First' });
    const second = await groups.create({ name: 'Second' });
    const previous = await polls.create(first.id, 1, pollInput);
    await assert.rejects(() => polls.create(second.id, 1, pollInput, previous.id), {
      code: '23503',
    });
  });
});

void test('clears a reference when its previous poll is deleted', async () => {
  await inTransaction(async ({ groups, polls, probe }) => {
    const group = await groups.create({ name: 'Team' });
    const previous = await polls.create(group.id, 1, pollInput);
    await polls.close(previous.id);
    const current = await polls.create(group.id, 2, pollInput, previous.id);
    await probe.deletePoll(previous.id);
    const saved = await probe.pollReference(current.id);
    assert.equal(saved.basedOnPollId, null);
  });
});
