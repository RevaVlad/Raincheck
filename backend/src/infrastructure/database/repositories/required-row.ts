import type { QueryResult, QueryResultRow } from 'pg';

export function requiredRow<T extends QueryResultRow>(result: QueryResult<T>, message: string): T {
  const row = result.rows[0];
  if (!row) throw new Error(message);
  return row;
}
