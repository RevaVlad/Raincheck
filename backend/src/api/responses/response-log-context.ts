import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { requireResponseContext, type ResponseContext } from '#services/response/response.context';
import type { ResponseRoute } from './response.types.js';

export async function resolveResponseRequest(
  database: Prisma.TransactionClient,
  request: FastifyRequest<ResponseRoute>,
): Promise<ResponseContext> {
  const context = await requireResponseContext(
    database,
    request.params.inviteCode,
    request.params.pollId,
    request.headers['x-participant-token'],
  );
  request.log = request.log.child({
    groupId: context.group.id,
    pollId: context.poll.id,
    participantId: context.participant.id,
  });
  return context;
}
