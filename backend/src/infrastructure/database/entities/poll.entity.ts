import { defineEntity, p } from '@mikro-orm/postgresql';
import { GroupEntity } from './group.entity.js';

const PollSchema = defineEntity({
  name: 'PollEntity',
  tableName: 'polls',
  properties: {
    id: p.uuid().primary(),
    group: () => p.manyToOne(GroupEntity).joinColumn('group_id').deleteRule('cascade'),
    sequenceNo: p.integer().fieldName('sequence_no'),
    title: p.string().length(160).nullable(),
    startsOn: p.string().columnType('date').fieldName('starts_on'),
    endsOn: p.string().columnType('date').fieldName('ends_on'),
    dayStart: p.string().columnType('time').fieldName('day_start'),
    dayEnd: p.string().columnType('time').fieldName('day_end'),
    slotMinutes: p.smallint().fieldName('slot_minutes'),
    meetingDurationMinutes: p.smallint().fieldName('meeting_duration_minutes'),
    status: p.enum(['OPEN', 'CLOSED'] as const).length(16),
    basedOnPoll: () => p.manyToOne(PollEntity)
      .joinColumn('based_on_poll_id').nullable().deleteRule('set null'),
    createdAt: p.datetime().fieldName('created_at').columnType('timestamptz'),
    closedAt: p.datetime().fieldName('closed_at').columnType('timestamptz').nullable(),
  },
  uniques: [
    { name: 'polls_group_sequence_unique', properties: ['group', 'sequenceNo'] },
    { name: 'polls_one_open_per_group_idx', properties: ['group'], where: "status = 'OPEN'" },
  ],
  indexes: [
    { name: 'polls_group_created_idx', properties: ['group', 'createdAt'] },
  ],
  checks: [
    { name: 'polls_sequence_positive', expression: 'sequence_no > 0' },
    { name: 'polls_dates_valid', expression: 'starts_on <= ends_on and (ends_on - starts_on) between 0 and 6' },
    { name: 'polls_day_window_valid', expression: 'day_start < day_end' },
    { name: 'polls_slot_minutes_valid', expression: 'slot_minutes in (30, 60)' },
    { name: 'polls_meeting_duration_valid', expression: 'meeting_duration_minutes between 30 and 240 and meeting_duration_minutes % slot_minutes = 0' },
    { name: 'polls_meeting_fits_day_window', expression: 'meeting_duration_minutes <= extract(epoch from (day_end - day_start)) / 60' },
    { name: 'polls_status_valid', expression: "status in ('OPEN', 'CLOSED')" },
    { name: 'polls_closed_at_consistent', expression: "(status = 'OPEN' and closed_at is null) or (status = 'CLOSED' and closed_at is not null)" },
  ],
});

export class PollEntity extends PollSchema.class {}
PollSchema.setClass(PollEntity);
