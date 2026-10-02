import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { inTransaction } from '../../support/database.js';

void test('stores a normalized name and only the token hash', async () => {
  await inTransaction(async ({ groups, participants, probe }) => {
    const group = await groups.create({ name: 'Team' });
    const result = await participants.create(group.id, '  Alice   Smith ');
    const saved = await probe.participantToken(result.participant.id);
    assert.equal(result.participant.displayName, 'Alice Smith');
    assert.match(result.editToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(saved.editTokenHash, createHash('sha256').update(result.editToken).digest('hex'));
    assert.ok(!JSON.stringify(result.participant).includes(result.editToken));
  });
});

void test('rejects duplicate normalized names in one group', async () => {
  await inTransaction(async ({ groups, participants }) => {
    const group = await groups.create({ name: 'Team' });
    await participants.create(group.id, 'Alice');
    await assert.rejects(() => participants.create(group.id, ' ALICE '), { code: '23505' });
  });
});
