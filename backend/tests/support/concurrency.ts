import { Client, type QueryResultRow } from 'pg';
import { loadConfig } from '#config/config';

const RESPONSE_INSERT_LOCK = 908_177;
const RESPONSE_UPDATE_LOCK = RESPONSE_INSERT_LOCK + 1;
const INSTALL_RESPONSE_INSERT_BLOCK = `
  CREATE TABLE IF NOT EXISTS test_response_insert_blocks (
    participant_id uuid PRIMARY KEY,
    lock_key bigint NOT NULL
  );

  CREATE OR REPLACE FUNCTION test_block_response_insert() RETURNS trigger AS $$
  DECLARE
    advisory_lock_key bigint;
  BEGIN
    SELECT lock_key INTO advisory_lock_key
    FROM test_response_insert_blocks
    WHERE participant_id = NEW.participant_id;

    IF advisory_lock_key IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(advisory_lock_key);
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS test_block_response_insert ON poll_responses;
  CREATE TRIGGER test_block_response_insert
  BEFORE INSERT ON poll_responses
  FOR EACH ROW EXECUTE FUNCTION test_block_response_insert();
`;
const ENABLE_RESPONSE_INSERT_BLOCK = `
  INSERT INTO test_response_insert_blocks (participant_id, lock_key)
  VALUES ($1, $2)
  ON CONFLICT (participant_id) DO UPDATE SET lock_key = EXCLUDED.lock_key
`;
const REMOVE_RESPONSE_INSERT_BLOCK = `
  DROP TRIGGER IF EXISTS test_block_response_insert ON poll_responses;
  DROP FUNCTION IF EXISTS test_block_response_insert();
  DROP TABLE IF EXISTS test_response_insert_blocks;
`;
const BLOCKED_INSERT_EXISTS = `
  SELECT EXISTS (
    SELECT 1
    FROM pg_locks
    WHERE
      locktype = 'advisory'
      AND classid = 0
      AND objid = $1::oid
      AND objsubid = 1
      AND NOT granted
  ) AS blocked
`;
const BLOCKED_POLL_CLOSE_EXISTS = `
  WITH blocked_insert AS (
    SELECT activity.pid
    FROM pg_stat_activity AS activity
    JOIN pg_locks AS held_lock
      ON held_lock.pid = activity.pid
      AND held_lock.locktype = 'advisory'
      AND held_lock.classid = 0
      AND held_lock.objid = ${RESPONSE_INSERT_LOCK}::oid
      AND held_lock.objsubid = 1
      AND NOT held_lock.granted
    WHERE
      activity.wait_event_type = 'Lock'
      AND upper(activity.query) LIKE '%INSERT INTO POLL_RESPONSES%'
  )
  SELECT EXISTS (
    SELECT 1 FROM pg_stat_activity AS close_query
    CROSS JOIN blocked_insert
    WHERE
      close_query.wait_event_type = 'Lock'
      AND upper(close_query.query) ~ 'UPDATE ("PUBLIC"[.])?"?POLLS"?'
      AND blocked_insert.pid = ANY(pg_blocking_pids(close_query.pid))
  ) AS blocked
`;
const INSTALL_RESPONSE_UPDATE_BLOCK = `
  CREATE TABLE IF NOT EXISTS test_response_update_blocks (
    response_id uuid PRIMARY KEY,
    lock_key bigint NOT NULL
  );

  CREATE OR REPLACE FUNCTION test_block_response_update() RETURNS trigger AS $$
  DECLARE
    advisory_lock_key bigint;
  BEGIN
    SELECT lock_key INTO advisory_lock_key
    FROM test_response_update_blocks
    WHERE response_id = NEW.id;

    IF advisory_lock_key IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(advisory_lock_key);
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS test_block_response_update ON poll_responses;
  CREATE TRIGGER test_block_response_update
  BEFORE UPDATE ON poll_responses
  FOR EACH ROW EXECUTE FUNCTION test_block_response_update();
`;
const ENABLE_RESPONSE_UPDATE_BLOCK = `
  INSERT INTO test_response_update_blocks (response_id, lock_key)
  VALUES ($1, $2)
  ON CONFLICT (response_id) DO UPDATE SET lock_key = EXCLUDED.lock_key
`;
const REMOVE_RESPONSE_UPDATE_BLOCK = `
  DROP TRIGGER IF EXISTS test_block_response_update ON poll_responses;
  DROP FUNCTION IF EXISTS test_block_response_update();
  DROP TABLE IF EXISTS test_response_update_blocks;
`;
const BLOCKED_RESPONSE_UPDATE_EXISTS = `
  SELECT EXISTS (
    SELECT 1
    FROM pg_locks
    WHERE
      locktype = 'advisory'
      AND classid = 0
      AND objid = $1::oid
      AND objsubid = 1
      AND NOT granted
  ) AS blocked
`;
const BLOCKED_POLL_CLOSE_AFTER_RESPONSE_UPDATE = `
  WITH blocked_update AS (
    SELECT activity.pid
    FROM pg_stat_activity AS activity
    JOIN pg_locks AS held_lock
      ON held_lock.pid = activity.pid
      AND held_lock.locktype = 'advisory'
      AND held_lock.classid = 0
      AND held_lock.objid = ${RESPONSE_UPDATE_LOCK}::oid
      AND held_lock.objsubid = 1
      AND NOT held_lock.granted
    WHERE
      activity.wait_event_type = 'Lock'
      AND upper(activity.query) LIKE '%UPDATE POLL_RESPONSES%'
  )
  SELECT EXISTS (
    SELECT 1 FROM pg_stat_activity AS close_query
    CROSS JOIN blocked_update
    WHERE
      close_query.wait_event_type = 'Lock'
      AND upper(close_query.query) ~ 'UPDATE ("PUBLIC"[.])?"?POLLS"?'
      AND blocked_update.pid = ANY(pg_blocking_pids(close_query.pid))
  ) AS blocked
`;

interface BlockedInsertRow extends QueryResultRow {
  blocked: boolean;
}

export interface ResponseInsertBlock {
  waitUntilBlocked(): Promise<void>;
  waitUntilCloseBlocked(): Promise<void>;
  release(): Promise<void>;
  dispose(): Promise<void>;
}

export async function blockResponseInsert(participantId: string): Promise<ResponseInsertBlock> {
  const client = new Client({ connectionString: loadConfig().databaseUrl });
  await client.connect();
  await client.query(INSTALL_RESPONSE_INSERT_BLOCK);
  await client.query(ENABLE_RESPONSE_INSERT_BLOCK, [participantId, RESPONSE_INSERT_LOCK]);
  await client.query('SELECT pg_advisory_lock($1)', [RESPONSE_INSERT_LOCK]);
  let released = false;

  async function release(): Promise<void> {
    if (released) return;
    await client.query('SELECT pg_advisory_unlock($1)', [RESPONSE_INSERT_LOCK]);
    released = true;
  }

  return {
    waitUntilBlocked: () => waitUntilBlocked(client),
    waitUntilCloseBlocked: () => waitForLock(client, BLOCKED_POLL_CLOSE_EXISTS),
    release,
    async dispose(): Promise<void> {
      await release();
      await client.query(REMOVE_RESPONSE_INSERT_BLOCK);
      await client.end();
    },
  };
}

export async function blockResponseUpdate(responseId: string): Promise<ResponseInsertBlock> {
  const client = new Client({ connectionString: loadConfig().databaseUrl });
  await client.connect();
  await client.query(INSTALL_RESPONSE_UPDATE_BLOCK);
  await client.query(ENABLE_RESPONSE_UPDATE_BLOCK, [responseId, RESPONSE_UPDATE_LOCK]);
  await client.query('SELECT pg_advisory_lock($1)', [RESPONSE_UPDATE_LOCK]);
  let released = false;

  async function release(): Promise<void> {
    if (released) return;
    await client.query('SELECT pg_advisory_unlock($1)', [RESPONSE_UPDATE_LOCK]);
    released = true;
  }

  return {
    waitUntilBlocked: () =>
      waitForLock(client, BLOCKED_RESPONSE_UPDATE_EXISTS, [RESPONSE_UPDATE_LOCK]),
    waitUntilCloseBlocked: () => waitForLock(client, BLOCKED_POLL_CLOSE_AFTER_RESPONSE_UPDATE),
    release,
    async dispose(): Promise<void> {
      await release();
      await client.query(REMOVE_RESPONSE_UPDATE_BLOCK);
      await client.end();
    },
  };
}

async function waitUntilBlocked(client: Client): Promise<void> {
  await waitForLock(client, BLOCKED_INSERT_EXISTS, [RESPONSE_INSERT_LOCK]);
}

async function waitForLock(client: Client, query: string, values: unknown[] = []): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await client.query<BlockedInsertRow>(query, values);
    if (result.rows[0]?.blocked) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for the response insert advisory lock');
}
