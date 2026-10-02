import type { FastifyInstance } from 'fastify';
import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { GroupService } from '#services/group/group.service';
import { ParticipantService } from '#services/participant/participant.service';
import { PollService } from '#services/poll/poll.service';
import { validatePoll } from '#domain/poll/poll.validation';
import { toPoll } from '#infrastructure/database/prisma-records';
import { AppError } from './errors.js';
import {
  inviteCodeParams,
  optionalParticipantTokenHeaders,
  participantTokenHeaders,
} from './schemas.js';
import { resolveParticipant } from './participant-identity.js';

const pollBody = {
  type: 'object',
  additionalProperties: false,
  required: ['startsOn', 'endsOn', 'dayStart', 'dayEnd', 'slotMinutes', 'meetingDurationMinutes'],
  properties: {
    title: { type: ['string', 'null'], maxLength: 160 },
    startsOn: { type: 'string' },
    endsOn: { type: 'string' },
    dayStart: { type: 'string' },
    dayEnd: { type: 'string' },
    slotMinutes: { type: 'integer', enum: [30, 60] },
    meetingDurationMinutes: { type: 'integer', minimum: 30, maximum: 240 },
  },
} as const;

const groupBody = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'creatorDisplayName', 'firstPoll'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    creatorDisplayName: { type: 'string', minLength: 1, maxLength: 80 },
    timezone: { type: 'string' },
    firstPoll: pollBody,
  },
} as const;
const participantBody = {
  type: 'object',
  additionalProperties: false,
  required: ['displayName'],
  properties: { displayName: { type: 'string', minLength: 1, maxLength: 80 } },
} as const;

const asCode = (params: unknown) => (params as { inviteCode: string }).inviteCode;
const asToken = (headers: unknown) =>
  (headers as Record<string, string | undefined>)['x-participant-token'];
function groupDto(group: { id: string; name: string; inviteCode: string; timezone: string }) {
  return { id: group.id, name: group.name, inviteCode: group.inviteCode, timezone: group.timezone };
}
function participantDto(participant: { id: string; displayName: string }) {
  return { id: participant.id, displayName: participant.displayName };
}
function pollDto(poll: ReturnType<typeof toPoll>) {
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
  database: PrismaDatabase,
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

// Keep the route table together so all group endpoints are visible in one place.
// eslint-disable-next-line max-lines-per-function
export function registerGroupRoutes(app: FastifyInstance, database: PrismaDatabase): void {
  app.post('/api/groups', { schema: { body: groupBody } }, async (request, reply) => {
    const body = request.body as {
      name: string;
      creatorDisplayName: string;
      timezone?: string;
      firstPoll: Parameters<PollService['create']>[2];
    };
    if (body.timezone !== undefined && body.timezone !== 'UTC')
      throw new AppError('INVALID_REQUEST', 400, 'Only UTC timezone is supported');
    try {
      validatePoll(1, body.firstPoll);
    } catch (error) {
      if (error instanceof RangeError) throw new AppError('INVALID_SCHEDULE', 422, error.message);
      throw error;
    }
    const created = await database.transaction(async (tx) => {
      const group = await new GroupService(tx).create({ name: body.name });
      const creator = await new ParticipantService(tx).create(group.id, body.creatorDisplayName);
      const currentPoll = await new PollService(tx).create(group.id, 1, body.firstPoll);
      return { group, creator, currentPoll };
    });
    return reply.code(201).send({
      group: groupDto(created.group),
      participant: participantDto(created.creator.participant),
      participantEditToken: created.creator.editToken,
      currentPoll: pollDto(created.currentPoll),
    });
  });

  app.get('/api/groups/:inviteCode', { schema: { params: inviteCodeParams } }, async (request) => {
    const group = await new GroupService(database).findByInviteCode(asCode(request.params));
    if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');
    const current = await database.client.poll.findFirst({
      where: { groupId: group.id, status: 'OPEN' },
    });
    return {
      group: { name: group.name, timezone: group.timezone },
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
        const participant = await new ParticipantService(database).rename(
          me.id,
          (request.body as { displayName: string }).displayName,
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
      const current = await database.client.poll.findFirst({
        where: { groupId: group.id, status: 'OPEN' },
      });
      const [polls, participants] = await Promise.all([
        database.client.poll.findMany({
          where: { groupId: group.id },
          orderBy: { createdAt: 'desc' },
        }),
        database.client.participant.findMany({
          where: { groupId: group.id },
          include: {
            responses: current ? { where: { pollId: current.id }, select: { state: true } } : false,
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
        currentPoll: current ? pollDto(toPoll(current)) : null,
      };
    },
  );
}
