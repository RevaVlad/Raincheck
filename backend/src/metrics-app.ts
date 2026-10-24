import Fastify from 'fastify';
import { metricsRegistry } from '#infrastructure/metrics';

export function buildMetricsApp() {
  const app = Fastify();

  app.get('/metrics', async (_request, reply) => {
    const metrics = await metricsRegistry.metrics();
    return reply.header('Content-Type', metricsRegistry.contentType).send(metrics);
  });

  return app;
}
