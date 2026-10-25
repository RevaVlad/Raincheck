import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { closePoll, createPoll } from '#services/poll/poll.scenarios';
import { pollsCreated } from '#infrastructure/metrics';
import { inviteCodeParams, pollParams } from '../common/params.schemas.js';
import { optionalParticipantTokenHeaders } from '../common/token.schemas.js';
import { toPollDto } from './poll.mapper.js';
import type {
  CreatePollRequest,
  OptionalParticipantTokenHeadersDto,
  PollParamsDto,
} from './poll.dto.js';
import { pollBodySchema } from './poll.schema.js';

export function registerPollWriteRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  app.post<CreatePollRequest>(
    '/api/groups/:inviteCode/polls',
    { schema: { params: inviteCodeParams, body: pollBodySchema } },
    async (request, reply) => {
      const poll = await createPoll(database, {
        inviteCode: request.params.inviteCode,
        token: request.headers['x-participant-token'],
        input: request.body,
      });
      pollsCreated.inc();

      return reply.code(201).send({ poll: toPollDto(poll) });
    },
  );

  app.post<{ Params: PollParamsDto; Headers: OptionalParticipantTokenHeadersDto }>(
    '/api/groups/:inviteCode/polls/:pollId/close',
    { schema: { params: pollParams, headers: optionalParticipantTokenHeaders } },
    async (request) => {
      const poll = await closePoll(database, {
        inviteCode: request.params.inviteCode,
        pollId: request.params.pollId,
        token: request.headers['x-participant-token'],
      });

      return { poll: toPollDto(poll) };
    },
  );
}
