import { defineEntity, p } from '@mikro-orm/postgresql';

const GroupSchema = defineEntity({
  name: 'GroupEntity',
  tableName: 'groups',
  properties: {
    id: p.uuid().primary(),
    name: p.string().length(120),
    inviteCode: p.string().length(64).fieldName('invite_code').unique(),
    timezone: p.string().length(64),
    createdAt: p.datetime().fieldName('created_at').columnType('timestamptz'),
  },
  checks: [
    { name: 'groups_name_not_blank', expression: 'char_length(btrim(name)) between 1 and 120' },
    { name: 'groups_timezone_utc', expression: "timezone = 'UTC'" },
  ],
});

export class GroupEntity extends GroupSchema.class {}
GroupSchema.setClass(GroupEntity);
