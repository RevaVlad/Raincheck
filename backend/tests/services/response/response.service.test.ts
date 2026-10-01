import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ResponseEntity } from '#infrastructure/database/entities/response.entity';
import { inTransaction, persistedResponse, pollInput } from '../../support/database.js';

const now = new Date('2026-10-01T12:00:00.000Z');

test('creates a draft and makes confirmation idempotent', async () => {
  await inTransaction(async (context) => {
    const { response } = await persistedResponse(context);
    await context.responses.confirm(response.id, now);
    await context.responses.confirm(response.id, new Date('2026-10-02T12:00:00.000Z'));
    context.em.clear();
    const confirmed = await context.em.findOneOrFail(ResponseEntity, response.id);
    assert.equal(confirmed.state, 'CONFIRMED');
    assert.equal(confirmed.confirmedAt?.toISOString(), now.toISOString());
  });
});

test('rejects a participant from another group', async () => {
  await inTransaction(async ({ groups, participants, polls, responses }) => {
    const first = await groups.create({ name: 'First' });
    const second = await groups.create({ name: 'Second' });
    const poll = await polls.create(first.id, 1, pollInput);
    const { participant } = await participants.create(second.id, 'Alice');
    await assert.rejects(() => responses.create(poll.id, participant.id), /same group/i);
  });
});

test('does not create or edit responses after a poll closes', async () => {
  await inTransaction(async (context) => {
    const { poll, participant, response } = await persistedResponse(context);
    await context.polls.close(poll.id);
    await assert.rejects(() => context.responses.create(poll.id, participant.id), /open poll/i);
    await assert.rejects(() => context.responses.confirm(response.id), /open poll/i);
    await assert.rejects(() => context.responses.markDraft(response.id), /open poll/i);
  });
});
