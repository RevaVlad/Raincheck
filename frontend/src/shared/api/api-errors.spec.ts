import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorCode, apiErrorMessage, isUnauthorized } from './api-errors';

describe('API errors', () => {
  it('extracts stable API errors and recognizes an HTTP 401', () => {
    const error = { error: { code: 'UNAUTHORIZED', message: 'Expired' } };
    expect(apiErrorCode(error)).toBe('UNAUTHORIZED');
    expect(apiErrorMessage(error, 'Fallback')).toBe('Expired');
    expect(apiErrorMessage({}, 'Fallback')).toBe('Fallback');
    expect(isUnauthorized(error)).toBe(true);
    expect(isUnauthorized(new HttpErrorResponse({ status: 401 }))).toBe(true);
    expect(isUnauthorized(new HttpErrorResponse({ status: 403 }))).toBe(false);
  });
});
