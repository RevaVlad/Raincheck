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
  serializers: { err: serializeError },
});

function serializeError(error: unknown) {
  const message = 'Unexpected error';
  if (!(error instanceof Error)) return { type: 'Error', message };
  const header = Error.prototype.toString.call(error);
  const frames = error.stack?.startsWith(header) ? error.stack.slice(header.length) : '';
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return {
    type: error.name,
    message,
    code,
    stack: `${error.name}: ${message}${frames}`,
  };
}
