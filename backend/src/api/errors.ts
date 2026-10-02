import type { FastifyInstance } from 'fastify';

export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'GROUP_NOT_FOUND'
  | 'POLL_NOT_FOUND'
  | 'RESPONSE_NOT_FOUND'
  | 'PARTICIPANT_NAME_TAKEN'
  | 'RESPONSE_ALREADY_EXISTS'
  | 'POLL_STATE_CONFLICT'
  | 'INVALID_SCHEDULE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function registerApiErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const errorRecord = typeof error === 'object' && error !== null ? error : null;
    const isValidationError =
      (errorRecord !== null && 'validation' in errorRecord && Array.isArray(errorRecord.validation)) ||
      (errorRecord !== null && 'statusCode' in errorRecord && errorRecord.statusCode === 400);
    const appError = error instanceof AppError
      ? error
      : isValidationError
        ? new AppError('INVALID_REQUEST', 400, 'Invalid request')
        : new AppError('INTERNAL_ERROR', 500, 'Internal server error');
    if (appError.statusCode >= 500) request.log.error({ err: error }, 'Unhandled API error');
    return reply.code(appError.statusCode).send({
      error: { code: appError.code, message: appError.message, requestId: request.id },
    });
  });
}
