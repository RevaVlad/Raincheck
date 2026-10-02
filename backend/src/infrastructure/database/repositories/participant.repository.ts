import type { QueryResultRow } from 'pg';
import type { Participant } from '#domain/participant/participant';
import type { Database } from '#infrastructure/database/database';
import { requiredRow } from './required-row.js';

interface ParticipantRow extends QueryResultRow {
  id: string;
  group_id: string;
  display_name: string;
  display_name_normalized: string;
  edit_token_hash: string;
  created_at: Date;
  updated_at: Date;
}

const INSERT_PARTICIPANT = `
  INSERT INTO participants (
    id,
    group_id,
    display_name,
    display_name_normalized,
    edit_token_hash,
    created_at,
    updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  RETURNING
    id,
    group_id,
    display_name,
    display_name_normalized,
    edit_token_hash,
    created_at,
    updated_at
`;

function toParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    groupId: row.group_id,
    displayName: row.display_name,
    displayNameNormalized: row.display_name_normalized,
    editTokenHash: row.edit_token_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default class ParticipantRepository {
  constructor(private readonly database: Database) {}

  async insert(value: Participant): Promise<Participant> {
    const result = await this.database.query<ParticipantRow>(INSERT_PARTICIPANT, [
      value.id,
      value.groupId,
      value.displayName,
      value.displayNameNormalized,
      value.editTokenHash,
      value.createdAt,
      value.updatedAt,
    ]);
    return toParticipant(requiredRow(result, 'Participant insert did not return a row'));
  }
}
