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

function isValidationError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('validation' in error && Array.isArray(error.validation)) return true;
  return 'statusCode' in error && error.statusCode === 400;
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof RangeError) return new AppError('INVALID_REQUEST', 400, error.message);
  if (isValidationError(error)) return new AppError('INVALID_REQUEST', 400, 'Invalid request');
  return new AppError('INTERNAL_ERROR', 500, 'Internal server error');
}

export function registerApiErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const appError = normalizeError(error);
    const fields = {
      event: 'http.request.error',
      errorCode: appError.code,
      description: appError.statusCode >= 500 ? 'Internal server error' : appError.code,
      method: request.method,
      route: request.routeOptions.url ?? 'unmatched',
      statusCode: appError.statusCode,
      duration_ms: reply.elapsedTime,
      ...(appError.statusCode >= 500 ? { err: error } : {}),
    };
    if (appError.statusCode >= 500) request.log.error(fields, 'API request failed');
    else if (appError.statusCode === 404) request.log.info(fields, 'API request not found');
    else request.log.warn(fields, 'API request rejected');
    return reply.code(appError.statusCode).send({
      error: { code: appError.code, message: appError.message, requestId: request.id },
    });
  });
}
