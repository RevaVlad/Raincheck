import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Group, GroupInput } from '#entities/group';
import { validateGroupName } from '#entities/group.validation';
import { LIMITS, UTC_TIMEZONE } from '#shared/constants';

export async function createGroup(db: PoolClient, input: GroupInput, now = new Date()): Promise<Group> {
  const name = validateGroupName(input.name);
  const group: Group = {
    id: randomUUID(), name, timezone: UTC_TIMEZONE,
    inviteCode: randomBytes(LIMITS.TOKEN_BYTES).toString('base64url'),
    createdAt: now,
  };
  await db.query(
    `INSERT INTO groups (id, name, invite_code, timezone, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [group.id, group.name, group.inviteCode, group.timezone, group.createdAt],
  );
  return group;
}
