import { PrismaPg } from '@prisma/adapter-pg';
import type { Config } from '#config/config';
import { PrismaClient, type Prisma } from '../../generated/prisma/client.js';

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
    return this.root.$transaction((client) => work(new PrismaDatabase(this.root, client)));
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
