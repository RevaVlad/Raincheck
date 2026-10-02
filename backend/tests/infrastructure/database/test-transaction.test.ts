import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupService } from '#services/group/group.service';
import { inPrismaTransaction, sharedPrismaDatabase } from '../../support/prisma-database.js';
import { PrismaProbe } from '../../support/prisma-probe.js';

void test('rolls back a successful service-test transaction', async () => {
  let groupId: string | undefined;
  await inPrismaTransaction(async ({ database, probe }) => {
    groupId = (await new GroupService(database).create({ name: 'Rollback sentinel' })).id;
    assert.equal(await probe.groupExists(groupId), true);
  });

  assert.ok(groupId);
  const probe = new PrismaProbe(sharedPrismaDatabase());
  assert.equal(await probe.groupExists(groupId), false);
});
