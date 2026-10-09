import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupService } from '#services/group/group.service';
import { PollService } from '#services/poll/poll.service';
import { inPrismaTransaction } from '../../support/prisma-database.js';

const pollInput = {
  title: 'Team meeting',
  startsOn: '2026-10-06',
  endsOn: '2026-10-12',
  dayStart: '16:00',
  dayEnd: '23:00',
  timeZone: 'Europe/Berlin',
  slotMinutes: 30 as const,
  meetingDurationMinutes: 60,
};

const now = new Date('2026-10-01T12:00:00.000Z');

void test('ignores extra input metadata when creating a poll', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const groups = new GroupService(database);
    const polls = new PollService(database);
    const group = await groups.create({ name: 'Team' });
    const input = { ...pollInput, title: '  Team meeting  ', uiState: 'expanded' };
    const poll = await polls.create(group.id, 1, input, null, now);
    const saved = await database.poll.findUniqueOrThrow({ where: { id: poll.id } });
    assert.equal(poll.title, 'Team meeting');
    assert.equal(saved.title, 'Team meeting');
    assert.equal(poll.slotMinutes, 30);
    assert.equal(poll.meetingDurationMinutes, 60);
    assert.equal('uiState' in poll, false);
  });
});

void test('creates and closes a poll through its service contract', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const groups = new GroupService(database);
    const polls = new PollService(database);
    const group = await groups.create({ name: 'Team' });
    const poll = await polls.create(group.id, 1, pollInput, null, now);
    const closed = await polls.close(group.id, poll.id, now);
    assert.equal(poll.status, 'OPEN');
    assert.equal(poll.startsOn, '2026-10-06');
    assert.equal(poll.endsOn, '2026-10-12');
    assert.equal(poll.dayStart, '16:00');
    assert.equal(poll.dayEnd, '23:00');
    assert.equal(poll.createdAt.toISOString(), now.toISOString());
    assert.equal(closed.status, 'CLOSED');
    assert.ok(closed.closedAt);
    assert.equal(closed.closedAt.toISOString(), now.toISOString());
  });
});

void test('allows only one open poll per group', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const groups = new GroupService(database);
    const polls = new PollService(database);
    const group = await groups.create({ name: 'Team' });
    await polls.create(group.id, 1, pollInput);
    await assert.rejects(() => polls.create(group.id, 2, pollInput), { code: 'P2002' });
  });
});

void test('requires a previous poll from the same group', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const groups = new GroupService(database);
    const polls = new PollService(database);
    const first = await groups.create({ name: 'First' });
    const second = await groups.create({ name: 'Second' });
    const previous = await polls.create(first.id, 1, pollInput);
    await assert.rejects(() => polls.create(second.id, 1, pollInput, previous.id), {
      code: 'P2003',
    });
  });
});

void test(
  'rejects closing a poll that is already closed ' + 'without changing its timestamp',
  async () => {
    await inPrismaTransaction(async ({ database }) => {
      const groups = new GroupService(database);
      const polls = new PollService(database);
      const group = await groups.create({ name: 'Team' });
      const poll = await polls.create(group.id, 1, pollInput);
      await polls.close(group.id, poll.id, now);
      await assert.rejects(
        () => polls.close(group.id, poll.id, new Date('2026-10-02T12:00:00.000Z')),
        { message: 'Poll state conflict' },
      );
      const saved = await database.poll.findUniqueOrThrow({ where: { id: poll.id } });
      assert.equal(saved.closedAt?.toISOString(), now.toISOString());
    });
  },
);

void test('rejects closing a missing poll with the existing domain error', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const polls = new PollService(database);
    await assert.rejects(
      () =>
        polls.close('00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-000000000000'),
      { message: 'Poll not found' },
    );
  });
});

void test('clears a reference when its previous poll is deleted', async () => {
  await inPrismaTransaction(async ({ database, probe }) => {
    const groups = new GroupService(database);
    const polls = new PollService(database);
    const group = await groups.create({ name: 'Team' });
    const previous = await polls.create(group.id, 1, pollInput);
    await polls.close(group.id, previous.id);
    const current = await polls.create(group.id, 2, pollInput, previous.id);
    await probe.deletePoll(previous.id);
    const saved = await probe.pollReference(current.id);
    assert.equal(saved.basedOnPollId, null);
  });
});

void test('creates the first poll without closing an active one', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const group = await new GroupService(database).create({ name: 'First poll' });
    const polls = new PollService(database);

    const first = await polls.createNext(group.id, pollInput, now);
    assert.equal(first.sequenceNo, 1);
    assert.equal(first.status, 'OPEN');
    assert.equal(first.basedOnPollId, null);
    await assert.rejects(() => polls.createNext(group.id, pollInput, now), {
      message: 'Poll state conflict',
    });

    const stillOpen = await database.poll.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(stillOpen.status, 'OPEN');
    const closed = await polls.close(group.id, first.id, now);
    const next = await polls.createNext(group.id, pollInput, now);
    assert.equal(next.sequenceNo, 2);
    assert.equal(next.basedOnPollId, closed.id);
  });
});
