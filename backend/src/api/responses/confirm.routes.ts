import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { confirmResponse, getResponseDetails } from '#services/response/response.scenarios';
import { logEvent } from '../log-event.js';
import { toResponseDto } from './response.mapper.js';
import { responseParams } from './response.schemas.js';
import type { ResponseRoute } from './response.types.js';
import { resolveResponseRequest } from './response-log-context.js';

export function registerResponseConfirmRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  app.post<ResponseRoute>(
    '/api/groups/:inviteCode/polls/:pollId/responses/me/confirm',
    { schema: { params: responseParams } },
    async (request) => {
      const context = await resolveResponseRequest(database, request);
      const response = await confirmResponse(database, context);
      logEvent(request, 'response.confirmed', { responseId: response.id });
      return toResponseDto(await getResponseDetails(database, response));
    },
  );
}
