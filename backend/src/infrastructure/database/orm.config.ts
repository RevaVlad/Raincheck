import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';
import { loadConfig, type Config } from '#config/config';
import {
  GroupEntity,
  IntervalEntity,
  ParticipantEntity,
  PollEntity,
  ResponseEntity,
} from './entities/index.js';

export function createOrmOptions(config: Config) {
  return defineConfig({
    clientUrl: config.databaseUrl,
    entities: [GroupEntity, ParticipantEntity, PollEntity, ResponseEntity, IntervalEntity],
    extensions: [Migrator],
    migrations: {
      path: 'dist/infrastructure/database/migrations',
      pathTs: 'src/infrastructure/database/migrations',
      emit: 'ts',
      transactional: true,
      allOrNothing: true,
    },
  });
}

export default createOrmOptions(loadConfig());
