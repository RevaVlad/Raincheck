import { createHash, randomBytes, randomUUID } from 'node:crypto';

export interface Participant {
  id: string;
  groupId: string;
  displayName: string;
  displayNameNormalized: string;
  editTokenHash: string;
  createdAt: Date;
  updatedAt: Date;
}

function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function createParticipant(
  groupId: string,
  displayNameInput: string,
  now = new Date(),
): { participant: Participant; editToken: string } {
  const displayName = normalizeDisplayName(displayNameInput);
  if (Array.from(displayName).length < 1 || Array.from(displayName).length > 80) {
    throw new RangeError('Participant display name must contain 1 to 80 characters');
  }
  const editToken = randomBytes(32).toString('base64url');
  const participant: Participant = {
    id: randomUUID(),
    groupId,
    displayName,
    displayNameNormalized: displayName.toLowerCase(),
    editTokenHash: createHash('sha256').update(editToken).digest('hex'),
    createdAt: now,
    updatedAt: now,
  };
  return { participant, editToken };
}
