import pino from 'pino';

export const logger = pino({
  level: 'info',
  messageKey: 'message',
  base: { service: { name: 'raincheck-api' } },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: {
    level: (level) => ({ level }),
    log: (fields) => ({ event: 'application', ...fields }),
  },
});
