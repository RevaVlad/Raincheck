import { randomBytes, randomUUID } from 'node:crypto';

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  timezone: string;
  createdAt: Date;
}

export function createGroup(input: { name: string; timezone: string }, now = new Date()): Group {
  const name = input.name.trim();
  if (Array.from(name).length < 1 || Array.from(name).length > 120) {
    throw new RangeError('Group name must contain 1 to 120 characters');
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: input.timezone });
  } catch {
    throw new RangeError('Group timezone must be a valid IANA timezone');
  }
  return {
    id: randomUUID(),
    name,
    inviteCode: randomBytes(32).toString('base64url'),
    timezone: input.timezone,
    createdAt: now,
  };
}
