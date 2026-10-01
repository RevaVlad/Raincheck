import { defineEntity, p } from '@mikro-orm/postgresql';
import { ParticipantEntity } from './participant.entity.js';
import { PollEntity } from './poll.entity.js';

const ResponseSchema = defineEntity({
  name: 'ResponseEntity',
  tableName: 'poll_responses',
  properties: {
    id: p.uuid().primary(),
    poll: () => p.manyToOne(PollEntity).joinColumn('poll_id').deleteRule('cascade'),
    participant: () => p.manyToOne(ParticipantEntity).joinColumn('participant_id').deleteRule('cascade'),
    state: p.enum(['DRAFT', 'CONFIRMED'] as const).length(16),
    confirmedAt: p.datetime().fieldName('confirmed_at').columnType('timestamptz').nullable(),
    updatedAt: p.datetime().fieldName('updated_at').columnType('timestamptz'),
  },
  uniques: [
    { name: 'poll_responses_poll_participant_unique', properties: ['poll', 'participant'] },
  ],
  indexes: [
    { name: 'poll_responses_poll_state_idx', properties: ['poll', 'state'] },
  ],
  checks: [
    { name: 'poll_responses_state_valid', expression: "state in ('DRAFT', 'CONFIRMED')" },
    { name: 'poll_responses_confirmation_consistent', expression: "(state = 'DRAFT' and confirmed_at is null) or (state = 'CONFIRMED' and confirmed_at is not null)" },
  ],
});

export class ResponseEntity extends ResponseSchema.class {}
ResponseSchema.setClass(ResponseEntity);
