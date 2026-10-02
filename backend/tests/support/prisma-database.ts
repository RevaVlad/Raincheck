import { after } from 'node:test';
import { loadConfig } from '#config/config';
import { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { PrismaProbe } from './prisma-probe.js';

const database = PrismaDatabase.create(loadConfig());
void after(() => database.close());
const ROLLBACK = Symbol('successful Prisma test rollback');

export interface PrismaTestContext {
  database: PrismaDatabase;
  probe: PrismaProbe;
}

export function sharedPrismaDatabase(): PrismaDatabase {
  return database;
}

export async function inPrismaTransaction(
  run: (context: PrismaTestContext) => Promise<void>,
): Promise<void> {
  try {
    await database.transaction(async (transaction) => {
      await run({ database: transaction, probe: new PrismaProbe(transaction) });
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}
