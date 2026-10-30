import assert, { AssertionError } from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Config, ProbeResult } from './types.js';

function required(name: string): string {
  const value = process.env[name];

  assert(value, `Missing ${name}`);

  return value;
}

function numberEnv(name: string, fallback: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);

  assert(Number.isInteger(value) && value > 0 && value <= max);

  return value;
}

export function readConfig(): Config {
  const url = new URL(required('RAINCHECK_API_URL'));

  return {
    apiUrl: url.origin,
    inviteCode: required('PROBER_INVITE_CODE'),
    pollId: required('PROBER_POLL_ID'),
    token: required('PROBER_PARTICIPANT_TOKEN'),
    intervalMs: numberEnv('PROBER_INTERVAL_MS', 15000, 2147483647),
    port: numberEnv('PORT', 9091, 65535),
  };
}

export function resultOf(error: Error): ProbeResult {
  if (['TimeoutError', 'AbortError'].includes(error.name)) return 'timeout';
  if (error instanceof AssertionError || error instanceof SyntaxError) return 'invalid_result';
  return 'error';
}

export async function waitForNextCycle(
  cycleStartedAt: number,
  intervalMs: number,
  signal: AbortSignal,
): Promise<void> {
  const cycleDurationMs = performance.now() - cycleStartedAt;
  const remainingTimeMs = Math.max(1, intervalMs - cycleDurationMs);

  try {
    await sleep(remainingTimeMs, undefined, { signal });
  } catch (error) {
    if (!signal.aborted) throw error;
  }
}
