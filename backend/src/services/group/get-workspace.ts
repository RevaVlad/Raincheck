import type { Prisma } from '../../generated/prisma/client.js';
import { requireGroup } from '#services/access/require-group';
import { requireOptionalParticipant } from '#services/access/require-participant';
import { loadWorkspace } from '#infrastructure/database/queries/workspace.query';

export async function getWorkspace(
  database: Prisma.TransactionClient,
  inviteCode: string,
  token?: string,
) {
  const group = await requireGroup(database, inviteCode);
  const workspace = await loadWorkspace(database, group.id);
  const me = await requireOptionalParticipant(database, token, group.id);
  return { group, ...workspace, me };
}
