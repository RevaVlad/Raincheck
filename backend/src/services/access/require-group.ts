import type { Prisma } from '../../generated/prisma/client.js';
import { GroupService } from '#services/group/group.service';
import { ApplicationError } from '#services/errors';

export async function requireGroup(database: Prisma.TransactionClient, inviteCode: string) {
  const group = await new GroupService(database).findByInviteCode(inviteCode);
  if (!group) throw new ApplicationError('GROUP_NOT_FOUND', 'Group not found');
  return group;
}
