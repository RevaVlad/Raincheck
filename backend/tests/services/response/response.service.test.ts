import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PollService } from '#services/poll/poll.service';
import { ResponseService } from '#services/response/response.service';
import { blockResponseInsert, blockResponseUpdate } from '../../support/concurrency.js';
import { DatabaseProbe } from '../../support/database-probe.js';
import {
  inTransaction,
  persistedResponse,
  pollInput,
  services,
  sharedDatabase,
} from '../../support/database.js';

const now = new Date('2026-10-01T12:00:00.000Z');

void test('creates a draft and makes confirmation idempotent', async () => {
  await inTransaction(async (context) => {
    const { response } = await persistedResponse(context);
    await context.responses.confirm(response.id, now);
    await context.responses.confirm(response.id, new Date('2026-10-02T12:00:00.000Z'));
    const confirmed = await context.probe.responseState(response.id);
    assert.equal(confirmed.state, 'CONFIRMED');
    assert.equal(confirmed.confirmedAt?.toISOString(), now.toISOString());
  });
});

void test('rejects a participant from another group', async () => {
  await inTransaction(async ({ groups, participants, polls, responses }) => {
    const first = await groups.create({ name: 'First' });
    const second = await groups.create({ name: 'Second' });
    const poll = await polls.create(first.id, 1, pollInput);
    const { participant } = await participants.create(second.id, 'Alice');
    await assert.rejects(() => responses.create(poll.id, participant.id), /same group/i);
  });
});

void test('does not create or edit responses after a poll closes', async () => {
  await inTransaction(async (context) => {
    const { poll, participant, response } = await persistedResponse(context);
    await context.polls.close(poll.id);
    await assert.rejects(() => context.responses.create(poll.id, participant.id), /open poll/i);
    await assert.rejects(() => context.responses.confirm(response.id), /open poll/i);
    await assert.rejects(() => context.responses.markDraft(response.id), /open poll/i);
  });
});

void test('finishes response creation before a concurrent poll close', async () => {
  const database = sharedDatabase();
  const setup = services(database);
  const probe = new DatabaseProbe(database);
  const group = await setup.groups.create({ name: 'Concurrent team' });
  const { participant } = await setup.participants.create(group.id, 'Alice');
  const poll = await setup.polls.create(group.id, 1, pollInput);

  try {
    const insertBlock = await blockResponseInsert(database, participant.id);
    try {
      const completionOrder: string[] = [];
      const create = new ResponseService(database)
        .create(poll.id, participant.id)
        .then(() => completionOrder.push('create'));
      await insertBlock.waitUntilBlocked();
      const close = new PollService(database)
        .close(poll.id)
        .then(() => completionOrder.push('close'));

      await insertBlock.waitUntilCloseBlocked();
      await insertBlock.release();
      await Promise.all([create, close]);
      assert.deepEqual(completionOrder, ['create', 'close']);
    } finally {
      await insertBlock.dispose();
    }
  } finally {
    await probe.deleteGroup(group.id);
  }
});

void test('finishes response confirmation before a concurrent poll close', async () => {
  const database = sharedDatabase();
  const setup = services(database);
  const probe = new DatabaseProbe(database);
  const group = await setup.groups.create({ name: 'Concurrent confirmation team' });
  const { participant } = await setup.participants.create(group.id, 'Alice');
  const poll = await setup.polls.create(group.id, 1, pollInput);
  const response = await setup.responses.create(poll.id, participant.id);

  try {
    const updateBlock = await blockResponseUpdate(database, response.id);
    try {
      const completionOrder: string[] = [];
      const confirm = new ResponseService(database)
        .confirm(response.id, now)
        .then(() => completionOrder.push('confirm'));
      await updateBlock.waitUntilBlocked();
      const close = new PollService(database)
        .close(poll.id)
        .then(() => completionOrder.push('close'));

      await updateBlock.waitUntilCloseBlocked();
      await updateBlock.release();
      await Promise.all([confirm, close]);
      assert.deepEqual(completionOrder, ['confirm', 'close']);
      assert.equal((await probe.responseState(response.id)).state, 'CONFIRMED');
      await assert.rejects(() => setup.responses.markDraft(response.id), /open poll/i);
    } finally {
      await updateBlock.dispose();
    }
  } finally {
    await probe.deleteGroup(group.id);
  }
});
