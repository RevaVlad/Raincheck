import { Counter, Histogram, Registry } from '@prometheus-io/client';
import { resultOf } from './utils.js';
import type { ProbeOperation, ProbeOutcome, ProbeResult } from './types.js';

export const registry = new Registry();

export const checks = new Counter({
  name: 'raincheck_probe_checks_total',
  help: 'Synthetic checks',
  labelNames: ['operation', 'result'],
  registers: [registry],
});

export const duration = new Histogram({
  name: 'raincheck_probe_duration_seconds',
  help: 'Synthetic check duration',
  labelNames: ['operation', 'result'],
  buckets: [0.1, 0.2, 0.3, 0.5, 0.75, 1, 2, 5, 10],
  registers: [registry],
});

export const cleanupFailures = new Counter({
  name: 'raincheck_probe_cleanup_failures_total',
  help: 'Cleanup failures outside user SLI',
  labelNames: ['stage', 'result'],
  registers: [registry],
});

export async function measure<T>(
  operation: ProbeOperation,
  thresholdMs: number,
  check: () => Promise<T>,
): Promise<ProbeOutcome<T>> {
  const start = performance.now();
  let result: ProbeResult = 'success';

  try {
    const value = await check();
    if (performance.now() - start > thresholdMs) result = 'slow';

    return { value };
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error('Probe failed');
    result = resultOf(error);

    console.error(operation, result);

    return { error };
  } finally {
    checks.inc({ operation, result });
    duration.observe({ operation, result }, (performance.now() - start) / 1000);
  }
}
