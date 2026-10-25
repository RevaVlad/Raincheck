import type { Prisma } from '../../../generated/prisma/client.js';
import { toPoll } from '#infrastructure/database/prisma-records';

export async function findPollDetails(
  database: Prisma.TransactionClient,
  groupId: string,
  pollId: string,
) {
  const record = await database.poll.findFirst({ where: { id: pollId, groupId } });
  if (!record) return null;
  const poll = toPoll(record);
  const responses = await database.pollResponse.findMany({
    where: { pollId },
    include: { participant: { select: { id: true, displayName: true } } },
  });
  return {
    poll,
    participantStates: responses.map(({ participant, state }) => ({ participant, state })),
  };
}
