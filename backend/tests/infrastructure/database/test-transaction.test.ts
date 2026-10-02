import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseProbe } from '../../support/database-probe.js';
import { inTransaction, sharedDatabase } from '../../support/database.js';

void test('rolls back a successful service-test transaction', async () => {
  let groupId: string | undefined;
  await inTransaction(async ({ groups }) => {
    groupId = (await groups.create({ name: 'Rollback sentinel' })).id;
  });

  assert.ok(groupId);
  const probe = new DatabaseProbe(sharedDatabase());
  assert.equal(await probe.groupExists(groupId), false);
});
