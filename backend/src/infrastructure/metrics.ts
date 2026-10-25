import { collectDefaultMetrics, Counter, Registry } from '@prometheus-io/client';

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
