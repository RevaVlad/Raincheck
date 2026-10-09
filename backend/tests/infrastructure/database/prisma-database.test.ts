import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { loadConfig } from '#config/config';
import {
  createPrismaClient,
  isDatabaseAvailable,
  withTransaction,
} from '#infrastructure/database/prisma-database';
import { dateToPrisma, timeToPrisma } from '#infrastructure/database/prisma-records';
import { inPrismaTransaction, sharedPrismaClient } from '../../support/prisma-database.js';
import { PrismaProbe } from '../../support/prisma-probe.js';

const groupData = () => ({
  id: randomUUID(),
  name: 'Prisma foundation',
  inviteCode: randomUUID(),
  createdAt: new Date('2026-10-02T09:12:34.567Z'),
});

const pollData = (groupId: string, sequenceNo: number, basedOnPollId: string | null) => ({
  id: randomUUID(),
  groupId,
  sequenceNo,
  title: null,
  startsOn: dateToPrisma('2026-10-06'),
  endsOn: dateToPrisma('2026-10-12'),
  dayStart: timeToPrisma('16:00'),
  dayEnd: timeToPrisma('23:00'),
  slotMinutes: 30,
  meetingDurationMinutes: 60,
  timeZone: 'UTC',
  status: 'CLOSED',
  basedOnPollId,
  createdAt: new Date('2026-10-02T09:12:34.567Z'),
  closedAt: new Date('2026-10-02T10:00:00.000Z'),
});

void test('Prisma rollback harness rolls back after a successful callback', async () => {
  const data = groupData();
  await inPrismaTransaction(async ({ database, probe }) => {
    await database.group.create({ data });
    assert.equal(await probe.groupExists(data.id), true);
  });
  assert.equal(await new PrismaProbe(sharedPrismaClient()).groupExists(data.id), false);
});

void test('withTransaction reuses an existing Prisma transaction client', async () => {
  const data = groupData();
  await inPrismaTransaction(async ({ database }) => {
    await database.group.create({ data });
    await withTransaction(database, async (inner) => {
      assert.equal(
        (await inner.group.findUniqueOrThrow({ where: { id: data.id } })).name,
        'Prisma foundation',
      );
      await inner.group.update({ where: { id: data.id }, data: { name: 'Inner update' } });
    });
    assert.equal(
      (await database.group.findUniqueOrThrow({ where: { id: data.id } })).name,
      'Inner update',
    );
  });
  assert.equal(await sharedPrismaClient().group.count({ where: { id: data.id } }), 0);
});

void test('Prisma transactions commit success and roll back callback failures', async () => {
  const database = createPrismaClient(loadConfig());
  const data = groupData();
  try {
    assert.equal(await isDatabaseAvailable(database), true);
    await withTransaction(database, async (transaction) => {
      await transaction.group.create({ data });
    });
    const failure = new Error('rollback');
    await assert.rejects(
      withTransaction(database, async (transaction) => {
        await transaction.group.update({ where: { id: data.id }, data: { name: 'Lost' } });
        throw failure;
      }),
      (error: unknown) => error === failure,
    );
    assert.equal(
      (await database.group.findUniqueOrThrow({ where: { id: data.id } })).name,
      'Prisma foundation',
    );
  } finally {
    await database.group.deleteMany({ where: { id: data.id } });
    await database.$disconnect();
  }
});

void test('deleting a poll nulls only based_on_poll_id through the Prisma client', async () => {
  const data = groupData();
  await inPrismaTransaction(async ({ database, probe }) => {
    await database.group.create({ data });
    const previous = await database.poll.create({ data: pollData(data.id, 1, null) });
    const current = await database.poll.create({
      data: pollData(data.id, 2, previous.id),
    });

    assert.deepEqual(await probe.pollReference(current.id), { basedOnPollId: previous.id });

    await probe.deletePoll(previous.id);

    assert.deepEqual(await probe.pollReference(current.id), { basedOnPollId: null });
    const survivor = await database.poll.findUniqueOrThrow({ where: { id: current.id } });
    assert.equal(survivor.groupId, data.id);
    assert.equal(await probe.groupExists(data.id), true);
  });
});

void test('Prisma readiness returns false for an unreachable database', async () => {
  const database = createPrismaClient({
    ...loadConfig(),
    databaseUrl: 'postgres://raincheck:raincheck@localhost:1/raincheck_prisma_foundation',
  });
  try {
    assert.equal(await isDatabaseAvailable(database), false);
  } finally {
    await database.$disconnect();
  }
});

void test('Prisma transactions survive more than 60 seconds of elapsed time', async (t) => {
  const database = createPrismaClient(loadConfig());
  const data = groupData();
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  try {
    await withTransaction(database, async (transaction) => {
      await transaction.group.create({ data });
      t.mock.timers.tick(61_000);
      await new Promise<void>((resolve) => setImmediate(resolve));
      await transaction.group.update({
        where: { id: data.id },
        data: { name: 'Completed after 61 seconds' },
      });
    });
    assert.equal(
      (await database.group.findUniqueOrThrow({ where: { id: data.id } })).name,
      'Completed after 61 seconds',
    );
  } finally {
    t.mock.timers.reset();
    await database.group.deleteMany({ where: { id: data.id } });
    await database.$disconnect();
  }
});
