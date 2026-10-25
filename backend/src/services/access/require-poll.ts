import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '#services/errors';

export async function requirePoll(
  database: Prisma.TransactionClient,
  groupId: string,
  pollId: string,
) {
  const poll = await database.poll.findFirst({ where: { id: pollId, groupId } });
  if (!poll) throw new ApplicationError('POLL_NOT_FOUND', 'Poll not found');
  return poll;
}
