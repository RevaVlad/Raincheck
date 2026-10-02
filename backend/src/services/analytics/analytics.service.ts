import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { toInterval, toPoll } from '#infrastructure/database/prisma-records';
import { buildSuggestions, calculateResults } from './analytics.js';

function hasSourcePoll<T extends { basedOnPollId: string | null }>(
  poll: T | null,
): poll is T & { basedOnPollId: string } {
  return poll !== null && poll.basedOnPollId !== null;
}

async function loadSuggestions(database: PrismaDatabase, pollId: string, participantId: string) {
  const poll = await database.client.poll.findUnique({ where: { id: pollId } });
  if (!hasSourcePoll(poll)) return [];
  const [source, current] = await Promise.all([
    database.client.pollResponse.findUnique({
      where: { pollId_participantId: { pollId: poll.basedOnPollId, participantId } },
      include: { intervals: true },
    }),
    database.client.pollResponse.findUnique({
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
  );
}

export class AnalyticsService {
  constructor(private readonly database: PrismaDatabase) {}

  async suggestions(pollId: string, participantId: string) {
    return loadSuggestions(this.database, pollId, participantId);
  }

  async results(pollId: string, groupId: string) {
    const [poll, total, responses] = await Promise.all([
      this.database.client.poll.findUniqueOrThrow({ where: { id: pollId } }),
      this.database.client.participant.count({ where: { groupId } }),
      this.database.client.pollResponse.findMany({
        where: { pollId, state: 'CONFIRMED' },
        include: { intervals: true },
      }),
    ]);
    return calculateResults(
      toPoll(poll),
      total,
      responses.map((response) => ({
        participantId: response.participantId,
        intervals: response.intervals.map(toInterval),
      })),
    );
  }
}
