import type { Prisma } from '../../generated/prisma/client.js';
import type { Poll, PollInput } from '#domain/poll/poll';
import { findPollDetails } from '#infrastructure/database/queries/poll-details.query';
import { ApplicationError } from '#services/errors';
import { requireGroup } from '#services/access/require-group';
import { requireParticipant } from '#services/access/require-participant';
import { PollService } from './poll.service.js';

interface CreatePollInput {
  inviteCode: string;
  token: string | undefined;
  input: PollInput;
}
interface ClosePollInput {
  inviteCode: string;
  pollId: string;
  token: string | undefined;
}

export async function listPolls(
  database: Prisma.TransactionClient,
  inviteCode: string,
): Promise<Poll[]> {
  const group = await requireGroup(database, inviteCode);
  return new PollService(database).list(group.id);
}

export async function getPoll(
  database: Prisma.TransactionClient,
  inviteCode: string,
  pollId: string,
) {
  const group = await requireGroup(database, inviteCode);
  const details = await findPollDetails(database, group.id, pollId);
  if (!details) throw new ApplicationError('POLL_NOT_FOUND', 'Poll not found');
  return details;
}

export async function createPoll(database: Prisma.TransactionClient, input: CreatePollInput) {
  const group = await requireGroup(database, input.inviteCode);
  await requireParticipant(database, input.token, group.id);
  try {
    return await new PollService(database).createNext(group.id, input.input);
  } catch (error) {
    if (error instanceof RangeError) throw new ApplicationError('INVALID_SCHEDULE', error.message);
    if (
      (error instanceof Error && error.message === 'Poll state conflict') ||
      isUniqueError(error)
    ) {
      throw new ApplicationError('POLL_STATE_CONFLICT', 'Poll state conflict');
    }
    throw error;
  }
}

export async function closePoll(database: Prisma.TransactionClient, input: ClosePollInput) {
  const group = await requireGroup(database, input.inviteCode);
  await requireParticipant(database, input.token, group.id);
  try {
    return await new PollService(database).close(group.id, input.pollId);
  } catch (error) {
    if (error instanceof Error && error.message === 'Poll not found') {
      throw new ApplicationError('POLL_NOT_FOUND', error.message);
    }
    if (error instanceof Error && error.message === 'Poll state conflict') {
      throw new ApplicationError('POLL_STATE_CONFLICT', error.message);
    }
    throw error;
  }
}

function isUniqueError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
