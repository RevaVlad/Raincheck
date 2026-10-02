import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Database } from '#infrastructure/database/database';
import ParticipantRepository from '#infrastructure/database/repositories/participant.repository';
import type { Participant } from '#domain/participant/participant';
import { validateParticipant } from '#domain/participant/participant.validation';
import { LIMITS } from '#shared/constants';
export interface CreatedParticipant {
  participant: Participant;
  editToken: string;
}

export class ParticipantService {
  constructor(private readonly db: Database) {}

  async create(
    groupId: string,
    displayName: string,
    now = new Date(),
  ): Promise<CreatedParticipant> {
    const name = validateParticipant(displayName);
    const editToken = randomBytes(LIMITS.TOKEN_BYTES).toString('base64url');
    const participant = await new ParticipantRepository(this.db).insert({
      id: randomUUID(),
      groupId,
      ...name,
      editTokenHash: createHash('sha256').update(editToken).digest('hex'),
      createdAt: now,
      updatedAt: now,
    });
    return { participant, editToken };
  }
}
