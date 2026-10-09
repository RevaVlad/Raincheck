import { after } from 'node:test';
import { loadConfig } from '#config/config';
import { createPrismaClient, withTransaction } from '#infrastructure/database/prisma-database';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { PrismaProbe } from './prisma-probe.js';

const database = createPrismaClient(loadConfig());
void after(() => database.$disconnect());
const ROLLBACK = Symbol('successful Prisma test rollback');

export interface PrismaTestContext {
  database: Prisma.TransactionClient;
  probe: PrismaProbe;
}

export function sharedPrismaClient() {
  return database;
}

export async function inPrismaTransaction(
  run: (context: PrismaTestContext) => Promise<void>,
): Promise<void> {
  try {
    await withTransaction(database, async (transaction) => {
      await run({ database: transaction, probe: new PrismaProbe(transaction) });
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}
