import { randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import type { GroupInput } from '#domain/group/group';
import { validateGroup } from '#domain/group/group.validation';
import { LIMITS } from '#shared/constants';

export class GroupService {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async findByInviteCode(inviteCode: string) {
    return this.db.group.findUnique({ where: { inviteCode } });
  }

  async create(input: GroupInput, now = new Date()) {
    const { name } = validateGroup(input);
    return this.db.group.create({
      data: {
        id: randomUUID(),
        name,
        inviteCode: randomBytes(LIMITS.TOKEN_BYTES).toString('base64url'),
        createdAt: now,
      },
    });
  }
}
