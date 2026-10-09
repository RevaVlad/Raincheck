import { createHash } from 'node:crypto';
import { AppError } from './errors.js';

interface ParticipantRecord {
  id: string;
  groupId: string;
  displayName: string;
  avatarColor: string;
}

interface ParticipantLookup {
  participant: {
    findUnique(input: { where: { editTokenHash: string } }): Promise<ParticipantRecord | null>;
  };
}

export async function resolveParticipant(
  database: ParticipantLookup,
  token: string | undefined,
  groupId: string,
): Promise<ParticipantRecord> {
  if (!token) throw new AppError('UNAUTHORIZED', 401, 'Participant token is required');
  const editTokenHash = createHash('sha256').update(token).digest('hex');
  const participant = await database.participant.findUnique({ where: { editTokenHash } });
  if (!participant || participant.groupId !== groupId) {
    throw new AppError('UNAUTHORIZED', 401, 'Invalid participant token');
  }
  return participant;
}
