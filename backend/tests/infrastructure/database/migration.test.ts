import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';

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

void test('fills gray before enforcing the participant color palette', async () => {
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

void test('converts legacy UTC date/time bounds to exact timestamps', async () => {
  const sql = await readFile(
    resolve(
      import.meta.dirname,
      '../../../prisma/migrations/20261008000000_poll_timezone_utc_intervals/migration.sql',
    ),
    'utf8',
  );
  assert.match(sql, /ADD COLUMN "time_zone" VARCHAR\(64\)/i);
  assert.match(sql, /SET\s+"time_zone"\s*=\s*'UTC'/i);
  assert.match(sql, /\("local_date"\s*\+\s*"start_time"\)\s+AT TIME ZONE 'UTC'/i);
  assert.match(sql, /\("local_date"\s*\+\s*"end_time"\)\s+AT TIME ZONE 'UTC'/i);
  assert.match(sql, /DROP COLUMN "timezone"/i);
  assert.match(sql, /DROP COLUMN "local_date"/i);
  assert.match(sql, /DROP COLUMN "start_time"/i);
  assert.match(sql, /DROP COLUMN "end_time"/i);
});

void test(
  'migrates existing responses in an isolated schema without changing their UTC moments',
  { skip: process.env['DATABASE_URL'] ? false : 'DATABASE_URL is not configured' },
  async () => {
    const client = new Client({ connectionString: process.env['DATABASE_URL'] });
    const schema = `migration_test_${randomUUID().replaceAll('-', '')}`;
    const migrationDirectory = resolve(import.meta.dirname, '../../../prisma/migrations');
    let connected = false;
    try {
      await client.connect();
      connected = true;
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      for (const filename of [
        '20261002000000_initial/migration.sql',
        '20261006000000_participant_avatar_color/migration.sql',
      ]) {
        await client.query(await readFile(resolve(migrationDirectory, filename), 'utf8'));
      }

      await client.query('BEGIN');
      await client.query(
        `INSERT INTO groups (id, name, invite_code, timezone, created_at)
         VALUES ('00000000-0000-4000-8000-000000000001', 'Team', 'migration-test', 'UTC', now())`,
      );
      await client.query(
        `INSERT INTO participants
           (id, group_id, display_name, display_name_normalized,
            edit_token_hash, avatar_color, created_at, updated_at)
         VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
           'Alice', 'alice', repeat('a', 64), 'gray', now(), now())`,
      );
      await client.query(
        `INSERT INTO polls
           (id, group_id, sequence_no, starts_on, ends_on, day_start, day_end, slot_minutes,
            meeting_duration_minutes, status, created_at)
         VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001',
           1, '2026-10-08', '2026-10-08', '23:00', '24:00', 30, 30, 'OPEN', now())`,
      );
      await client.query(
        `INSERT INTO poll_responses
           (id, poll_id, participant_id, state, confirmed_at, updated_at)
         VALUES ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003',
           '00000000-0000-4000-8000-000000000002', 'CONFIRMED', now(), now())`,
      );
      await client.query(
        `INSERT INTO availability_intervals
           (id, response_id, local_date, start_time, end_time, kind,
            preference_direction, created_at, updated_at)
         VALUES ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000004',
           '2026-10-08', '23:30', '24:00', 'PREFERRED', 'FLAT', now(), now())`,
      );

      await client.query(
        await readFile(
          resolve(migrationDirectory, '20261008000000_poll_timezone_utc_intervals/migration.sql'),
          'utf8',
        ),
      );
      const migrated = await client.query(
        `SELECT p.time_zone, r.state, i.start_at, i.end_at,
           (SELECT count(*) FROM poll_responses WHERE state = 'CONFIRMED') AS confirmed_count,
           (SELECT count(*) FROM availability_intervals) AS interval_count
         FROM polls p JOIN poll_responses r ON r.poll_id = p.id
         JOIN availability_intervals i ON i.response_id = r.id`,
      );
      assert.deepEqual(migrated.rows[0], {
        time_zone: 'UTC',
        state: 'CONFIRMED',
        start_at: new Date('2026-10-08T23:30:00.000Z'),
        end_at: new Date('2026-10-09T00:00:00.000Z'),
        confirmed_count: '1',
        interval_count: '1',
      });
      const oldColumns = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND ((table_name = 'groups' AND column_name = 'timezone')
           OR (table_name = 'availability_intervals'
             AND column_name IN ('local_date', 'start_time', 'end_time')))
         ORDER BY column_name`,
        [schema],
      );
      assert.deepEqual(oldColumns.rows, []);
      await client.query('ROLLBACK');
    } finally {
      if (connected) {
        await client.query('ROLLBACK').catch(() => undefined);
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
      if (connected) await client.end();
    }
  },
);
