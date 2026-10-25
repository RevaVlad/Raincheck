import { collectDefaultMetrics, Counter, Histogram, Registry } from '@prometheus-io/client';

export const metricsRegistry = new Registry();

metricsRegistry.setContentType(Registry.OPENMETRICS_CONTENT_TYPE);

collectDefaultMetrics({
  register: metricsRegistry,
});

export const groupsCreated = new Counter({
  name: 'raincheck_groups_created_total',
  help: 'Number of successfully created groups',
  registers: [metricsRegistry],
});

export const participantsCreated = new Counter({
  name: 'raincheck_participants_created_total',
  help: 'Number of successfully created participants',
  registers: [metricsRegistry],
});

export const pollsCreated = new Counter({
  name: 'raincheck_polls_created_total',
  help: 'Number of successfully created polls',
  registers: [metricsRegistry],
});

export const responsesCreated = new Counter({
  name: 'raincheck_responses_created_total',
  help: 'Number of successfully created poll responses',
  registers: [metricsRegistry],
});

export const pollLifetime = new Histogram({
  name: 'raincheck_poll_lifetime_seconds',
  help: 'Time from poll creation to successful closure in seconds',
  buckets: [60, 300, 1800, 3600, 86400],
  registers: [metricsRegistry],
});
