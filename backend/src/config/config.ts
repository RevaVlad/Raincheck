export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
}

const NODE_ENVS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    nodeEnv: parseNodeEnv(env['NODE_ENV']),
    host: env['HOST'] ?? '127.0.0.1',
    port: parsePort(env['PORT']),
    databaseUrl: parseDatabaseUrl(env['DATABASE_URL']),
    logLevel: parseLogLevel(env['LOG_LEVEL']),
  };
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function parseDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }
  return databaseUrl;
}

function parseNodeEnv(value: string | undefined): Config['nodeEnv'] {
  const nodeEnv = value ?? 'development';
  if (NODE_ENVS.includes(nodeEnv as Config['nodeEnv'])) {
    return nodeEnv as Config['nodeEnv'];
  }
  throw new Error('NODE_ENV must be development, test, or production');
}

function parseLogLevel(value: string | undefined): Config['logLevel'] {
  const logLevel = value ?? 'info';
  if (LOG_LEVELS.includes(logLevel as Config['logLevel'])) return logLevel as Config['logLevel'];
  throw new Error('LOG_LEVEL is invalid');
}
