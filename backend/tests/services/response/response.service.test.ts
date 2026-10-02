import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { dateToPrisma, timeToPrisma } from '#infrastructure/database/prisma-records';
import { ResponseService } from '#services/response/response.service';
import { blockResponseInsert, blockResponseUpdate } from '../../support/concurrency.js';
import { inPrismaTransaction, sharedPrismaDatabase } from '../../support/prisma-database.js';
import { PrismaProbe } from '../../support/prisma-probe.js';

const now = new Date('2026-10-01T12:00:00.000Z');

void test('creates a draft and makes confirmation idempotent', async () => {
  await inTransaction(async (context) => {
    const { response } = await persistedResponse(context);
    assert.equal(response.state, 'DRAFT');
    assert.equal(response.confirmedAt, null);
    assert.deepEqual(response.updatedAt, now);
    const first = await context.responses.confirm(response.id, now);
    const repeated = await context.responses.confirm(response.id, later);
    assert.deepEqual(repeated, first);
    const confirmed = await context.probe.responseState(response.id);
    assert.equal(confirmed.state, 'CONFIRMED');
    assert.equal(confirmed.confirmedAt?.toISOString(), now.toISOString());
  });
});

void test('rejects a participant from another group', async () => {
  await inTransaction(async ({ database, responses }) => {
    const first = await responseFixture(database);
    const second = await responseFixture(database);
    await assert.rejects(
      () => responses.create(first.poll.id, second.participant.id),
      /same group/i,
    );
    assert.equal(await database.client.pollResponse.count(), 0);
  });
});

void test('does not create or edit responses after a poll closes', async () => {
  await inTransaction(async (context) => {
    const { poll, participant, response } = await persistedResponse(context);
    await closePoll(context.database, poll.id);
    await assert.rejects(() => context.responses.create(poll.id, participant.id), /open poll/i);
    await assert.rejects(() => context.responses.confirm(response.id), /open poll/i);
    await assert.rejects(() => context.responses.markDraft(response.id), /open poll/i);
  });
});

void test('finishes response creation before a concurrent poll close', async () => {
  const database = sharedPrismaDatabase();
  const probe = new PrismaProbe(database);
  const { group, participant, poll } = await responseFixture(database);

  try {
    const insertBlock = await blockResponseInsert(participant.id);
    try {
      const completionOrder: string[] = [];
      const create = new ResponseService(database)
        .create(poll.id, participant.id)
        .then(() => completionOrder.push('create'));
      await insertBlock.waitUntilBlocked();
      const close = closePoll(database, poll.id).then(() => completionOrder.push('close'));

      await insertBlock.waitUntilCloseBlocked();
      await insertBlock.release();
      await Promise.all([create, close]);
      assert.deepEqual(completionOrder, ['create', 'close']);
      assert.equal(await database.client.pollResponse.count({ where: { pollId: poll.id } }), 1);
      assert.equal(
        (await database.client.poll.findUniqueOrThrow({ where: { id: poll.id } })).status,
        'CLOSED',
      );
    } finally {
      await insertBlock.dispose();
    }
  } finally {
    await probe.deleteGroup(group.id);
  }
});

void test('finishes response confirmation before a concurrent poll close', async () => {
  const database = sharedPrismaDatabase();
  const responses = new ResponseService(database);
  const probe = new PrismaProbe(database);
  const { group, poll, response } = await persistedResponse({ database, responses });

  try {
    const updateBlock = await blockResponseUpdate(response.id);
    try {
      const completionOrder: string[] = [];
      const confirm = new ResponseService(database)
        .confirm(response.id, now)
        .then(() => completionOrder.push('confirm'));
      await updateBlock.waitUntilBlocked();
      const close = closePoll(database, poll.id).then(() => completionOrder.push('close'));

      await updateBlock.waitUntilCloseBlocked();
      await updateBlock.release();
      await Promise.all([confirm, close]);
      assert.deepEqual(completionOrder, ['confirm', 'close']);
      assert.equal((await probe.responseState(response.id)).state, 'CONFIRMED');
      await assert.rejects(() => responses.markDraft(response.id), /open poll/i);
    } finally {
      await updateBlock.dispose();
    }
  } finally {
    await probe.deleteGroup(group.id);
  }
});

const later = new Date('2026-10-02T12:00:00.000Z');

void test('drafting clears confirmation and preserves an unchanged draft timestamp', async () => {
  await inTransaction(async (context) => {
    const { response } = await persistedResponse(context);
    await context.responses.confirm(response.id, now);
    const draft = await context.responses.markDraft(response.id, later);
    assert.equal(draft.state, 'DRAFT');
    assert.equal(draft.confirmedAt, null);
    assert.deepEqual(draft.updatedAt, later);
    assert.deepEqual(await context.responses.markDraft(response.id, now), draft);
    const confirmed = await context.responses.confirm(response.id, now);
    assert.deepEqual(confirmed.confirmedAt, now);
    assert.deepEqual(confirmed.updatedAt, now);
  });
});

void test('requires both a poll and participant and rejects missing responses', async () => {
  await inTransaction(async ({ database, responses }) => {
    const { poll, participant } = await responseFixture(database);
    await assert.rejects(() => responses.create(randomUUID(), participant.id), /open poll/i);
    await assert.rejects(() => responses.create(poll.id, randomUUID()), /open poll/i);
    await assert.rejects(() => responses.confirm(randomUUID()), /open poll/i);
    await assert.rejects(() => responses.markDraft(randomUUID()), /open poll/i);
    assert.equal(await database.client.pollResponse.count(), 0);
  });
});

function inTransaction(
  run: (context: {
    database: PrismaDatabase;
    probe: PrismaProbe;
    responses: ResponseService;
  }) => Promise<void>,
) {
  return inPrismaTransaction((context) =>
    run({
      ...context,
      responses: new ResponseService(context.database),
    }),
  );
}

async function persistedResponse(context: {
  database: PrismaDatabase;
  responses: ResponseService;
}) {
  const fixture = await responseFixture(context.database);
  const response = await context.responses.create(fixture.poll.id, fixture.participant.id, now);
  return { ...fixture, response };
}

function closePoll(database: PrismaDatabase, id: string) {
  return database.client.poll.update({ where: { id }, data: { status: 'CLOSED', closedAt: now } });
}

async function responseFixture(database: PrismaDatabase) {
  const group = await database.client.group.create({
    data: {
      id: randomUUID(),
      name: 'Response team',
      inviteCode: randomUUID(),
      timezone: 'UTC',
      createdAt: now,
    },
  });
  const participant = await database.client.participant.create({
    data: {
      id: randomUUID(),
      groupId: group.id,
      displayName: 'Alice',
      displayNameNormalized: 'alice',
      editTokenHash: randomBytes(32).toString('hex'),
      createdAt: now,
      updatedAt: now,
    },
  });
  const poll = await database.client.poll.create({
    data: {
      id: randomUUID(),
      groupId: group.id,
      sequenceNo: 1,
      title: 'Team meeting',
      startsOn: dateToPrisma('2026-10-06'),
      endsOn: dateToPrisma('2026-10-12'),
      dayStart: timeToPrisma('16:00'),
      dayEnd: timeToPrisma('23:00'),
      slotMinutes: 30,
      meetingDurationMinutes: 60,
      status: 'OPEN',
      createdAt: now,
      closedAt: null,
    },
  });
  return { group, participant, poll };
}
