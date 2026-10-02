import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { toParticipant } from '#infrastructure/database/prisma-records';
import type { Participant } from '#domain/participant/participant';
import { validateParticipant } from '#domain/participant/participant.validation';
import { LIMITS } from '#shared/constants';
export interface CreatedParticipant {
  participant: Participant;
  editToken: string;
}

export class ParticipantService {
  constructor(private readonly db: PrismaDatabase) {}

  async rename(id: string, displayName: string, now = new Date()): Promise<Participant> {
    const name = validateParticipant(displayName);
    return toParticipant(await this.db.client.participant.update({
      where: { id },
      data: { ...name, updatedAt: now },
    }));
  }

  async create(
    groupId: string,
    displayName: string,
    now = new Date(),
  ): Promise<CreatedParticipant> {
    const name = validateParticipant(displayName);
    const editToken = randomBytes(LIMITS.TOKEN_BYTES).toString('base64url');
    const record = await this.db.client.participant.create({
      data: {
        id: randomUUID(),
        groupId,
        ...name,
        editTokenHash: createHash('sha256').update(editToken).digest('hex'),
        createdAt: now,
        updatedAt: now,
      },
    });
    const participant = toParticipant(record);
    return { participant, editToken };
  }
}
