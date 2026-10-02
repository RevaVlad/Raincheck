import { PrismaPg } from '@prisma/adapter-pg';
import type { Config } from '#config/config';
import { PrismaClient, type Prisma } from '../../generated/prisma/client.js';

/**
 * The baseline `Database.transaction` issued a raw `BEGIN`/`COMMIT` on a pooled client with
 * no client-side deadline, and node-pg's `pool.connect()` also waits indefinitely for a free
 * connection. Prisma requires numeric values, so "unbounded" is inexpressible and these must be
 * chosen deliberately rather than inherited from a silent default.
 *
 * 60s is roughly 12x the worst legitimate wait this codebase imposes on a blocked transaction:
 * the lock-sensitive concurrency fixtures poll for at most 5s (tests/support/concurrency.ts),
 * and the whole backend suite finishes in about 3s. The ceiling stays bounded so a real hang
 * fails loudly instead of pinning a pooled connection forever.
 *
 * Tasks 3-5 migrate the lock-sensitive operations into these transactions, and their writes can
 * legitimately wait on a row lock held by a concurrent session, so this budget must stay far
 * above any such wait. There is no retry framework by design: raising the ceiling is not a
 * substitute for doing less work inside the transaction.
 */
const TRANSACTION_MAX_WAIT_MS = 60_000;
const TRANSACTION_TIMEOUT_MS = 60_000;

export class PrismaDatabase {
  private constructor(
    private readonly root: PrismaClient,
    readonly client: Prisma.TransactionClient = root,
  ) {}

  static create(config: Config): PrismaDatabase {
    const adapter = new PrismaPg(
      { connectionString: config.databaseUrl },
      {
        onPoolError: (error) => console.error('PostgreSQL pool error:', error.message),
      },
    );
    return new PrismaDatabase(new PrismaClient({ adapter }));
  }

  async transaction<T>(work: (database: PrismaDatabase) => Promise<T>): Promise<T> {
    if (this.client !== this.root) return work(this);
    return this.root.$transaction((client) => work(new PrismaDatabase(this.root, client)), {
      maxWait: TRANSACTION_MAX_WAIT_MS,
      timeout: TRANSACTION_TIMEOUT_MS,
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.client === this.root) await this.root.$disconnect();
  }
}
