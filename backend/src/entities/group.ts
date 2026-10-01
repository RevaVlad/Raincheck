import type { UTC_TIMEZONE } from '#shared/constants';

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  timezone: typeof UTC_TIMEZONE;
  createdAt: Date;
}

export interface GroupInput {
  name: string;
}
