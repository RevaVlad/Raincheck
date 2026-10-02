import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { toPoll, toResponse } from '#infrastructure/database/prisma-records';

export async function lockResponseContext(database: PrismaDatabase, responseId: string) {
  const rows = await database.client.$queryRaw<{ id: string }[]>`
    SELECT response.id
    FROM poll_responses AS response
    JOIN polls AS poll ON poll.id = response.poll_id
    WHERE response.id = ${responseId}::uuid
    FOR UPDATE OF response, poll
  `;
  if (!rows[0]) throw new Error('Response not found');
  const record = await database.client.pollResponse.findUniqueOrThrow({
    where: { id: responseId },
    include: { poll: true },
  });
  const { poll, ...response } = record;
  return { response: toResponse(response), poll: toPoll(poll) };
}
