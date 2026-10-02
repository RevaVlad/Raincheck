import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import type { Config } from '#config/config';

types.setTypeParser(1082, (value) => value);

export class Database {
  private constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  static create(config: Config): Database {
    const pool = new Pool({ connectionString: config.databaseUrl });
    pool.on('error', (error) => console.error('PostgreSQL pool error:', error.message));
    return new Database(pool);
  }

  private scoped(client: PoolClient): Database {
    return new Database(this.pool, client);
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.client ? this.client.query<T>(text, values) : this.pool.query<T>(text, values);
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.query('select 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (!this.client) await this.pool.end();
  }

  async transaction<T>(work: (transaction: Database) => Promise<T>): Promise<T> {
    if (this.client) return work(this);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await work(this.scoped(client));
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}
