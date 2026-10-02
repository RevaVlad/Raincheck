import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GroupService } from '#services/group/group.service';
import { inTransaction } from '../../support/database.js';

const now = new Date('2026-10-01T12:00:00.000Z');

async function createGroup(groups: GroupService) {
  return groups.create({ name: '  CRM Team  ' }, now);
}

void test('creates and stores a normalized UTC group', async () => {
  await inTransaction(async ({ groups }) => {
    const group = await createGroup(groups);
    assert.equal(group.name, 'CRM Team');
    assert.equal(group.timezone, 'UTC');
    assert.match(group.inviteCode, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(group.createdAt.toISOString(), now.toISOString());
  });
});

void test('creates a unique invite code for every group', async () => {
  await inTransaction(async ({ groups }) => {
    const first = await createGroup(groups);
    const second = await createGroup(groups);
    assert.notEqual(first.inviteCode, second.inviteCode);
  });
});
