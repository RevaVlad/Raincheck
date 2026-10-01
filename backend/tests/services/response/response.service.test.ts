import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGroup } from '#services/group/group.service';
import { createParticipant } from '#services/participant/participant.service';
import { closePoll, createPoll } from '#services/poll/poll.service';
import { confirmResponse, createResponse, markResponseDraft } from '#services/response/response.service';
import { inTransaction, pollInput } from '../../support/database.js';

const now = new Date('2026-10-01T12:00:00.000Z');

test('creates a draft and makes confirmation idempotent', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    const { participant } = await createParticipant(db, group.id, 'Alice');
    const poll = await createPoll(db, group.id, 1, pollInput);
    const response = await createResponse(db, poll.id, participant.id);
    assert.equal(response.state, 'DRAFT');

    await confirmResponse(db, response.id, now);
    await confirmResponse(db, response.id, new Date('2026-10-02T12:00:00.000Z'));
    const saved = await db.query<{ state: string; confirmed_at: Date }>(
      'SELECT state, confirmed_at FROM poll_responses WHERE id = $1', [response.id],
    );
    assert.equal(saved.rows[0]?.state, 'CONFIRMED');
    assert.equal(saved.rows[0]?.confirmed_at.toISOString(), now.toISOString());

    await markResponseDraft(db, response.id, now);
    const draft = await db.query<{ state: string; confirmed_at: Date | null }>(
      'SELECT state, confirmed_at FROM poll_responses WHERE id = $1', [response.id],
    );
    assert.deepEqual(draft.rows[0], { state: 'DRAFT', confirmed_at: null });
  });
});

test('rejects a participant from another group', async () => {
  await inTransaction(async (db) => {
    const first = await createGroup(db, { name: 'First' });
    const second = await createGroup(db, { name: 'Second' });
    const poll = await createPoll(db, first.id, 1, pollInput);
    const { participant } = await createParticipant(db, second.id, 'Alice');
    await assert.rejects(() => createResponse(db, poll.id, participant.id), /same group/i);
  });
});

test('rejects a response to a closed poll', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    const { participant } = await createParticipant(db, group.id, 'Alice');
    const poll = await createPoll(db, group.id, 1, pollInput);
    await closePoll(db, poll);
    await assert.rejects(() => createResponse(db, poll.id, participant.id), /open poll/i);
  });
});

test('does not confirm a response after its poll closes', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    const { participant } = await createParticipant(db, group.id, 'Alice');
    const poll = await createPoll(db, group.id, 1, pollInput);
    const response = await createResponse(db, poll.id, participant.id);
    await closePoll(db, poll);
    await assert.rejects(() => confirmResponse(db, response.id), /open poll/i);
  });
});

test('does not edit a response after its poll closes', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    const { participant } = await createParticipant(db, group.id, 'Alice');
    const poll = await createPoll(db, group.id, 1, pollInput);
    const response = await createResponse(db, poll.id, participant.id);
    await closePoll(db, poll);
    await assert.rejects(() => markResponseDraft(db, response.id), /open poll/i);
  });
});
