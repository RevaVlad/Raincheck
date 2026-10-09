import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../generated/prisma/client.js';
import { GroupService } from '#services/group/group.service';
import { ParticipantService } from '#services/participant/participant.service';
import { AVATAR_COLORS, type AvatarColor } from '#domain/participant/participant';
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

const asCode = (params: unknown) => (params as { inviteCode: string }).inviteCode;
const asToken = (headers: unknown) =>
  (headers as Record<string, string | undefined>)['x-participant-token'];
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

function throwParticipantNameConflict(error: unknown): void {
  if (isUniqueError(error))
    throw new AppError(
      'PARTICIPANT_NAME_TAKEN',
      409,
      'Participant name is already used in this group',
    );
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
  app.post(
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
      const group = await new GroupService(database).create({
        name: (request.body as { name: string }).name,
      });
      return reply.code(201).send({
        group: groupDto(group),
        currentPoll: null,
      });
    },
  );

  app.get('/api/groups/:inviteCode', { schema: { params: inviteCodeParams } }, async (request) => {
    const group = await new GroupService(database).findByInviteCode(asCode(request.params));
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
  });

  app.post(
    '/api/groups/:inviteCode/participants',
    { schema: { params: inviteCodeParams, body: participantBody } },
    async (request, reply) => {
      const group = await new GroupService(database).findByInviteCode(asCode(request.params));
      if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');
      try {
        const participant = await new ParticipantService(database).create(
          group.id,
          (request.body as { displayName: string }).displayName,
          (request.body as { avatarColor: AvatarColor }).avatarColor,
        );
        return reply.code(201).send({
          participant: participantDto(participant.participant),
          participantEditToken: participant.editToken,
        });
      } catch (error) {
        throwParticipantNameConflict(error);
        throw error;
      }
    },
  );

  app.patch(
    '/api/groups/:inviteCode/participants/me',
    {
      schema: { params: inviteCodeParams, headers: participantTokenHeaders, body: participantBody },
    },
    async (request) => {
      const group = await new GroupService(database).findByInviteCode(asCode(request.params));
      if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');
      const me = await resolveParticipant(database, asToken(request.headers), group.id);
      try {
        const participant = await new ParticipantService(database).updateProfile(
          me.id,
          (request.body as { displayName: string }).displayName,
          (request.body as { avatarColor: AvatarColor }).avatarColor,
        );
        return { participant: participantDto(participant) };
      } catch (error) {
        throwParticipantNameConflict(error);
        throw error;
      }
    },
  );

  app.get(
    '/api/groups/:inviteCode/workspace',
    { schema: { params: inviteCodeParams, headers: optionalParticipantTokenHeaders } },
    async (request) => {
      const group = await new GroupService(database).findByInviteCode(asCode(request.params));
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
      const token = asToken(request.headers);
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
