import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { QueryResultRow } from 'pg';
import { loadConfig } from '#config/config';
import { Database } from '#infrastructure/database/database';

let database: Database;
void before(() => {
  database = Database.create(loadConfig());
});
void after(() => database.close());

interface IndexRow extends QueryResultRow {
  indexname: string;
}

interface ConstraintRow extends QueryResultRow {
  conname: string;
}

const EXPECTED_INDEXES = [
  'participants_group_name_unique',
  'poll_responses_poll_participant_unique',
  'polls_one_open_per_group_idx',
] as const;
const EXPECTED_CONSTRAINTS = [
  'availability_interval_direction_valid',
  'groups_timezone_utc',
  'polls_based_on_same_group_fk',
] as const;

void test('database keeps the domain invariants after the baseline migration', async () => {
  assert.deepEqual(await existingIndexNames(), [
    'participants_group_name_unique',
    'poll_responses_poll_participant_unique',
    'polls_one_open_per_group_idx',
  ]);
  assert.deepEqual(await existingConstraintNames(), [
    'availability_interval_direction_valid',
    'groups_timezone_utc',
    'polls_based_on_same_group_fk',
  ]);
});

async function existingIndexNames(): Promise<string[]> {
  const result = await database.query<IndexRow>(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ANY($1::text[])
      ORDER BY indexname
    `,
    [EXPECTED_INDEXES],
  );
  return result.rows.map(({ indexname }) => indexname);
}

async function existingConstraintNames(): Promise<string[]> {
  const result = await database.query<ConstraintRow>(
    `
      SELECT conname
      FROM pg_constraint
      WHERE conname = ANY($1::text[])
      ORDER BY conname
    `,
    [EXPECTED_CONSTRAINTS],
  );
  return result.rows.map(({ conname }) => conname);
}
