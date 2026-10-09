import type { Prisma } from '../../generated/prisma/client.js';
import { toInterval, toPoll } from '#infrastructure/database/prisma-records';
import { buildSuggestions, calculateResults } from './analytics.js';

function hasSourcePoll<T extends { basedOnPollId: string | null }>(
  poll: T | null,
): poll is T & { basedOnPollId: string } {
  return poll !== null && poll.basedOnPollId !== null;
}

async function loadSuggestions(
  database: Prisma.TransactionClient,
  pollId: string,
  participantId: string,
  timeZone: string,
) {
  const poll = await database.poll.findUnique({ where: { id: pollId } });
  if (!hasSourcePoll(poll)) return [];
  const [source, current] = await Promise.all([
    database.pollResponse.findUnique({
      where: { pollId_participantId: { pollId: poll.basedOnPollId, participantId } },
      include: { intervals: true },
    }),
    database.pollResponse.findUnique({
      where: { pollId_participantId: { pollId, participantId } },
      include: { intervals: true },
    }),
  ]);
  if (!source || source.state !== 'CONFIRMED') return [];
  return buildSuggestions(
    toPoll(poll),
    poll.basedOnPollId,
    source.intervals.map(toInterval),
    current?.intervals.map(toInterval) ?? [],
    timeZone,
  );
}

export class AnalyticsService {
  constructor(private readonly database: Prisma.TransactionClient) {}

  async suggestions(pollId: string, participantId: string, timeZone: string) {
    return loadSuggestions(this.database, pollId, participantId, timeZone);
  }

  async results(pollId: string, groupId: string, timeZone: string) {
    const [poll, participants] = await Promise.all([
      this.database.poll.findUniqueOrThrow({ where: { id: pollId } }),
      this.database.participant.findMany({
        where: { groupId },
        include: {
          responses: {
            where: { pollId },
            include: { intervals: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const confirmedResponses = participants.flatMap((participant) =>
      participant.responses
        .filter((response) => response.state === 'CONFIRMED')
        .map((response) => ({
          participantId: participant.id,
          intervals: response.intervals.map(toInterval),
        })),
    );
    const results = calculateResults(toPoll(poll), participants.length, confirmedResponses);
    return {
      ...results,
      participants: participants.map((participant) => {
        const state = participant.responses[0]?.state;
        return {
          id: participant.id,
          displayName: participant.displayName,
          state: state === 'CONFIRMED' || state === 'DRAFT' ? state : 'NONE',
        };
      }),
    };
  }
}
