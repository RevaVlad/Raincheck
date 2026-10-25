import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { getResults, getSuggestions } from '#services/analytics/analytics.scenarios';
import { pollParams } from '../common/params.schemas.js';
import type { OptionalParticipantTokenHeadersDto, PollParamsDto } from '../polls/poll.dto.js';
import { viewerTimeZoneSchema } from './analytics.schema.js';

type SuggestionsRequest = {
  Params: PollParamsDto;
  Headers: OptionalParticipantTokenHeadersDto;
  Querystring: { timeZone: string };
};
type ResultsRequest = { Params: PollParamsDto; Querystring: { timeZone: string } };

export function registerAnalyticsReadRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  app.get<SuggestionsRequest>(
    '/api/groups/:inviteCode/polls/:pollId/suggestions/me',
    { schema: { params: pollParams, querystring: viewerTimeZoneSchema } },
    async (request) => ({
      suggestions: await getSuggestions(database, {
        inviteCode: request.params.inviteCode,
        pollId: request.params.pollId,
        token: request.headers['x-participant-token'],
        timeZone: request.query.timeZone,
      }),
    }),
  );

  app.get<ResultsRequest>(
    '/api/groups/:inviteCode/polls/:pollId/results',
    { schema: { params: pollParams, querystring: viewerTimeZoneSchema } },
    async (request) =>
      getResults(database, {
        inviteCode: request.params.inviteCode,
        pollId: request.params.pollId,
        timeZone: request.query.timeZone,
      }),
  );
}
