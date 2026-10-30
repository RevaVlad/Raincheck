import { createHash } from 'node:crypto';
import type { Prisma } from '../../src/generated/prisma/client.js';
import type { Poll } from '#domain/poll/poll';
import type { PollResponse } from '#domain/response/response';

export function routeFixtures() {
  const now = new Date('2026-10-01T10:00:00Z');
  const token = 't'.repeat(43);
  const group = { id: 'group-1', name: 'Team', inviteCode: 'a'.repeat(32), createdAt: now };
  const participant = {
    id: 'participant-1',
    groupId: group.id,
    displayName: 'Member',
    avatarColor: 'green' as const,
    editTokenHash: createHash('sha256').update(token).digest('hex'),
    createdAt: now,
    updatedAt: now,
  };
  const poll: Poll = {
    id: 'poll-1',
    groupId: group.id,
    sequenceNo: 1,
    title: 'Planning',
    startsOn: '2026-10-06',
    endsOn: '2026-10-12',
    dayStart: '16:00',
    dayEnd: '20:00',
    slotMinutes: 30,
    meetingDurationMinutes: 60,
    timeZone: 'UTC',
    status: 'OPEN',
    basedOnPollId: null,
    createdAt: now,
    closedAt: null,
  };
  const pollRecord = {
    ...poll,
    startsOn: new Date('2026-10-06'),
    endsOn: new Date('2026-10-12'),
    dayStart: new Date('1970-01-01T16:00:00Z'),
    dayEnd: new Date('1970-01-01T20:00:00Z'),
  };
  const response: PollResponse = {
    id: 'response-1',
    pollId: poll.id,
    participantId: participant.id,
    state: 'DRAFT',
    confirmedAt: null,
    updatedAt: now,
  };
  const database = {
    group: { findUnique: async () => group },
    participant: {
      findUnique: async ({ where }: { where: { editTokenHash: string } }) =>
        where.editTokenHash === participant.editTokenHash ? participant : null,
      findMany: async () => [{ ...participant, responses: [{ state: 'DRAFT' }] }],
    },
    poll: { findFirst: async () => pollRecord, findMany: async () => [pollRecord] },
    pollResponse: { findUnique: async () => response, findMany: async () => [] },
    availabilityInterval: { findMany: async () => [] },
  } as unknown as Prisma.TransactionClient;
  return { database, group, participant, poll, response, token, now };
}
