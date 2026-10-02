import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { loadConfig } from '#config/config';
import { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { inPrismaTransaction, sharedPrismaDatabase } from '../../support/prisma-database.js';
import { PrismaProbe } from '../../support/prisma-probe.js';

const groupData = () => ({
  id: randomUUID(),
  name: 'Prisma foundation',
  inviteCode: randomUUID(),
  timezone: 'UTC',
  createdAt: new Date('2026-10-02T09:12:34.567Z'),
});

void test('Prisma rollback harness rolls back after a successful callback', async () => {
  const data = groupData();
  await inPrismaTransaction(async ({ database, probe }) => {
    await database.client.group.create({ data });
    assert.equal(await probe.groupExists(data.id), true);
  });
  assert.equal(await new PrismaProbe(sharedPrismaDatabase()).groupExists(data.id), false);
});

void test('an inner transaction joins the outer transaction and rolls back with it', async () => {
  const data = groupData();
  await inPrismaTransaction(async ({ database }) => {
    await database.client.group.create({ data });
    await database.transaction(async (inner) => {
      assert.equal(
        (await inner.client.group.findUniqueOrThrow({ where: { id: data.id } })).name,
        'Prisma foundation',
      );
      await inner.client.group.update({ where: { id: data.id }, data: { name: 'Inner update' } });
      await inner.close();
    });
    assert.equal(
      (await database.client.group.findUniqueOrThrow({ where: { id: data.id } })).name,
      'Inner update',
    );
  });
  assert.equal(await sharedPrismaDatabase().client.group.count({ where: { id: data.id } }), 0);
});

void test('Prisma transactions commit success and roll back callback failures', async () => {
  const database = PrismaDatabase.create(loadConfig());
  const data = groupData();
  try {
    assert.equal(await database.isAvailable(), true);
    await database.transaction(async (transaction) => {
      await transaction.client.group.create({ data });
    });
    const failure = new Error('rollback');
    await assert.rejects(
      database.transaction(async (transaction) => {
        await transaction.client.group.update({ where: { id: data.id }, data: { name: 'Lost' } });
        throw failure;
      }),
      (error: unknown) => error === failure,
    );
    assert.equal(
      (await database.client.group.findUniqueOrThrow({ where: { id: data.id } })).name,
      'Prisma foundation',
    );
  } finally {
    await database.client.group.deleteMany({ where: { id: data.id } });
    await database.close();
  }
});

void test('Prisma readiness returns false for an unreachable database', async () => {
  const database = PrismaDatabase.create({
    ...loadConfig(),
    databaseUrl: 'postgres://raincheck:raincheck@localhost:1/raincheck_prisma_foundation',
  });
  try {
    assert.equal(await database.isAvailable(), false);
  } finally {
    await database.close();
  }
});
