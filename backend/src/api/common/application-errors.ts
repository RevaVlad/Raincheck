import type { ApplicationErrorCode } from '#services/errors';

export const applicationErrorStatus: Record<ApplicationErrorCode, number> = {
  UNAUTHORIZED: 401,
  GROUP_NOT_FOUND: 404,
  POLL_NOT_FOUND: 404,
  RESPONSE_NOT_FOUND: 404,
  PARTICIPANT_NAME_TAKEN: 409,
  RESPONSE_ALREADY_EXISTS: 409,
  POLL_STATE_CONFLICT: 409,
  INVALID_SCHEDULE: 422,
};
