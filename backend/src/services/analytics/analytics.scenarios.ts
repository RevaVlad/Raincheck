import type { Prisma } from '../../generated/prisma/client.js';
import { requireGroup } from '#services/access/require-group';
import { requirePoll } from '#services/access/require-poll';
import { requireParticipant } from '#services/access/require-participant';
import { AnalyticsService } from './analytics.service.js';
import { validateViewerTimeZone } from './time-zone.js';

interface SuggestionsInput {
  inviteCode: string;
  pollId: string;
  token: string | undefined;
  timeZone: string;
}
interface ResultsInput {
  inviteCode: string;
  pollId: string;
  timeZone: string;
}

export async function getSuggestions(database: Prisma.TransactionClient, input: SuggestionsInput) {
  const timeZone = validateViewerTimeZone(input.timeZone);
  const group = await requireGroup(database, input.inviteCode);
  const poll = await requirePoll(database, group.id, input.pollId);
  const participant = await requireParticipant(database, input.token, group.id);
  return new AnalyticsService(database).suggestions(poll.id, participant.id, timeZone);
}

export async function getResults(database: Prisma.TransactionClient, input: ResultsInput) {
  const timeZone = validateViewerTimeZone(input.timeZone);
  const group = await requireGroup(database, input.inviteCode);
  const poll = await requirePoll(database, group.id, input.pollId);
  return new AnalyticsService(database).results(poll.id, group.id, timeZone);
}
