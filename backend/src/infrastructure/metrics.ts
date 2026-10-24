import { collectDefaultMetrics, Registry } from '@prometheus-io/client';

export const metricsRegistry = new Registry();

metricsRegistry.setContentType(Registry.OPENMETRICS_CONTENT_TYPE);

collectDefaultMetrics({
  register: metricsRegistry,
});
