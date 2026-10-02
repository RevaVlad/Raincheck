import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

void test('baseline migration preserves named indexes and nullable poll references', async () => {
  const sql = await readFile(
    resolve(import.meta.dirname, '../../../src/infrastructure/database/migrations/001_initial.sql'),
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
