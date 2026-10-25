import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { getResponse, getResponseDetails } from '#services/response/response.scenarios';
import { toResponseDto } from './response.mapper.js';
import { responseParams } from './response.schemas.js';
import type { ResponseRoute } from './response.types.js';
import { resolveResponseRequest } from './response-log-context.js';

export function registerResponseReadRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  app.get<ResponseRoute>(
    '/api/groups/:inviteCode/polls/:pollId/responses/me',
    { schema: { params: responseParams } },
    async (request) => {
      const context = await resolveResponseRequest(database, request);
      const response = await getResponse(database, context);
      const details = await getResponseDetails(database, response);
      return toResponseDto(details);
    },
  );
}
