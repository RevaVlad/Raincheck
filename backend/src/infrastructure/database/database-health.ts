import type { MikroORM } from '@mikro-orm/postgresql';

export interface DatabaseHealth {
  isAvailable(): Promise<boolean>;
}

export class MikroDatabaseHealth implements DatabaseHealth {
  constructor(private readonly orm: MikroORM) {}

  async isAvailable(): Promise<boolean> {
    return (await this.orm.checkConnection()).ok;
  }
}
