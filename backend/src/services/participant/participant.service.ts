import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Participant } from '#entities/participant';
import { validateDisplayName } from '#entities/participant.validation';
import { LIMITS } from '#shared/constants';

export async function createParticipant(
  db: PoolClient,
  groupId: string,
  displayNameInput: string,
  now = new Date(),
): Promise<{ participant: Participant; editToken: string }> {
  const displayName = validateDisplayName(displayNameInput);
  const editToken = randomBytes(LIMITS.TOKEN_BYTES).toString('base64url');
  const participant: Participant = {
    id: randomUUID(), groupId, displayName,
    displayNameNormalized: displayName.toLowerCase(),
    editTokenHash: createHash('sha256').update(editToken).digest('hex'),
    createdAt: now, updatedAt: now,
  };
  await db.query(
    `INSERT INTO participants
       (id, group_id, display_name, display_name_normalized, edit_token_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [participant.id, participant.groupId, participant.displayName,
      participant.displayNameNormalized, participant.editTokenHash,
      participant.createdAt, participant.updatedAt],
  );
  return { participant, editToken };
}
