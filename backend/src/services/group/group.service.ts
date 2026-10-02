import { randomBytes, randomUUID } from 'node:crypto';
import type { Database } from '#infrastructure/database/database';
import { GroupRepository } from '#infrastructure/database/repositories/group.repository';
import type { Group, GroupInput } from '#domain/group/group';
import { validateGroup } from '#domain/group/group.validation';
import { LIMITS, UTC_TIMEZONE } from '#shared/constants';

export class GroupService {
  constructor(private readonly db: Database) {}

  async create(input: GroupInput, now = new Date()): Promise<Group> {
    const { name } = validateGroup(input);
    return new GroupRepository(this.db).insert({
      id: randomUUID(),
      name,
      inviteCode: randomBytes(LIMITS.TOKEN_BYTES).toString('base64url'),
      timezone: UTC_TIMEZONE,
      createdAt: now,
    });
  }
}
