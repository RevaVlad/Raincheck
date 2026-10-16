import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '../generated/prisma/client.js';
import { toInterval } from '#infrastructure/database/prisma-records';
import { GroupService } from '#services/group/group.service';
import { IntervalService } from '#services/interval/interval.service';
import { ResponseService } from '#services/response/response.service';
import { AppError } from './errors.js';
import { logEvent } from './log-event.js';
import { resolveParticipant } from './participant-identity.js';
import type {
  OptionalParticipantTokenHeadersDto,
  PollParamsDto,
  ReplaceIntervalsBodyDto,
} from './request-dtos.js';

const params = {
  type: 'object',
  additionalProperties: false,
  required: ['inviteCode', 'pollId'],
  properties: {
    inviteCode: { type: 'string', minLength: 32, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' },
    pollId: { type: 'string' },
  },
} as const;

const intervals = {
  type: 'object',
  additionalProperties: false,
  required: ['intervals'],
  properties: {
    intervals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['startAt', 'endAt', 'kind', 'preferenceDirection'],
        properties: {
          startAt: { type: 'string', format: 'date-time', pattern: 'Z$' },
          endAt: { type: 'string', format: 'date-time', pattern: 'Z$' },
          kind: { type: 'string', enum: ['UNAVAILABLE', 'IF_NEEDED', 'PREFERRED'] },
          preferenceDirection: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;

function mapClosedPollWrite(error: unknown): never {
  if (error instanceof Error && error.message === 'Response requires an open poll')
    throw new AppError('POLL_STATE_CONFLICT', 409, 'Poll state conflict');
  throw error;
}

function mapResponseCreationError(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
    throw new AppError('RESPONSE_ALREADY_EXISTS', 409, 'Response already exists');
  return mapClosedPollWrite(error);
}

// Keep the route table together so all response endpoints are visible in one place.
// eslint-disable-next-line max-lines-per-function
export function registerResponseRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  const context = async (
    request: FastifyRequest<{ Params: PollParamsDto; Headers: OptionalParticipantTokenHeadersDto }>,
  ) => {
    const { inviteCode, pollId } = request.params;
    const token = request.headers['x-participant-token'];

    const group = await new GroupService(database).findByInviteCode(inviteCode);
    if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');

    const me = await resolveParticipant(database, token, group.id);

    const poll = await database.poll.findFirst({
      where: { id: pollId, groupId: group.id },
    });
    if (!poll) throw new AppError('POLL_NOT_FOUND', 404, 'Poll not found');

    request.log = request.log.child({ groupId: group.id, pollId: poll.id, participantId: me.id });
    return { inviteCode, pollId, token, me, poll };
  };

  const dto = async (response: { id: string; state: string; confirmedAt: Date | null }) => {
    const intervals = await database.availabilityInterval.findMany({
      where: { responseId: response.id },
      orderBy: [{ startAt: 'asc' }],
    });

    return {
      id: response.id,
      state: response.state,
      confirmedAt: response.confirmedAt?.toISOString() ?? null,
      intervals: intervals.map(toInterval),
    };
  };

  app.post<{ Params: PollParamsDto; Headers: OptionalParticipantTokenHeadersDto }>(
    '/api/groups/:inviteCode/polls/:pollId/responses/me',
    { schema: { params } },
    async (request, reply) => {
      const { pollId, me } = await context(request);

      const response = await new ResponseService(database)
        .create(pollId, me.id)
        .catch(mapResponseCreationError);
      logEvent(request, 'response.created', { responseId: response.id });

      return reply.code(201).send(await dto(response));
    },
  );

  app.get<{ Params: PollParamsDto; Headers: OptionalParticipantTokenHeadersDto }>(
    '/api/groups/:inviteCode/polls/:pollId/responses/me',
    { schema: { params } },
    async (request) => {
      const { pollId, me } = await context(request);

      const response = await new ResponseService(database).findForParticipant(pollId, me.id);
      if (!response) throw new AppError('RESPONSE_NOT_FOUND', 404, 'Response not found');

      return dto(response);
    },
  );

  app.put<{
    Params: PollParamsDto;
    Headers: OptionalParticipantTokenHeadersDto;
    Body: ReplaceIntervalsBodyDto;
  }>(
    '/api/groups/:inviteCode/polls/:pollId/responses/me',
    { schema: { params, body: intervals } },
    async (request) => {
      const { pollId, me } = await context(request);
      const intervals = request.body.intervals;
      const response = await new ResponseService(database).findForParticipant(pollId, me.id);
      if (!response) throw new AppError('RESPONSE_NOT_FOUND', 404, 'Response not found');

      await new IntervalService(database).replace(response.id, intervals).catch(mapClosedPollWrite);
      logEvent(request, 'response.intervals_saved', {
        responseId: response.id,
        intervalCount: intervals.length,
      });

      const updated = await new ResponseService(database).findForParticipant(pollId, me.id);
      if (!updated) throw new AppError('RESPONSE_NOT_FOUND', 404, 'Response not found');

      return dto(updated);
    },
  );

  app.delete<{ Params: PollParamsDto; Headers: OptionalParticipantTokenHeadersDto }>(
    '/api/groups/:inviteCode/polls/:pollId/responses/me',
    { schema: { params } },
    async (request, reply) => {
      const { pollId, me } = await context(request);

      const deleted = await new ResponseService(database)
        .deleteForOpenPoll(pollId, me.id)
        .catch(mapClosedPollWrite);
      if (!deleted) throw new AppError('RESPONSE_NOT_FOUND', 404, 'Response not found');
      logEvent(request, 'response.deleted');

      return reply.code(204).send();
    },
  );

  app.post<{ Params: PollParamsDto; Headers: OptionalParticipantTokenHeadersDto }>(
    '/api/groups/:inviteCode/polls/:pollId/responses/me/confirm',
    { schema: { params } },
    async (request) => {
      const { pollId, me } = await context(request);
      const response = await new ResponseService(database).findForParticipant(pollId, me.id);
      if (!response) throw new AppError('RESPONSE_NOT_FOUND', 404, 'Response not found');

      const confirmed = await new ResponseService(database)
        .confirm(response.id)
        .catch(mapClosedPollWrite);
      logEvent(request, 'response.confirmed', { responseId: confirmed.id });

      return dto(confirmed);
    },
  );
}
