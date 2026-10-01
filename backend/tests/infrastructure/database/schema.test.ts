import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { MikroORM } from '@mikro-orm/postgresql';
import { loadConfig } from '#config/config';
import { createOrm } from '#infrastructure/database/create-orm';

let orm: MikroORM;

before(async () => {
  orm = await createOrm(loadConfig());
});

after(async () => {
  await orm.close(true);
});

test('database keeps the entity invariants after the ORM migration', async () => {
  const indexes = await orm.em.getConnection().execute<{ indexname: string }[]>(
    `select indexname from pg_indexes
      where schemaname = 'public'
        and indexname in (
          'polls_one_open_per_group_idx',
          'participants_group_name_unique',
          'poll_responses_poll_participant_unique'
        )`,
  );

  assert.deepEqual(
    indexes.map(({ indexname }) => indexname).sort(),
    [
      'participants_group_name_unique',
      'poll_responses_poll_participant_unique',
      'polls_one_open_per_group_idx',
    ],
  );

  const constraints = await orm.em.getConnection().execute<{ conname: string }[]>(
    `select conname from pg_constraint
      where conname in (
        'groups_timezone_utc',
        'polls_based_on_same_group_fk',
        'availability_interval_direction_valid'
      )`,
  );

  assert.deepEqual(
    constraints.map(({ conname }) => conname).sort(),
    [
      'availability_interval_direction_valid',
      'groups_timezone_utc',
      'polls_based_on_same_group_fk',
    ],
  );
});
