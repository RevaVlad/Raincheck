import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { responsesCreated } from '#infrastructure/metrics';
import {
  createDraft,
  getResponse,
  getResponseDetails,
  replaceResponseIntervals,
} from '#services/response/response.scenarios';
import { toResponseDto } from './response.mapper.js';
import { responseParams, replaceIntervalsBody } from './response.schemas.js';
import type { ReplaceResponseRoute, ResponseRoute } from './response.types.js';
import { resolveResponseRequest } from './response-log-context.js';

export function registerResponseWriteRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  app.post<ResponseRoute>(
    '/api/groups/:inviteCode/polls/:pollId/responses/me',
    { schema: { params: responseParams } },
    async (request, reply) => {
      const context = await resolveResponseRequest(database, request);
      const response = await createDraft(database, context);
      responsesCreated.inc();

      const details = await getResponseDetails(database, response);
      return reply.code(201).send(toResponseDto(details));
    },
  );

  app.put<ReplaceResponseRoute>(
    '/api/groups/:inviteCode/polls/:pollId/responses/me',
    { schema: { params: responseParams, body: replaceIntervalsBody } },
    async (request) => {
      const context = await resolveResponseRequest(database, request);
      const response = await getResponse(database, context);
      await replaceResponseIntervals(database, response, request.body.intervals);

      const updated = await getResponse(database, context);
      return toResponseDto(await getResponseDetails(database, updated));
    },
  );
}
