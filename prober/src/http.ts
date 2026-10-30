import assert from 'node:assert/strict';
import type { Config, HttpMethod, SaveIntervalsRequest } from './types.js';

export function checkResponse(actual: object, expected: object): void {
  assert(actual !== null && typeof actual === 'object', 'Expected a response object');

  if (Array.isArray(expected)) {
    assert(Array.isArray(actual), 'Expected an array');
    assert.equal(actual.length, expected.length, 'Unexpected array length');
  }

  for (const [key, value] of Object.entries(expected)) {
    const received = Reflect.get(actual, key);

    if (value !== null && typeof value === 'object') checkResponse(received, value);
    else assert.deepEqual(received, value, `Unexpected response field: ${key}`);
  }
}

export async function request<T>(
  config: Config,
  path: string,
  method: HttpMethod = 'GET',
  expectedStatuses = [200],
  body?: SaveIntervalsRequest,
): Promise<T> {
  const headers: Record<string, string> = { 'X-Participant-Token': config.token };
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  const text = await response.text();

  assert(expectedStatuses.includes(response.status), 'Unexpected HTTP status');

  if (method === 'DELETE') return undefined as T;

  return JSON.parse(text) as T;
}

export function groupPath(config: Config): string {
  return `/api/groups/${encodeURIComponent(config.inviteCode)}`;
}

export function pollPath(config: Config): string {
  return `${groupPath(config)}/polls/${encodeURIComponent(config.pollId)}`;
}
