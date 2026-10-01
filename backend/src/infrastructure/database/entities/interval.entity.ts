import { defineEntity, p } from '@mikro-orm/postgresql';
import { ResponseEntity } from './response.entity.js';

const IntervalSchema = defineEntity({
  name: 'IntervalEntity',
  tableName: 'availability_intervals',
  properties: {
    id: p.uuid().primary(),
    response: () => p.manyToOne(ResponseEntity).joinColumn('response_id').deleteRule('cascade'),
    localDate: p.string().columnType('date').fieldName('local_date'),
    startTime: p.string().columnType('time').fieldName('start_time'),
    endTime: p.string().columnType('time').fieldName('end_time'),
    kind: p.enum(['UNAVAILABLE', 'IF_NEEDED', 'PREFERRED'] as const).length(20),
    preferenceDirection: p.enum(['EARLIER', 'FLAT', 'LATER'] as const)
      .fieldName('preference_direction').length(16).nullable(),
    createdAt: p.datetime().fieldName('created_at').columnType('timestamptz'),
    updatedAt: p.datetime().fieldName('updated_at').columnType('timestamptz'),
  },
  indexes: [
    { name: 'availability_intervals_response_date_time_idx', properties: ['response', 'localDate', 'startTime'] },
  ],
  checks: [
    { name: 'availability_interval_time_valid', expression: 'start_time < end_time' },
    { name: 'availability_interval_kind_valid', expression: "kind in ('UNAVAILABLE', 'IF_NEEDED', 'PREFERRED')" },
    { name: 'availability_interval_direction_valid', expression: "(kind = 'PREFERRED' and preference_direction is not null and preference_direction in ('EARLIER', 'FLAT', 'LATER')) or (kind <> 'PREFERRED' and preference_direction is null)" },
  ],
});

export class IntervalEntity extends IntervalSchema.class {}
IntervalSchema.setClass(IntervalEntity);
