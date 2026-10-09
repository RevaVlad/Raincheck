import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorCode } from './api.types';

const apiErrorCodes: ReadonlySet<string> = new Set([
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'GROUP_NOT_FOUND',
  'POLL_NOT_FOUND',
  'RESPONSE_NOT_FOUND',
  'PARTICIPANT_NAME_TAKEN',
  'RESPONSE_ALREADY_EXISTS',
  'POLL_STATE_CONFLICT',
  'INVALID_SCHEDULE',
  'INTERNAL_ERROR',
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function errorDetail(error: unknown): Record<string, unknown> | null {
  const body = record(error instanceof HttpErrorResponse ? error.error : error);
  return record(body?.['error']);
}

export function apiErrorCode(error: unknown): ApiErrorCode | null {
  const code = errorDetail(error)?.['code'];
  return typeof code === 'string' && apiErrorCodes.has(code) ? (code as ApiErrorCode) : null;
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  const message = errorDetail(error)?.['message'];
  return typeof message === 'string' ? message : fallback;
}

export function isUnauthorized(error: unknown): boolean {
  return (
    apiErrorCode(error) === 'UNAUTHORIZED' ||
    (error instanceof HttpErrorResponse && error.status === 401)
  );
}
