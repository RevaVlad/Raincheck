import type { Prisma } from '../../generated/prisma/client.js';
import type { AvatarColor } from '#domain/participant/participant';
import { requireGroup } from '#services/access/require-group';
import { requireParticipant } from '#services/access/require-participant';
import { ApplicationError } from '#services/errors';
import { ParticipantService } from './participant.service.js';

function uniqueFailure(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
    throw new ApplicationError(
      'PARTICIPANT_NAME_TAKEN',
      'Participant name is already used in this group',
    );
  }
  throw error;
}

export async function joinParticipant(
  database: Prisma.TransactionClient,
  input: {
    inviteCode: string;
    displayName: string;
    avatarColor: AvatarColor;
  },
) {
  const group = await requireGroup(database, input.inviteCode);
  try {
    return {
      group,
      created: await new ParticipantService(database).create(
        group.id,
        input.displayName,
        input.avatarColor,
      ),
    };
  } catch (error) {
    return uniqueFailure(error);
  }
}

export async function updateParticipant(
  database: Prisma.TransactionClient,
  input: {
    inviteCode: string;
    token: string | undefined;
    displayName: string;
    avatarColor: AvatarColor;
  },
) {
  const group = await requireGroup(database, input.inviteCode);
  const me = await requireParticipant(database, input.token, group.id);
  try {
    return {
      group,
      participant: await new ParticipantService(database).updateProfile(
        me.id,
        input.displayName,
        input.avatarColor,
      ),
    };
  } catch (error) {
    return uniqueFailure(error);
  }
}
