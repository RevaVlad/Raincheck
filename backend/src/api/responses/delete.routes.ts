import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { deleteResponse } from '#services/response/response.scenarios';
import { responseParams } from './response.schemas.js';
import type { ResponseRoute } from './response.types.js';
import { resolveResponseRequest } from './response-log-context.js';

export function registerResponseDeleteRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  app.delete<ResponseRoute>(
    '/api/groups/:inviteCode/polls/:pollId/responses/me',
    { schema: { params: responseParams } },
    async (request, reply) => {
      const context = await resolveResponseRequest(database, request);
      await deleteResponse(database, context);

      return reply.code(204).send();
    },
  );
}
