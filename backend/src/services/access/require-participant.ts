import { createHash } from 'node:crypto';
import { ApplicationError } from '#services/errors';

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

export async function requireParticipant(
  database: ParticipantLookup,
  token: string | undefined,
  groupId: string,
): Promise<ParticipantRecord> {
  if (!token) throw new ApplicationError('UNAUTHORIZED', 'Participant token is required');
  const editTokenHash = createHash('sha256').update(token).digest('hex');
  const participant = await database.participant.findUnique({ where: { editTokenHash } });
  if (!participant || participant.groupId !== groupId) {
    throw new ApplicationError('UNAUTHORIZED', 'Invalid participant token');
  }
  return participant;
}

export async function requireOptionalParticipant(
  database: ParticipantLookup,
  token: string | undefined,
  groupId: string,
) {
  if (!token) return null;
  try {
    return await requireParticipant(database, token, groupId);
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'UNAUTHORIZED') return null;
    throw error;
  }
}
