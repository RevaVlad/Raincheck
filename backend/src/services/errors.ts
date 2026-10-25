export type ApplicationErrorCode =
  | 'UNAUTHORIZED'
  | 'GROUP_NOT_FOUND'
  | 'POLL_NOT_FOUND'
  | 'RESPONSE_NOT_FOUND'
  | 'PARTICIPANT_NAME_TAKEN'
  | 'RESPONSE_ALREADY_EXISTS'
  | 'POLL_STATE_CONFLICT'
  | 'INVALID_SCHEDULE';

export class ApplicationError extends Error {
  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
  }
}
