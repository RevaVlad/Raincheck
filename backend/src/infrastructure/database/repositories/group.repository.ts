import type { QueryResultRow } from 'pg';
import type { Group } from '#domain/group/group';
import type { Database } from '#infrastructure/database/database';
import { requiredRow } from './required-row.js';
import { UTC_TIMEZONE } from '#shared/constants';

interface GroupRow extends QueryResultRow {
  id: string;
  name: string;
  invite_code: string;
  created_at: Date;
}

const INSERT_GROUP = `
  INSERT INTO groups (id, name, invite_code, timezone, created_at)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING id, name, invite_code, created_at
`;

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    timezone: UTC_TIMEZONE,
    createdAt: row.created_at,
  };
}

export class GroupRepository {
  constructor(private readonly database: Database) {}

  async insert(value: Group): Promise<Group> {
    const result = await this.database.query<GroupRow>(INSERT_GROUP, [
      value.id,
      value.name,
      value.inviteCode,
      value.timezone,
      value.createdAt,
    ]);
    return toGroup(requiredRow(result, 'Group insert did not return a row'));
  }
}
