import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { updateParticipant } from '#services/participant/participant.scenarios';
import { inviteCodeParams } from '../common/params.schemas.js';
import { participantBody } from './participant.schema.js';
import { participantTokenHeaders } from '../common/token.schemas.js';
import { toParticipantDto } from './participant.mapper.js';
import type { UpdateParticipantRequest } from './participant.dto.js';

export function registerUpdateParticipantEndpoint(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
) {
  app.patch<UpdateParticipantRequest>(
    '/api/groups/:inviteCode/participants/me',
    {
      schema: { params: inviteCodeParams, headers: participantTokenHeaders, body: participantBody },
    },
    async (request) => {
      const { participant } = await updateParticipant(database, {
        inviteCode: request.params.inviteCode,
        token: request.headers['x-participant-token'],
        ...request.body,
      });

      return { participant: toParticipantDto(participant) };
    },
  );
}
