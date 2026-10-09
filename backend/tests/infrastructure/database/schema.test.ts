import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sharedPrismaDatabase } from '../../support/prisma-database.js';

const database = sharedPrismaDatabase();

interface IndexRow {
  indexname: string;
}

interface ConstraintRow {
  conname: string;
}

const EXPECTED_INDEXES = [
  'participants_group_name_unique',
  'poll_responses_poll_participant_unique',
  'polls_one_open_per_group_idx',
] as const;
const EXPECTED_CONSTRAINTS = [
  'availability_interval_direction_valid',
  'participants_avatar_color_valid',
  'polls_based_on_same_group_fk',
] as const;

void test('database keeps the domain invariants after the Prisma migration', async () => {
  assert.deepEqual(await existingIndexNames(), [
    'participants_group_name_unique',
    'poll_responses_poll_participant_unique',
    'polls_one_open_per_group_idx',
  ]);
  assert.deepEqual(await existingConstraintNames(), [
    'availability_interval_direction_valid',
    'participants_avatar_color_valid',
    'polls_based_on_same_group_fk',
  ]);
});

async function existingIndexNames(): Promise<string[]> {
  const result = await database.client.$queryRaw<IndexRow[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ANY(${EXPECTED_INDEXES}::text[])
      ORDER BY indexname
    `;
  return result.map(({ indexname }) => indexname);
}

async function existingConstraintNames(): Promise<string[]> {
  const result = await database.client.$queryRaw<ConstraintRow[]>`
      SELECT conname
      FROM pg_constraint
      WHERE conname = ANY(${EXPECTED_CONSTRAINTS}::text[])
      ORDER BY conname
    `;
  return result.map(({ conname }) => conname);
}

const CHECK_NAMES = [
  'availability_interval_direction_valid',
  'availability_interval_kind_valid',
  'availability_interval_time_valid',
  'groups_name_not_blank',
  'participants_avatar_color_valid',
  'participants_name_not_blank',
  'poll_responses_confirmation_consistent',
  'poll_responses_state_valid',
  'polls_closed_at_consistent',
  'polls_dates_valid',
  'polls_day_window_valid',
  'polls_meeting_duration_valid',
  'polls_meeting_fits_day_window',
  'polls_sequence_positive',
  'polls_slot_minutes_valid',
  'polls_status_valid',
];

void test('Prisma migration installs every named CHECK and index', async () => {
  const checks = await database.client.$queryRaw<{ conname: string }[]>`
    SELECT conname FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace AND contype = 'c' ORDER BY conname
  `;
  assert.deepEqual(
    checks.map(({ conname }) => conname),
    CHECK_NAMES,
  );
  const indexes = await database.client.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations' ORDER BY indexname
  `;
  assert.deepEqual(
    indexes.map(({ indexname }) => indexname),
    [
      'availability_intervals_pkey',
      'availability_intervals_response_start_at_idx',
      'groups_invite_code_key',
      'groups_pkey',
      'participants_edit_token_hash_key',
      'participants_group_name_unique',
      'participants_pkey',
      'poll_responses_pkey',
      'poll_responses_poll_participant_unique',
      'poll_responses_poll_state_idx',
      'polls_group_created_idx',
      'polls_group_id_sequence_no_key',
      'polls_id_group_id_key',
      'polls_one_open_per_group_idx',
      'polls_pkey',
    ],
  );
});

void test('Prisma migration keeps cascades and column-subset SET NULL', async () => {
  const foreignKeys = await database.client.$queryRaw<{ conname: string; definition: string }[]>`
      SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace AND contype = 'f' ORDER BY conname
    `;
  assert.deepEqual(foreignKeys, [
    {
      conname: 'availability_intervals_response_id_fkey',
      definition: 'FOREIGN KEY (response_id) REFERENCES poll_responses(id) ON DELETE CASCADE',
    },
    {
      conname: 'participants_group_id_fkey',
      definition: 'FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE',
    },
    {
      conname: 'poll_responses_participant_id_fkey',
      definition: 'FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE',
    },
    {
      conname: 'poll_responses_poll_id_fkey',
      definition: 'FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE',
    },
    {
      conname: 'polls_based_on_same_group_fk',
      definition:
        'FOREIGN KEY (based_on_poll_id, group_id) REFERENCES polls(id, group_id)' +
        ' ON DELETE SET NULL (based_on_poll_id)',
    },
    {
      conname: 'polls_group_id_fkey',
      definition: 'FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE',
    },
  ]);
});

void test('Prisma migration keeps partial uniqueness and uses Prisma tracking', async () => {
  const index = await database.client.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
        AND indexname = 'polls_one_open_per_group_idx'
    `;
  assert.match(
    index[0]?.indexdef ?? '',
    new RegExp(
      'CREATE UNIQUE INDEX .* ON public.polls USING btree ' +
        "\\(group_id\\) WHERE \\(status = 'OPEN'::text\\)",
    ),
  );
  const tracking = await database.client.$queryRaw<
    { old: string | null; current: string | null }[]
  >`
      SELECT to_regclass('public.schema_migrations')::text AS old,
        to_regclass('public._prisma_migrations')::text AS current
    `;
  assert.deepEqual(tracking, [{ old: null, current: '_prisma_migrations' }]);
});

void test('Prisma migration preserves native column types without database defaults', async () => {
  const columns = await database.client.$queryRaw<
    {
      table_name: string;
      column_name: string;
      data_type: string;
      character_maximum_length: number | null;
      column_default: string | null;
    }[]
  >`
    SELECT table_name, column_name, data_type, character_maximum_length, column_default
    FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name <> '_prisma_migrations' ORDER BY table_name, ordinal_position
  `;
  const actual = columns.map((row) => {
    assert.equal(row.column_default, null, `${row.table_name}.${row.column_name}`);
    const length = row.character_maximum_length;
    const type = length === null ? row.data_type : `${row.data_type}(${length})`;
    return `${row.table_name}.${row.column_name}: ${type}`;
  });
  assert.deepEqual(actual.sort(), expectedColumns().sort());
});

const COLUMN_TYPES: Record<string, Record<string, string>> = {
  availability_intervals: {
    id: 'uuid',
    response_id: 'uuid',
    start_at: 'timestamp with time zone',
    end_at: 'timestamp with time zone',
    kind: 'text',
    preference_direction: 'text',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone',
  },
  groups: {
    id: 'uuid',
    name: 'character varying(120)',
    invite_code: 'character varying(64)',
    created_at: 'timestamp with time zone',
  },
  participants: {
    id: 'uuid',
    group_id: 'uuid',
    display_name: 'character varying(80)',
    display_name_normalized: 'character varying(80)',
    edit_token_hash: 'character(64)',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone',
    avatar_color: 'character varying(6)',
  },
  poll_responses: {
    id: 'uuid',
    poll_id: 'uuid',
    participant_id: 'uuid',
    state: 'text',
    confirmed_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone',
  },
  polls: {
    id: 'uuid',
    group_id: 'uuid',
    sequence_no: 'integer',
    title: 'character varying(160)',
    starts_on: 'date',
    ends_on: 'date',
    day_start: 'time without time zone',
    day_end: 'time without time zone',
    slot_minutes: 'smallint',
    meeting_duration_minutes: 'smallint',
    time_zone: 'character varying(64)',
    status: 'text',
    based_on_poll_id: 'uuid',
    created_at: 'timestamp with time zone',
    closed_at: 'timestamp with time zone',
  },
};

function expectedColumns(): string[] {
  return Object.entries(COLUMN_TYPES).flatMap(([table, fields]) =>
    Object.entries(fields).map(([column, type]) => `${table}.${column}: ${type}`),
  );
}
