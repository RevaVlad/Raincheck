import type { IntervalInput } from '#domain/interval/interval';
import type { PollResponse } from '#domain/response/response';
import { loadResponseDetails } from '#infrastructure/database/queries/response-details.query';
import type { ResponseDetails } from './response-details.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '#services/errors';
import { IntervalService } from '#services/interval/interval.service';
import type { ResponseContext } from './response.context.js';
import { ResponseService } from './response.service.js';

export async function createDraft(
  database: Prisma.TransactionClient,
  context: ResponseContext,
): Promise<PollResponse> {
  try {
    return await new ResponseService(database).create(context.poll.id, context.participant.id);
  } catch (error) {
    if (isUnique(error))
      throw new ApplicationError('RESPONSE_ALREADY_EXISTS', 'Response already exists');
    throw mapClosedPollWrite(error);
  }
}

export async function getResponse(
  database: Prisma.TransactionClient,
  context: ResponseContext,
): Promise<PollResponse> {
  const response = await new ResponseService(database).findForParticipant(
    context.poll.id,
    context.participant.id,
  );
  if (!response) throw new ApplicationError('RESPONSE_NOT_FOUND', 'Response not found');
  return response;
}

export async function getResponseDetails(
  database: Prisma.TransactionClient,
  response: PollResponse,
): Promise<ResponseDetails> {
  return loadResponseDetails(database, response);
}

export async function replaceResponseIntervals(
  database: Prisma.TransactionClient,
  response: PollResponse,
  intervals: readonly IntervalInput[],
): Promise<void> {
  try {
    await new IntervalService(database).replace(response.id, intervals);
  } catch (error) {
    throw mapClosedPollWrite(error);
  }
}

export async function deleteResponse(
  database: Prisma.TransactionClient,
  context: ResponseContext,
): Promise<void> {
  let deleted: boolean;
  try {
    deleted = await new ResponseService(database).deleteForOpenPoll(
      context.poll.id,
      context.participant.id,
    );
  } catch (error) {
    throw mapClosedPollWrite(error);
  }

  if (!deleted) {
    throw mapClosedPollWrite(new ApplicationError('RESPONSE_NOT_FOUND', 'Response not found'));
  }
}

export async function confirmResponse(
  database: Prisma.TransactionClient,
  context: ResponseContext,
): Promise<PollResponse> {
  const current = await getResponse(database, context);
  try {
    return await new ResponseService(database).confirm(current.id);
  } catch (error) {
    throw mapClosedPollWrite(error);
  }
}

function isUnique(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function mapClosedPollWrite(error: unknown): never {
  if (error instanceof Error && error.message === 'Response requires an open poll') {
    throw new ApplicationError('POLL_STATE_CONFLICT', 'Poll state conflict');
  }
  throw error;
}
