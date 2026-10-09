import { randomBytes, randomUUID } from 'node:crypto';
import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { toGroup } from '#infrastructure/database/prisma-records';
import type { Group, GroupInput } from '#domain/group/group';
import { validateGroup } from '#domain/group/group.validation';
import { LIMITS } from '#shared/constants';

export class GroupService {
  constructor(private readonly db: PrismaDatabase) {}

  async findByInviteCode(inviteCode: string): Promise<Group | null> {
    const record = await this.db.client.group.findUnique({ where: { inviteCode } });
    return record ? toGroup(record) : null;
  }

  async create(input: GroupInput, now = new Date()): Promise<Group> {
    const { name } = validateGroup(input);
    const record = await this.db.client.group.create({
      data: {
        id: randomUUID(),
        name,
        inviteCode: randomBytes(LIMITS.TOKEN_BYTES).toString('base64url'),
        createdAt: now,
      },
    });
    return toGroup(record);
  }
}
