import type { Prisma } from '../../generated/prisma/client.js';
import { requireGroup } from '#services/access/require-group';
import { findCurrentPoll } from '#infrastructure/database/queries/workspace.query';

export async function getGroupPreview(database: Prisma.TransactionClient, inviteCode: string) {
  const group = await requireGroup(database, inviteCode);
  const currentPoll = await findCurrentPoll(database, group.id);
  return { group, currentPoll };
}
