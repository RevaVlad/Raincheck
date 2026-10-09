import { PrismaPg } from '@prisma/adapter-pg';
import type { Config } from '#config/config';
import { PrismaClient, type Prisma } from '../../generated/prisma/client.js';

const MAX_NATIVE_TIMER_DELAY_MS = 2_147_483_647;

export type PrismaConnection = Prisma.TransactionClient &
  Partial<Pick<PrismaClient, '$transaction'>>;

export function createPrismaClient(config: Config): PrismaClient {
  const adapter = new PrismaPg(
    { connectionString: config.databaseUrl },
    {
      onPoolError: (error) => console.error('PostgreSQL pool error:', error.message),
    },
  );
  return new PrismaClient({ adapter });
}

export async function isDatabaseAvailable(client: Prisma.TransactionClient): Promise<boolean> {
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export function withTransaction<T>(
  client: PrismaConnection,
  work: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction
    ? client.$transaction(work, {
        maxWait: MAX_NATIVE_TIMER_DELAY_MS,
        timeout: MAX_NATIVE_TIMER_DELAY_MS,
      })
    : work(client);
}
