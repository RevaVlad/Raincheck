import type { Prisma } from '../../../generated/prisma/client.js';
import { toPoll } from '#infrastructure/database/prisma-records';

export function findCurrentPoll(database: Prisma.TransactionClient, groupId: string) {
  return database.poll.findFirst({ where: { groupId, status: 'OPEN' } });
}

export async function loadWorkspace(database: Prisma.TransactionClient, groupId: string) {
  const current = await findCurrentPoll(database, groupId);
  const [pollRecords, participants] = await Promise.all([
    database.poll.findMany({ where: { groupId }, orderBy: { createdAt: 'desc' } }),
    database.participant.findMany({
      where: { groupId },
      include: {
        responses: {
          where: current ? { pollId: current.id } : { pollId: { in: [] } },
          select: { state: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return {
    currentPoll: current ? toPoll(current) : null,
    polls: pollRecords.map(toPoll),
    participants: participants.map(({ id, displayName, avatarColor, responses }) => ({
      id,
      displayName,
      avatarColor,
      currentPollState: responses[0]?.state ?? 'NONE',
    })),
  };
}
