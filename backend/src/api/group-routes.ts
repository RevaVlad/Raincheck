import type { FastifyInstance } from 'fastify';
import { logEvent } from './log-event.js';
import type { Prisma } from '../generated/prisma/client.js';
import { GroupService } from '#services/group/group.service';
import { ParticipantService } from '#services/participant/participant.service';
import { AVATAR_COLORS } from '#domain/participant/participant';
import { validateAvatarColor } from '#domain/participant/participant.validation';
import { toPoll } from '#infrastructure/database/prisma-records';
import { pollSlots } from '#shared/time/time-zone';
import { AppError } from './errors.js';
import {
  inviteCodeParams,
  optionalParticipantTokenHeaders,
  participantTokenHeaders,
} from './schemas.js';
import { resolveParticipant } from './participant-identity.js';
import type {
  CreateGroupBodyDto,
  InviteCodeParamsDto,
  OptionalParticipantTokenHeadersDto,
  ParticipantProfileBodyDto,
  ParticipantTokenHeadersDto,
} from './request-dtos.js';

const groupBody = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
  },
} as const;

const participantBody = {
  type: 'object',
  additionalProperties: false,
  required: ['displayName', 'avatarColor'],
  properties: {
    displayName: { type: 'string', minLength: 1, maxLength: 80 },
    avatarColor: { type: 'string', enum: AVATAR_COLORS },
  },
} as const;

function groupDto(group: { id: string; name: string; inviteCode: string }) {
  return { id: group.id, name: group.name, inviteCode: group.inviteCode };
}

function participantDto(participant: { id: string; displayName: string; avatarColor: string }) {
  return {
    id: participant.id,
    displayName: participant.displayName,
    avatarColor: validateAvatarColor(participant.avatarColor),
  };
}

function pollDto(poll: ReturnType<typeof toPoll>, includeSlots = false) {
  return {
    id: poll.id,
    sequenceNo: poll.sequenceNo,
    title: poll.title,
    startsOn: poll.startsOn,
    endsOn: poll.endsOn,
    dayStart: poll.dayStart,
    dayEnd: poll.dayEnd,
    slotMinutes: poll.slotMinutes,
    meetingDurationMinutes: poll.meetingDurationMinutes,
    timeZone: poll.timeZone,
    ...(includeSlots ? { slots: pollSlots(poll) } : {}),
    status: poll.status,
    basedOnPollId: poll.basedOnPollId,
    createdAt: poll.createdAt.toISOString(),
    closedAt: poll.closedAt?.toISOString() ?? null,
  };
}

function isUniqueError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function mapParticipantWriteError(error: unknown): never {
  if (isUniqueError(error))
    throw new AppError(
      'PARTICIPANT_NAME_TAKEN',
      409,
      'Participant name is already used in this group',
    );
  throw error;
}

async function resolveOptionalParticipant(
  database: Prisma.TransactionClient,
  token: string | undefined,
  groupId: string,
) {
  if (!token) return null;
  try {
    return participantDto(await resolveParticipant(database, token, groupId));
  } catch (error) {
    if (error instanceof AppError && error.code === 'UNAUTHORIZED') return null;
    throw error;
  }
}

// eslint-disable-next-line max-lines-per-function
export function registerGroupRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  app.post<{ Body: CreateGroupBodyDto }>(
    '/api/groups',
    {
      schema: { body: groupBody },
      preValidation: async (request) => {
        const body = request.body;
        if (
          typeof body === 'object' &&
          body !== null &&
          Object.keys(body).some((key) => key !== 'name')
        ) {
          throw new AppError('INVALID_REQUEST', 400, 'Only the group name is accepted');
        }
      },
    },
    async (request, reply) => {
      const input = request.body;

      const group = await new GroupService(database).create(input);
      logEvent(request, 'group.created', { groupId: group.id });

      return reply.code(201).send({
        group: groupDto(group),
        currentPoll: null,
      });
    },
  );

  app.get<{ Params: InviteCodeParamsDto }>(
    '/api/groups/:inviteCode',
    { schema: { params: inviteCodeParams } },
    async (request) => {
      const group = await new GroupService(database).findByInviteCode(request.params.inviteCode);
      if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');

      const current = await database.poll.findFirst({
        where: { groupId: group.id, status: 'OPEN' },
      });

      return {
        group: { name: group.name },
        currentPoll: current
          ? {
              id: current.id,
              sequenceNo: current.sequenceNo,
              startsOn: current.startsOn.toISOString().slice(0, 10),
              endsOn: current.endsOn.toISOString().slice(0, 10),
            }
          : null,
      };
    },
  );

  app.post<{ Params: InviteCodeParamsDto; Body: ParticipantProfileBodyDto }>(
    '/api/groups/:inviteCode/participants',
    { schema: { params: inviteCodeParams, body: participantBody } },
    async (request, reply) => {
      const input = request.body;
      const group = await new GroupService(database).findByInviteCode(request.params.inviteCode);
      if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');

      const participant = await new ParticipantService(database)
        .create(group.id, input.displayName, input.avatarColor)
        .catch(mapParticipantWriteError);
      logEvent(request, 'participant.joined', {
        groupId: group.id,
        participantId: participant.participant.id,
      });

      return reply.code(201).send({
        participant: participantDto(participant.participant),
        participantEditToken: participant.editToken,
      });
    },
  );

  app.patch<{
    Params: InviteCodeParamsDto;
    Headers: ParticipantTokenHeadersDto;
    Body: ParticipantProfileBodyDto;
  }>(
    '/api/groups/:inviteCode/participants/me',
    {
      schema: { params: inviteCodeParams, headers: participantTokenHeaders, body: participantBody },
    },
    async (request) => {
      const input = request.body;
      const group = await new GroupService(database).findByInviteCode(request.params.inviteCode);
      if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');

      const me = await resolveParticipant(
        database,
        request.headers['x-participant-token'],
        group.id,
      );

      const participant = await new ParticipantService(database)
        .updateProfile(me.id, input.displayName, input.avatarColor)
        .catch(mapParticipantWriteError);
      logEvent(request, 'participant.profile_updated', {
        groupId: group.id,
        participantId: participant.id,
      });

      return { participant: participantDto(participant) };
    },
  );

  app.get<{ Params: InviteCodeParamsDto; Headers: OptionalParticipantTokenHeadersDto }>(
    '/api/groups/:inviteCode/workspace',
    { schema: { params: inviteCodeParams, headers: optionalParticipantTokenHeaders } },
    async (request) => {
      const group = await new GroupService(database).findByInviteCode(request.params.inviteCode);
      if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');

      const current = await database.poll.findFirst({
        where: { groupId: group.id, status: 'OPEN' },
      });

      const [polls, participants] = await Promise.all([
        database.poll.findMany({
          where: { groupId: group.id },
          orderBy: { createdAt: 'desc' },
        }),
        database.participant.findMany({
          where: { groupId: group.id },
          include: {
            responses: {
              where: current ? { pollId: current.id } : { pollId: { in: [] } },
              select: { state: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

      const token = request.headers['x-participant-token'];
      const me = await resolveOptionalParticipant(database, token, group.id);

      return {
        group: groupDto(group),
        me,
        participants: participants.map((participant) => ({
          ...participantDto(participant),
          currentPollState: participant.responses[0]?.state ?? 'NONE',
        })),
        polls: polls.map((poll) => pollDto(toPoll(poll))),
        currentPoll: current ? pollDto(toPoll(current), true) : null,
      };
    },
  );
}
