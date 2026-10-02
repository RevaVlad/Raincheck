export const LIMITS = {
  GROUP_NAME: 120,
  PARTICIPANT_NAME: 80,
  POLL_TITLE: 160,
  POLL_DAYS: 7,
  MEETING_MINUTES: 240,
  TOKEN_BYTES: 32,
} as const;

export const UTC_TIMEZONE = 'UTC' as const;

export const POLL_STATUS = { OPEN: 'OPEN', CLOSED: 'CLOSED' } as const;
export const RESPONSE_STATE = { DRAFT: 'DRAFT', CONFIRMED: 'CONFIRMED' } as const;
export const INTERVAL_KIND = {
  UNAVAILABLE: 'UNAVAILABLE',
  IF_NEEDED: 'IF_NEEDED',
  PREFERRED: 'PREFERRED',
} as const;
export const PREFERENCE_DIRECTION = {
  EARLIER: 'EARLIER',
  FLAT: 'FLAT',
  LATER: 'LATER',
} as const;
