import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { participantsCreated } from '#infrastructure/metrics';
import { joinParticipant } from '#services/participant/participant.scenarios';
import { logEvent } from '../log-event.js';
import { inviteCodeParams } from '../common/params.schemas.js';
import { participantBody } from './participant.schema.js';
import { toJoinedParticipantDto } from './participant.mapper.js';
import type { JoinParticipantRequest } from './participant.dto.js';

export function registerJoinParticipantEndpoint(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
) {
  app.post<JoinParticipantRequest>(
    '/api/groups/:inviteCode/participants',
    { schema: { params: inviteCodeParams, body: participantBody } },
    async (request, reply) => {
      const { group, created } = await joinParticipant(database, {
        inviteCode: request.params.inviteCode,
        ...request.body,
      });
      participantsCreated.inc();
      logEvent(request, 'participant.joined', {
        groupId: group.id,
        participantId: created.participant.id,
      });
      return reply.code(201).send(toJoinedParticipantDto(created));
    },
  );
}
