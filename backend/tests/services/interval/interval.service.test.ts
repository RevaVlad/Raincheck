import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { IntervalInput } from '#domain/interval/interval';
import type { PrismaConnection } from '#infrastructure/database/prisma-database';
import { dateToPrisma, timeToPrisma, toInterval } from '#infrastructure/database/prisma-records';
import { IntervalService } from '#services/interval/interval.service';
import { inPrismaTransaction } from '../../support/prisma-database.js';

const createdAt = new Date('2026-10-01T10:00:00.000Z');
const confirmedAt = new Date('2026-10-01T11:00:00.000Z');
const changedAt = new Date('2026-10-01T12:00:00.000Z');
const firstInterval = {
  startAt: '2026-10-06T18:00:00.000Z',
  endAt: '2026-10-06T19:00:00.000Z',
  kind: 'PREFERRED' as const,
};
const laterInterval = {
  ...firstInterval,
  startAt: '2026-10-06T20:00:00.000Z',
  endAt: '2026-10-06T21:00:00.000Z',
};

async function createParticipant(database: PrismaConnection) {
  const group = await database.group.create({
    data: {
      id: randomUUID(),
      name: 'Team',
      inviteCode: randomUUID(),
      createdAt,
    },
  });
  return database.participant.create({
    data: {
      id: randomUUID(),
      groupId: group.id,
      displayName: 'Alice',
      displayNameNormalized: 'alice',
      avatarColor: 'green',
      editTokenHash: randomUUID().replaceAll('-', '').repeat(2),
      createdAt,
      updatedAt: createdAt,
    },
  });
}

async function fixture(
  database: PrismaConnection,
  options: { timeZone?: string; dayStart?: string; dayEnd?: string } = {},
) {
  const participant = await createParticipant(database);
  const poll = await database.poll.create({
    data: {
      id: randomUUID(),
      groupId: participant.groupId,
      sequenceNo: 1,
      title: 'Team meeting',
      startsOn: dateToPrisma('2026-10-06'),
      endsOn: dateToPrisma('2026-10-12'),
      dayStart: timeToPrisma(options.dayStart ?? '16:00'),
      dayEnd: timeToPrisma(options.dayEnd ?? '23:00'),
      slotMinutes: 30,
      meetingDurationMinutes: 60,
      timeZone: options.timeZone ?? 'UTC',
      status: 'OPEN',
      createdAt,
    },
  });
  const response = await database.pollResponse.create({
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

async function confirm(database: PrismaConnection, id: string) {
  await database.pollResponse.update({
    where: { id },
    data: { state: 'CONFIRMED', confirmedAt, updatedAt: confirmedAt },
  });
}

async function saved(database: PrismaConnection, responseId: string) {
  return {
    response: await database.pollResponse.findUniqueOrThrow({ where: { id: responseId } }),
    intervals: await database.availabilityInterval.findMany({
      where: { responseId },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
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

void test('UTC intervals crossing midnight persist and reopen unchanged', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const { response, intervals } = await fixture(database, {
      timeZone: 'America/Los_Angeles',
      dayStart: '16:00',
      dayEnd: '17:00',
    });
    const input = {
      startAt: '2026-10-06T23:30:00.000Z',
      endAt: '2026-10-07T00:00:00.000Z',
      kind: 'PREFERRED' as const,
    };
    const savedIntervals = await intervals.replace(response.id, [input], createdAt);
    const persisted = await saved(database, response.id);
    assert.deepEqual(savedIntervals, persisted.intervals.map(toInterval));
    assert.equal(persisted.intervals[0]?.startAt.toISOString(), input.startAt);
    assert.equal(persisted.intervals[0]?.endAt.toISOString(), input.endAt);
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
    inputs: [
      firstInterval,
      { ...firstInterval, startAt: '2026-10-06T18:30:00.000Z', endAt: '2026-10-06T19:30:00.000Z' },
    ],
    error: /overlap/i,
  },
  {
    name: 'bounds outside the poll',
    inputs: [
      { ...firstInterval, startAt: '2026-10-13T18:00:00.000Z', endAt: '2026-10-13T19:00:00.000Z' },
    ],
    error: /outside generated poll slots/i,
  },
  {
    name: 'time outside the daily window',
    inputs: [{ ...firstInterval, startAt: '2026-10-06T15:00:00.000Z' }],
    error: /generated poll slots/i,
  },
  {
    name: 'unaligned slot boundary',
    inputs: [{ ...firstInterval, endAt: '2026-10-06T19:15:00.000Z' }],
    error: /poll slots/i,
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
    await database.poll.update({
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
