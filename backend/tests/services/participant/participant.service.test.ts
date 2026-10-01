import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createGroup } from '#services/group/group.service';
import { createParticipant } from '#services/participant/participant.service';
import { inTransaction } from '../../support/database.js';

test('stores a normalized name and only the token hash', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    const { participant, editToken } = await createParticipant(db, group.id, '  Alice   Smith ');
    const saved = await db.query<{ display_name_normalized: string; edit_token_hash: string }>(
      'SELECT display_name_normalized, edit_token_hash FROM participants WHERE id = $1',
      [participant.id],
    );
    assert.equal(participant.displayName, 'Alice Smith');
    assert.equal(participant.displayNameNormalized, 'alice smith');
    assert.match(editToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(participant.editTokenHash, createHash('sha256').update(editToken).digest('hex'));
    assert.ok(!JSON.stringify(participant).includes(editToken));
    assert.deepEqual(saved.rows[0], {
      display_name_normalized: 'alice smith', edit_token_hash: participant.editTokenHash,
    });
  });
});

test('rejects duplicate normalized names in one group', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    await createParticipant(db, group.id, 'Alice');
    await assert.rejects(
      () => createParticipant(db, group.id, '  ALICE  '),
      (error: { code?: string }) => error.code === '23505',
    );
  });
});
