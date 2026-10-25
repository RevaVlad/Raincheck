import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { listPolls, getPoll } from '#services/poll/poll.scenarios';
import { toPollDto } from './poll.mapper.js';
import { inviteCodeParams, pollParams } from '../common/params.schemas.js';
import type { InviteCodeParamsDto, PollParamsDto } from './poll.dto.js';

export function registerPollReadRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  app.get<{ Params: InviteCodeParamsDto }>(
    '/api/groups/:inviteCode/polls',
    { schema: { params: inviteCodeParams } },
    async (request) => ({
      polls: (await listPolls(database, request.params.inviteCode)).map((poll) => toPollDto(poll)),
    }),
  );

  app.get<{ Params: PollParamsDto }>(
    '/api/groups/:inviteCode/polls/:pollId',
    { schema: { params: pollParams } },
    async (request) => {
      const result = await getPoll(database, request.params.inviteCode, request.params.pollId);
      return { poll: toPollDto(result.poll), participantStates: result.participantStates };
    },
  );
}
