import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { Participant } from '#domain/participant/participant';
import { validateParticipant } from '#domain/participant/participant.validation';
import { GroupEntity } from '#infrastructure/database/entities/group.entity';
import { ParticipantEntity } from '#infrastructure/database/entities/participant.entity';
import { LIMITS } from '#shared/constants';

export interface CreatedParticipant {
  participant: Participant;
  editToken: string;
}

export interface ParticipantService {
  create(groupId: string, displayName: string, now?: Date): Promise<CreatedParticipant>;
}

export class MikroParticipantService implements ParticipantService {
  constructor(private readonly em: EntityManager) {}

  async create(groupId: string, nameInput: string, now = new Date()): Promise<CreatedParticipant> {
    const name = validateParticipant(nameInput);
    const editToken = randomBytes(LIMITS.TOKEN_BYTES).toString('base64url');
    const participant = this.em.create(ParticipantEntity, {
      id: randomUUID(),
      group: this.em.getReference(GroupEntity, groupId),
      ...name,
      editTokenHash: createHash('sha256').update(editToken).digest('hex'),
      createdAt: now,
      updatedAt: now,
    });
    this.em.persist(participant);
    await this.em.flush();
    return { participant: toParticipant(participant), editToken };
  }
}

function toParticipant(entity: ParticipantEntity): Participant {
  return {
    id: entity.id,
    groupId: entity.group.id,
    displayName: entity.displayName,
    displayNameNormalized: entity.displayNameNormalized,
    editTokenHash: entity.editTokenHash,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
