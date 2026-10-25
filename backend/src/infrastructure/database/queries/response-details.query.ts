import type { PollResponse } from '#domain/response/response';
import type { Prisma } from '../../../generated/prisma/client.js';
import { toInterval } from '../prisma-records.js';
import type { ResponseDetails } from '#services/response/response-details';

export async function loadResponseDetails(
  database: Prisma.TransactionClient,
  response: PollResponse,
): Promise<ResponseDetails> {
  const records = await database.availabilityInterval.findMany({
    where: { responseId: response.id },
    orderBy: [{ startAt: 'asc' }],
  });
  return { response, intervals: records.map(toInterval) };
}
