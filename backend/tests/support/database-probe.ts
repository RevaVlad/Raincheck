import type { QueryResultRow } from 'pg';
import type { ResponseState } from '#domain/response/response';
import type { Database } from '#infrastructure/database/database';
import { requiredRow } from '#infrastructure/database/repositories/required-row';

interface ExistsRow extends QueryResultRow {
  exists: boolean;
}

interface ParticipantTokenRow extends QueryResultRow {
  edit_token_hash: string;
}

interface PollReferenceRow extends QueryResultRow {
  based_on_poll_id: string | null;
}

interface ResponseStateRow extends QueryResultRow {
  state: ResponseState;
  confirmed_at: Date | null;
}

interface StoredIntervalRow extends QueryResultRow {
  start_time: string;
}

export interface ParticipantToken {
  editTokenHash: string;
}

export interface PollReference {
  basedOnPollId: string | null;
}

export interface StoredResponseState {
  state: ResponseState;
  confirmedAt: Date | null;
}

export interface StoredInterval {
  startTime: string;
}

export class DatabaseProbe {
  constructor(private readonly database: Database) {}

  async groupExists(id: string): Promise<boolean> {
    const result = await this.database.query<ExistsRow>(
      'SELECT EXISTS (SELECT 1 FROM groups WHERE id = $1) AS exists',
      [id],
    );
    return requiredRow(result, 'Group existence probe returned no row').exists;
  }

  async participantToken(id: string): Promise<ParticipantToken> {
    const result = await this.database.query<ParticipantTokenRow>(
      'SELECT edit_token_hash FROM participants WHERE id = $1',
      [id],
    );
    return { editTokenHash: requiredRow(result, 'Participant not found').edit_token_hash };
  }

  async pollReference(id: string): Promise<PollReference> {
    const result = await this.database.query<PollReferenceRow>(
      'SELECT based_on_poll_id FROM polls WHERE id = $1',
      [id],
    );
    return { basedOnPollId: requiredRow(result, 'Poll not found').based_on_poll_id };
  }

  async responseState(id: string): Promise<StoredResponseState> {
    const result = await this.database.query<ResponseStateRow>(
      'SELECT state, confirmed_at FROM poll_responses WHERE id = $1',
      [id],
    );
    const row = requiredRow(result, 'Response not found');
    return { state: row.state, confirmedAt: row.confirmed_at };
  }

  async storedIntervals(responseId: string): Promise<StoredInterval[]> {
    const result = await this.database.query<StoredIntervalRow>(
      `
        SELECT start_time::text AS start_time
        FROM availability_intervals
        WHERE response_id = $1
        ORDER BY local_date, start_time
      `,
      [responseId],
    );
    return result.rows.map((row) => ({ startTime: row.start_time.slice(0, 5) }));
  }

  async deletePoll(id: string): Promise<void> {
    await this.database.query('DELETE FROM polls WHERE id = $1', [id]);
  }

  async deleteGroup(id: string): Promise<void> {
    await this.database.query('DELETE FROM groups WHERE id = $1', [id]);
  }
}
