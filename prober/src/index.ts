import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import { pollPath, request } from './http.js';
import { registry, measure, cleanupFailures } from './metrics.js';
import { checkPoll, checkResults, checkSaveResponse } from './probes.js';
import { readConfig, resultOf, waitForNextCycle } from './utils.js';
import type { Config } from './types.js';

async function cleanup(config: Config, stage: 'initial' | 'final'): Promise<void> {
  try {
    await request(config, `${pollPath(config)}/responses/me`, 'DELETE', [204, 404]);
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error('Cleanup failed');
    const result = resultOf(error);

    cleanupFailures.inc({ stage, result });
    console.error('cleanup', stage, result);

    if (stage === 'initial') throw error;
  }
}

export async function runCycle(config: Config): Promise<void> {
  try {
    const saved = await measure('availability_save', 1000, async () => {
      await cleanup(config, 'initial');

      return checkSaveResponse(config);
    });

    const poll = await measure('poll_read', 500, () => checkPoll(config));

    await measure('common_slots', 1000, async () => {
      if (saved.error) throw saved.error;
      if (poll.error) throw poll.error;

      await checkResults(config, saved.value);
    });
  } finally {
    await cleanup(config, 'final');
  }
}

async function main(): Promise<void> {
  const config = readConfig();

  const app = Fastify();
  app.get('/metrics', async (_req, reply) =>
    reply.type(registry.contentType).send(await registry.metrics()),
  );

  const stop = new AbortController();
  const shutdown = () => stop.abort();
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  await app.listen({ host: '0.0.0.0', port: config.port });

  try {
    while (!stop.signal.aborted) {
      const cycleStartedAt = performance.now();
      await runCycle(config);

      await waitForNextCycle(cycleStartedAt, config.intervalMs, stop.signal);
    }
  } finally {
    await app.close();

    process.removeListener('SIGTERM', shutdown);
    process.removeListener('SIGINT', shutdown);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Prober stopped; check configuration');
    process.exitCode = 1;
  });
}
