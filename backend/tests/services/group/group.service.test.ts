import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupService } from '#services/group/group.service';
import { inPrismaTransaction } from '../../support/prisma-database.js';

const now = new Date('2026-10-01T12:00:00.000Z');

async function createGroup(groups: GroupService) {
  return groups.create({ name: '  CRM Team  ' }, now);
}

void test('creates and stores a normalized UTC group', async () => {
  await inPrismaTransaction(async ({ database, probe }) => {
    const groups = new GroupService(database);
    const group = await createGroup(groups);
    assert.equal(group.name, 'CRM Team');
    assert.equal(group.timezone, 'UTC');
    assert.match(group.inviteCode, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(group.createdAt.toISOString(), now.toISOString());
    assert.equal(await probe.groupExists(group.id), true);
  });
});

void test('creates a unique invite code for every group', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const groups = new GroupService(database);
    const first = await createGroup(groups);
    const second = await createGroup(groups);
    assert.notEqual(first.inviteCode, second.inviteCode);
  });
});

void test('finds a group by its invite code', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const groups = new GroupService(database);
    const group = await createGroup(groups);
    assert.deepEqual(await groups.findByInviteCode(group.inviteCode), group);
    assert.equal(await groups.findByInviteCode('missing'), null);
  });
});
