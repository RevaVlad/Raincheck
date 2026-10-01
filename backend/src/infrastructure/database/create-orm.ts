import { MikroORM } from '@mikro-orm/postgresql';
import type { Config } from '#config/config';
import { createOrmOptions } from './orm.config.js';

export function createOrm(config: Config): Promise<MikroORM> {
  return MikroORM.init(createOrmOptions(config));
}
