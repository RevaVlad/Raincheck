import type { Prisma } from '../../src/generated/prisma/client.js';
import { toResponse } from '#infrastructure/database/prisma-records';

export class PrismaProbe {
  constructor(private readonly database: Prisma.TransactionClient) {}

  async groupExists(id: string): Promise<boolean> {
    return (await this.database.group.count({ where: { id } })) > 0;
  }

  async participantToken(id: string): Promise<{ editTokenHash: string }> {
    return this.database.participant.findUniqueOrThrow({
      where: { id },
      select: { editTokenHash: true },
    });
  }

  async pollReference(id: string): Promise<{ basedOnPollId: string | null }> {
    return this.database.poll.findUniqueOrThrow({
      where: { id },
      select: { basedOnPollId: true },
    });
  }

  async responseState(id: string) {
    const record = await this.database.pollResponse.findUniqueOrThrow({ where: { id } });
    const { state, confirmedAt } = toResponse(record);
    return { state, confirmedAt };
  }

  async deletePoll(id: string): Promise<void> {
    await this.database.poll.delete({ where: { id } });
  }

  async deleteGroup(id: string): Promise<void> {
    await this.database.group.delete({ where: { id } });
  }
}
