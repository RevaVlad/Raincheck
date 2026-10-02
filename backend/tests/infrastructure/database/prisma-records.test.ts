import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import * as mappers from '#infrastructure/database/prisma-records';
import { inPrismaTransaction } from '../../support/prisma-database.js';

void test('Prisma round trips preserve dates and times under a non-UTC TZ', async () => {
  const originalTimezone = process.env['TZ'];
  process.env['TZ'] = 'America/Los_Angeles';
  try {
    assert.notEqual(new Date('2026-10-02T09:12:34.567Z').getTimezoneOffset(), 0);
    await inPrismaTransaction(async ({ database }) => {
      await assertIdentityRecords(database, mappers);
      await assertPollRecord(database, mappers);
      await assertResponseAndIntervalRecords(database, mappers);
    });
  } finally {
    if (originalTimezone === undefined) delete process.env['TZ'];
    else process.env['TZ'] = originalTimezone;
  }
});

const createdAt = new Date('2026-10-02T09:12:34.567Z');
const group = {
  id: randomUUID(),
  name: 'Team',
  inviteCode: randomUUID(),
  timezone: 'UTC' as const,
  createdAt,
};
const participant = {
  id: randomUUID(),
  groupId: group.id,
  displayName: 'Alice',
  displayNameNormalized: 'alice',
  editTokenHash: 'a'.repeat(64),
  createdAt,
  updatedAt: createdAt,
};
const poll = {
  id: randomUUID(),
  groupId: group.id,
  sequenceNo: 1,
  title: null,
  startsOn: '2026-10-06',
  endsOn: '2026-10-12',
  dayStart: '00:30',
  dayEnd: '23:30',
  slotMinutes: 30 as const,
  meetingDurationMinutes: 60,
  status: 'OPEN' as const,
  basedOnPollId: null,
  createdAt,
  closedAt: null,
};
const response = {
  id: randomUUID(),
  pollId: poll.id,
  participantId: participant.id,
  state: 'CONFIRMED' as const,
  confirmedAt: createdAt,
  updatedAt: createdAt,
};
const interval = {
  id: randomUUID(),
  responseId: response.id,
  localDate: '2026-10-06',
  startTime: '00:30',
  endTime: '23:30',
  kind: 'PREFERRED' as const,
  preferenceDirection: 'EARLIER' as const,
  createdAt,
  updatedAt: createdAt,
};

async function assertIdentityRecords(database: PrismaDatabase, records: typeof mappers) {
  assert.deepEqual(records.toGroup(await database.client.group.create({ data: group })), group);
  assert.deepEqual(
    records.toParticipant(
      await database.client.participant.create({
        data: participant,
      }),
    ),
    participant,
  );
}

async function assertPollRecord(database: PrismaDatabase, records: typeof mappers) {
  assert.deepEqual(
    records.toPoll(
      await database.client.poll.create({
        data: {
          ...poll,
          startsOn: records.dateToPrisma(poll.startsOn),
          endsOn: records.dateToPrisma(poll.endsOn),
          dayStart: records.timeToPrisma(poll.dayStart),
          dayEnd: records.timeToPrisma(poll.dayEnd),
        },
      }),
    ),
    poll,
  );
}

async function assertResponseAndIntervalRecords(database: PrismaDatabase, records: typeof mappers) {
  assert.deepEqual(
    records.toResponse(
      await database.client.pollResponse.create({
        data: response,
      }),
    ),
    response,
  );
  assert.deepEqual(
    records.toInterval(
      await database.client.availabilityInterval.create({
        data: {
          ...interval,
          localDate: records.dateToPrisma(interval.localDate),
          startTime: records.timeToPrisma(interval.startTime),
          endTime: records.timeToPrisma(interval.endTime),
        },
      }),
    ),
    interval,
  );
}

void test('UTC conversions preserve midnight, late times, and leap-day dates', () => {
  const { dateToPrisma, timeToPrisma, dateFromPrisma, timeFromPrisma } = mappers;
  assert.equal(dateToPrisma('2028-02-29').toISOString(), '2028-02-29T00:00:00.000Z');
  assert.equal(timeToPrisma('00:00').toISOString(), '1970-01-01T00:00:00.000Z');
  assert.equal(timeToPrisma('23:59').toISOString(), '1970-01-01T23:59:00.000Z');
  assert.equal(dateFromPrisma(new Date('2028-02-29T00:00:00.000Z')), '2028-02-29');
  assert.equal(timeFromPrisma(new Date('1970-01-01T23:59:00.000Z')), '23:59');
  assert.throws(() => dateToPrisma('2026-02-29'), RangeError);
  assert.throws(() => timeToPrisma('24:00'), RangeError);
});
