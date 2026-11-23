import { Gauge, Registry } from '@prometheus-io/client';
import type { FastifyInstance } from 'fastify';
import metricsPlugin from 'fastify-metrics';

function trackInFlightRequests(app: FastifyInstance, registry: Registry): void {
  const inFlight = new Gauge({
    name: 'raincheck_http_requests_in_flight',
    help: 'Number of API requests currently in flight',
    registers: [registry],
  });
  app.addHook('onRequest', (request, reply, done) => {
    if (request.routeOptions.url?.startsWith('/api/')) {
      inFlight.inc();
      const finish = () => {
        reply.raw.off('finish', finish);
        reply.raw.off('close', finish);
        inFlight.dec();
      };
      reply.raw.once('finish', finish);
      reply.raw.once('close', finish);
    }
    done();
  });
}

export function configureHttpRequestMetrics(app: FastifyInstance, registry = new Registry()): void {
  registry.setContentType(Registry.OPENMETRICS_CONTENT_TYPE);
  trackInFlightRequests(app, registry);
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
