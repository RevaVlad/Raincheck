import { randomBytes, randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { Group, GroupInput } from '#domain/group/group';
import { validateGroup } from '#domain/group/group.validation';
import { GroupEntity } from '#infrastructure/database/entities/group.entity';
import { LIMITS, UTC_TIMEZONE } from '#shared/constants';

export interface GroupService {
  create(input: GroupInput, now?: Date): Promise<Group>;
}

export class MikroGroupService implements GroupService {
  constructor(private readonly em: EntityManager) {}

  async create(input: GroupInput, now = new Date()): Promise<Group> {
    const { name } = validateGroup(input);
    const group = this.em.create(GroupEntity, {
      id: randomUUID(),
      name,
      inviteCode: randomBytes(LIMITS.TOKEN_BYTES).toString('base64url'),
      timezone: UTC_TIMEZONE,
      createdAt: now,
    });
    this.em.persist(group);
    await this.em.flush();
    return toGroup(group);
  }
}

function toGroup(entity: GroupEntity): Group {
  return {
    id: entity.id,
    name: entity.name,
    inviteCode: entity.inviteCode,
    timezone: UTC_TIMEZONE,
    createdAt: entity.createdAt,
  };
}
