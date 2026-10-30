import { Registry } from '@prometheus-io/client';
import type { FastifyInstance } from 'fastify';
import metricsPlugin from 'fastify-metrics';

export function configureHttpRequestDurationMetrics(
  app: FastifyInstance,
  registry = new Registry(),
): void {
  registry.setContentType(Registry.OPENMETRICS_CONTENT_TYPE);
  void app.register(metricsPlugin.default, {
    promClient: 'prometheus-io',
    endpoint: null,
    defaultMetrics: { enabled: false },
    routeMetrics: {
      enabled: { histogram: true, summary: false },
      timing: 'elapsedTime',
      registeredRoutesOnly: false,
      routeBlacklist: [/^\/health\//],
      overrides: {
        histogram: {
          buckets: [0.1, 0.2, 0.3, 0.5, 0.75, 1, 2, 5, 10],
          registers: [registry],
        },
        summary: { registers: [] },
      },
    },
  });
}
