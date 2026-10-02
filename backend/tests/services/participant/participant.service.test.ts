import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { GroupService } from '#services/group/group.service';
import { ParticipantService } from '#services/participant/participant.service';
import { inPrismaTransaction } from '../../support/prisma-database.js';

void test('stores a normalized name and only the token hash', async () => {
  await inPrismaTransaction(async ({ database, probe }) => {
    const groups = new GroupService(database);
    const participants = new ParticipantService(database);
    const group = await groups.create({ name: 'Team' });
    const now = new Date('2026-10-01T12:00:00.000Z');
    const result = await participants.create(group.id, '  Alice   Smith ', now);
    const saved = await probe.participantToken(result.participant.id);
    assert.equal(result.participant.displayName, 'Alice Smith');
    assert.equal(result.participant.createdAt.toISOString(), now.toISOString());
    assert.equal(result.participant.updatedAt.toISOString(), now.toISOString());
    assert.match(result.editToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(saved.editTokenHash, createHash('sha256').update(result.editToken).digest('hex'));
    assert.ok(!JSON.stringify(result.participant).includes(result.editToken));
  });
});

void test('rejects duplicate normalized names in one group', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const groups = new GroupService(database);
    const participants = new ParticipantService(database);
    const group = await groups.create({ name: 'Team' });
    await participants.create(group.id, 'Alice');
    await assert.rejects(() => participants.create(group.id, ' ALICE '), { code: 'P2002' });
  });
});

void test('rejects a participant for a missing group', async () => {
  await inPrismaTransaction(async ({ database }) => {
    const participants = new ParticipantService(database);
    await assert.rejects(
      () => participants.create('00000000-0000-4000-8000-000000000000', 'Alice'),
      { code: 'P2003' },
    );
  });
});
