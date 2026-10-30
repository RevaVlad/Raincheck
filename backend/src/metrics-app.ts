import Fastify from 'fastify';
import { Registry } from '@prometheus-io/client';
import { metricsRegistry } from '#infrastructure/metrics';

export function buildMetricsApp(httpMetricsRegistry?: Registry) {
  const app = Fastify();

  app.get('/metrics', async (_request, reply) => {
    const registry = httpMetricsRegistry
      ? Registry.merge([metricsRegistry, httpMetricsRegistry])
      : metricsRegistry;
    const metrics = await registry.metrics();
    return reply.header('Content-Type', registry.contentType).send(metrics);
  });

  return app;
}
