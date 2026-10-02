import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { IntervalInput } from '#domain/interval/interval';
import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { dateToPrisma, timeToPrisma, toInterval } from '#infrastructure/database/prisma-records';
import { IntervalService } from '#services/interval/interval.service';
import { inPrismaTransaction } from '../../support/prisma-database.js';

const createdAt = new Date('2026-10-01T10:00:00.000Z');
const confirmedAt = new Date('2026-10-01T11:00:00.000Z');
const changedAt = new Date('2026-10-01T12:00:00.000Z');
const firstInterval = {
  localDate: '2026-10-06',
  startTime: '18:00',
  endTime: '19:00',
  kind: 'PREFERRED' as const,
};
const laterInterval = { ...firstInterval, startTime: '20:00', endTime: '21:00' };

async function createParticipant(database: PrismaDatabase) {
  const group = await database.client.group.create({
    data: {
      id: randomUUID(),
      name: 'Team',
      inviteCode: randomUUID(),
      timezone: 'UTC',
      createdAt,
    },
  });
  return database.client.participant.create({
    data: {
      id: randomUUID(),
      groupId: group.id,
      displayName: 'Alice',
      displayNameNormalized: 'alice',
      editTokenHash: randomUUID().replaceAll('-', '').repeat(2),
      createdAt,
      updatedAt: createdAt,
    },
  });
}

async function fixture(database: PrismaDatabase) {
  const participant = await createParticipant(database);
  const poll = await database.client.poll.create({
    data: {
      id: randomUUID(),
      groupId: participant.groupId,
      sequenceNo: 1,
      title: 'Team meeting',
      startsOn: dateToPrisma('2026-10-06'),
      endsOn: dateToPrisma('2026-10-12'),
      dayStart: timeToPrisma('16:00'),
      dayEnd: timeToPrisma('23:00'),
      slotMinutes: 30,
      meetingDurationMinutes: 60,
      status: 'OPEN',
      createdAt,
    },
  });
  const response = await database.client.pollResponse.create({
    data: {
      id: randomUUID(),
      pollId: poll.id,
      participantId: participant.id,
      state: 'DRAFT',
      updatedAt: createdAt,
    },
  });
  return { poll, response, intervals: new IntervalService(database) };
}

async function confirm(database: PrismaDatabase, id: string) {
  await database.client.pollResponse.update({
    where: { id },
    data: { state: 'CONFIRMED', confirmedAt, updatedAt: confirmedAt },
  });
}

async function saved(database: PrismaDatabase, responseId: string) {
  return {
    response: await database.client.pollResponse.findUniqueOrThrow({ where: { id: responseId } }),
    intervals: await database.client.availabilityInterval.findMany({
      where: { responseId },
      orderBy: [{ localDate: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    }),
  };
}

void test('changed replacement resets confirmation and persists timestamps', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const { response, intervals } = await fixture(database);
    const [original] = await intervals.replace(response.id, [firstInterval], createdAt);
    await confirm(database, response.id);
    const replacement = await intervals.replace(
      response.id,
      [{ ...firstInterval, kind: 'UNAVAILABLE' }],
      changedAt,
    );
    const stored = await saved(database, response.id);
    assert.equal(stored.response.state, 'DRAFT');
    assert.equal(stored.response.confirmedAt, null);
    assert.deepEqual(stored.response.updatedAt, changedAt);
    assert.deepEqual(stored.intervals.map(toInterval), replacement);
    assert.equal(replacement.length, 1);
    assert.notEqual(replacement[0]?.id, original?.id);
    assert.deepEqual(replacement[0]?.createdAt, changedAt);
    assert.deepEqual(replacement[0]?.updatedAt, changedAt);
    assert.equal(replacement[0]?.preferenceDirection, null);
  });
});

void test('equal replacement preserves IDs, timestamps and confirmation', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const { response, intervals } = await fixture(database);
    await intervals.replace(response.id, [laterInterval, firstInterval], createdAt);
    await confirm(database, response.id);
    const before = await saved(database, response.id);
    const replacement = await intervals.replace(
      response.id,
      [
        { ...firstInterval, preferenceDirection: 'FLAT' },
        { ...laterInterval, preferenceDirection: 'FLAT' },
      ],
      changedAt,
    );
    assert.deepEqual(replacement, before.intervals.map(toInterval));
    assert.deepEqual(await saved(database, response.id), before);
    assert.equal(before.response.state, 'CONFIRMED');
    assert.deepEqual(before.response.confirmedAt, confirmedAt);
  });
});

void test('unchanged empty replacement preserves draft response timestamp', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const { response, intervals } = await fixture(database);
    const before = await saved(database, response.id);
    assert.deepEqual(await intervals.replace(response.id, [], changedAt), []);
    assert.deepEqual(await saved(database, response.id), before);
  });
});

void test('clearing stored availability returns the confirmed response to draft', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const { response, intervals } = await fixture(database);
    await intervals.replace(response.id, [firstInterval], createdAt);
    await confirm(database, response.id);
    assert.deepEqual(await intervals.replace(response.id, [], changedAt), []);
    const stored = await saved(database, response.id);
    assert.deepEqual(stored.intervals, []);
    assert.equal(stored.response.state, 'DRAFT');
    assert.equal(stored.response.confirmedAt, null);
    assert.deepEqual(stored.response.updatedAt, changedAt);
  });
});

const invalidReplacements: { name: string; inputs: IntervalInput[]; error: RegExp }[] = [
  {
    name: 'overlapping intervals',
    inputs: [firstInterval, { ...firstInterval, startTime: '18:30', endTime: '19:30' }],
    error: /overlap/i,
  },
  {
    name: 'date outside the poll',
    inputs: [{ ...firstInterval, localDate: '2026-10-13' }],
    error: /outside the poll/i,
  },
  {
    name: 'time outside the daily window',
    inputs: [{ ...firstInterval, startTime: '15:00' }],
    error: /daily window/i,
  },
  {
    name: 'unaligned slot boundary',
    inputs: [{ ...firstInterval, endTime: '19:15' }],
    error: /align/i,
  },
];

for (const { name, inputs, error } of invalidReplacements) {
  void test(`invalid replacement preserves intervals and confirmation: ${name}`, async () => {
    await inPrismaTransaction(async ({ database }) => {
      const { response, intervals } = await fixture(database);
      await intervals.replace(response.id, [firstInterval], createdAt);
      await confirm(database, response.id);
      const before = await saved(database, response.id);
      await assert.rejects(() => intervals.replace(response.id, inputs, changedAt), error);
      assert.deepEqual(await saved(database, response.id), before);
    });
  });
}

void test('closed poll rejects replacements and preserves intervals and confirmation', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const { poll, response, intervals } = await fixture(database);
    await intervals.replace(response.id, [firstInterval], createdAt);
    await confirm(database, response.id);
    await database.client.poll.update({
      where: { id: poll.id },
      data: { status: 'CLOSED', closedAt: changedAt },
    });
    const before = await saved(database, response.id);
    for (const inputs of [[laterInterval], [firstInterval], []]) {
      await assert.rejects(() => intervals.replace(response.id, inputs, changedAt), /open poll/i);
      assert.deepEqual(await saved(database, response.id), before);
    }
  });
});

void test('replacement rejects a missing response', async () => {
  await inPrismaTransaction(async ({ database }) => {
    await assert.rejects(
      () => new IntervalService(database).replace(randomUUID(), [firstInterval]),
      /Response not found/,
    );
  });
});
