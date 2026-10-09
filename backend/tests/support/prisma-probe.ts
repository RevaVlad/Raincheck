import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { toResponse } from '#infrastructure/database/prisma-records';

export class PrismaProbe {
  constructor(private readonly database: PrismaDatabase) {}

  async groupExists(id: string): Promise<boolean> {
    return (await this.database.client.group.count({ where: { id } })) > 0;
  }

  async participantToken(id: string): Promise<{ editTokenHash: string }> {
    return this.database.client.participant.findUniqueOrThrow({
      where: { id },
      select: { editTokenHash: true },
    });
  }

  async pollReference(id: string): Promise<{ basedOnPollId: string | null }> {
    return this.database.client.poll.findUniqueOrThrow({
      where: { id },
      select: { basedOnPollId: true },
    });
  }

  async responseState(id: string) {
    const record = await this.database.client.pollResponse.findUniqueOrThrow({ where: { id } });
    const { state, confirmedAt } = toResponse(record);
    return { state, confirmedAt };
  }

  async deletePoll(id: string): Promise<void> {
    await this.database.client.poll.delete({ where: { id } });
  }

  async deleteGroup(id: string): Promise<void> {
    await this.database.client.group.delete({ where: { id } });
  }
}
