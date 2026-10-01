import { defineEntity, p } from '@mikro-orm/postgresql';
import { GroupEntity } from './group.entity.js';

const ParticipantSchema = defineEntity({
  name: 'ParticipantEntity',
  tableName: 'participants',
  properties: {
    id: p.uuid().primary(),
    group: () => p.manyToOne(GroupEntity).joinColumn('group_id').deleteRule('cascade'),
    displayName: p.string().length(80).fieldName('display_name'),
    displayNameNormalized: p.string().length(80).fieldName('display_name_normalized'),
    editTokenHash: p.string().columnType('char(64)').fieldName('edit_token_hash').unique(),
    createdAt: p.datetime().fieldName('created_at').columnType('timestamptz'),
    updatedAt: p.datetime().fieldName('updated_at').columnType('timestamptz'),
  },
  uniques: [
    { name: 'participants_group_name_unique', properties: ['group', 'displayNameNormalized'] },
  ],
  checks: [
    { name: 'participants_name_not_blank', expression: 'char_length(btrim(display_name)) between 1 and 80' },
  ],
});

export class ParticipantEntity extends ParticipantSchema.class {}
ParticipantSchema.setClass(ParticipantEntity);
