import type { Prisma } from '../../generated/prisma/client.js';
import { requireGroup } from '#services/access/require-group';
import { requireParticipant } from '#services/access/require-participant';
import { requirePoll } from '#services/access/require-poll';

export type ResponseContext = {
  group: Awaited<ReturnType<typeof requireGroup>>;
  participant: Awaited<ReturnType<typeof requireParticipant>>;
  poll: Awaited<ReturnType<typeof requirePoll>>;
};

export async function requireResponseContext(
  database: Prisma.TransactionClient,
  inviteCode: string,
  pollId: string,
  token: string | undefined,
): Promise<ResponseContext> {
  const group = await requireGroup(database, inviteCode);
  const participant = await requireParticipant(database, token, group.id);
  const poll = await requirePoll(database, group.id, pollId);
  return { group, participant, poll };
}
