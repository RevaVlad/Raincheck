import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGroup } from '#services/group/group.service';
import { inTransaction } from '../../support/database.js';

const now = new Date('2026-10-01T12:00:00.000Z');

test('creates UTC groups with trimmed names and unique invite codes', async () => {
  await inTransaction(async (db) => {
    const first = await createGroup(db, { name: '  CRM Team  ' }, now);
    const second = await createGroup(db, { name: 'CRM Team' }, now);
    assert.equal(first.name, 'CRM Team');
    assert.equal(first.timezone, 'UTC');
    assert.match(first.inviteCode, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first.inviteCode, second.inviteCode);
    assert.equal(first.createdAt.toISOString(), now.toISOString());
  });
});

test('rejects a blank group name', async () => {
  await inTransaction(async (db) => {
    await assert.rejects(() => createGroup(db, { name: '  ' }), /name/i);
  });
});

test('stores the group and its invite code', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    const saved = await db.query<{ name: string; invite_code: string; timezone: string }>(
      'SELECT name, invite_code, timezone FROM groups WHERE id = $1', [group.id],
    );
    assert.deepEqual(saved.rows[0], {
      name: 'Team', invite_code: group.inviteCode, timezone: 'UTC',
    });
  });
});

test('database rejects non-UTC group timezones', async () => {
  await inTransaction(async (db) => {
    const group = await createGroup(db, { name: 'Team' });
    await assert.rejects(
      () => db.query('UPDATE groups SET timezone = $2 WHERE id = $1', [group.id, 'Asia/Yekaterinburg']),
      (error: { code?: string }) => error.code === '23514',
    );
  });
});
