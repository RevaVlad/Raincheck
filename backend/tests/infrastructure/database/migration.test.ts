import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

void test('Prisma migration preserves named indexes and nullable poll references', async () => {
  const sql = await readFile(
    resolve(import.meta.dirname, '../../../prisma/migrations/20261002000000_initial/migration.sql'),
    'utf8',
  );
  assert.match(
    sql,
    /constraint participants_group_name_unique unique \(group_id, display_name_normalized\)/i,
  );
  assert.match(
    sql,
    /constraint poll_responses_poll_participant_unique unique \(poll_id, participant_id\)/i,
  );
  assert.match(
    sql,
    /foreign key \(based_on_poll_id, group_id\)[\s\S]*on delete set null \(based_on_poll_id\)/i,
  );
  const preferredDirection = new RegExp(
    [
      "kind = 'PREFERRED'",
      'and preference_direction is not null',
      'and preference_direction in',
    ].join('\\s+'),
    'i',
  );
  assert.match(sql, preferredDirection);
});

void test('Prisma migration creates all domain tables without legacy tracking', async () => {
  const prisma = await readFile(
    resolve(import.meta.dirname, '../../../prisma/migrations/20261002000000_initial/migration.sql'),
    'utf8',
  );
  for (const table of [
    'groups',
    'participants',
    'polls',
    'poll_responses',
    'availability_intervals',
  ]) {
    assert.match(prisma, new RegExp(`create table ${table} \\(`, 'i'));
  }
  assert.doesNotMatch(prisma, /schema_migrations/i);
});

void test('participant color migration backfills gray before enforcing the palette constraint', async () => {
  const sql = await readFile(
    resolve(
      import.meta.dirname,
      '../../../prisma/migrations/20261006000000_participant_avatar_color/migration.sql',
    ),
    'utf8',
  );
  const normalized = sql.replace(/\s+/gu, ' ');
  const addColumn = normalized.indexOf('ADD COLUMN "avatar_color" VARCHAR(6)');
  const backfill = normalized.indexOf('SET "avatar_color" = \'gray\'');
  const required = normalized.indexOf('ALTER COLUMN "avatar_color" SET NOT NULL');
  const constraint = normalized.indexOf('participants_avatar_color_valid');
  assert.ok(addColumn >= 0);
  assert.ok(backfill > addColumn);
  assert.ok(required > backfill);
  assert.ok(constraint > required);
  assert.match(
    normalized,
    /"avatar_color"\s+in\s+\(\s*'green', 'blue', 'purple', 'rose', 'yellow', 'gray'\s*\)/i,
  );
  assert.doesNotMatch(sql, /default\s+'?(green|gray)'?/i);
});
