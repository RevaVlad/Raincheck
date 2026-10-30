import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { runCycle } from '../src/index.js';
import { registry, checks, duration } from '../src/metrics.js';
import { checkResponse } from '../src/http.js';
import { waitForNextCycle } from '../src/utils.js';
import type { Config, AvailabilityInterval } from '../src/types.js';

await test(
  'waiting for the next cycle can be interrupted during shutdown',
  { timeout: 1000 },
  async () => {
    const stop = new AbortController();
    const waiting = waitForNextCycle(performance.now(), 15000, stop.signal);

    stop.abort();
    await waiting;
  },
);

await test('a long cycle does not wait for another full interval', { timeout: 1000 }, async () => {
  await waitForNextCycle(performance.now() - 16000, 15000, new AbortController().signal);
});

await test('response comparison allows extra object fields, including inside arrays', () => {
  checkResponse(
    { id: 'generated', intervals: [{ startAt: 'start', id: 'extra' }] },
    { intervals: [{ startAt: 'start' }] },
  );
});

await test('response comparison rejects missing or different fields and extra array items', () => {
  for (const actual of [{}, { state: 'CONFIRMED' }, { state: null }]) {
    assert.throws(() => checkResponse(actual, { state: 'DRAFT' }));
  }
  assert.throws(() => checkResponse({ intervals: [{}] }, { intervals: [] }));
  assert.throws(() => checkResponse({ intervals: [] }, { intervals: [{}] }));
  assert.throws(() => checkResponse({ intervals: null }, { intervals: [] }));
  assert.throws(() => checkResponse({ intervals: {} }, { intervals: [] }));
});

const slot = { startAt: '2026-10-30T08:00:00.000Z', endAt: '2026-10-30T08:30:00.000Z' };

async function fixture() {
  const app = Fastify();
  let exists = false;
  let intervals: AvailabilityInterval[] = [];
  const calls: string[] = [];
  const behavior = {
    failSave: false,
    badRead: false,
    missingId: false,
    badResults: false,
    failCleanup: false,
    slowPoll: false,
    timeout: false,
  };
  function responseBody(method: string) {
    return {
      id: behavior.missingId ? undefined : 'response',
      state: 'DRAFT',
      confirmedAt: null,
      intervals: behavior.badRead && method === 'GET' ? [] : intervals,
    };
  }
  app.all('/*', async (req, reply) => {
    calls.push(`${req.method} ${req.url}`);
    if (req.url.endsWith('/workspace')) {
      if (behavior.timeout) {
        reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
        reply.raw.write('{');
        return reply.hijack();
      }
      return { me: { id: 'participant' }, currentPoll: { id: 'poll', slots: [slot] } };
    }
    if (req.method === 'DELETE') {
      if (behavior.failCleanup && exists) return reply.code(500).send({});
      exists = false;
      return reply.code(204).send();
    }
    if (req.url.includes('/responses/me')) {
      assert.equal(req.headers['x-participant-token'], 'private-test-token');
      if (behavior.failSave) return reply.code(500).send({});
      if (req.method === 'POST') {
        exists = true;
        intervals = [];
      }
      if (req.method === 'PUT') {
        intervals = (req.body as { intervals: AvailabilityInterval[] }).intervals;
      }
      return reply.code(req.method === 'POST' ? 201 : 200).send(responseBody(req.method));
    }
    if (req.url.includes('/results?')) {
      return {
        participantSummary: { total: 1, confirmed: 0, pending: 1 },
        bestSlots: [],
        participants: [{ id: 'participant', displayName: 'Probe', state: 'DRAFT' }],
        heatmap: [
          {
            ...slot,
            available: behavior.badResults ? 1 : 0,
            ifNeeded: 0,
            preferred: 0,
            unavailable: 0,
            averageSoftScore: 0,
          },
        ],
      };
    }
    if (behavior.slowPoll) await new Promise((resolve) => setTimeout(resolve, 550));
    return { poll: { id: 'poll', status: 'OPEN' } };
  });
  const apiUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  const config: Config = {
    apiUrl,
    inviteCode: 'invite',
    pollId: 'poll',
    token: 'private-test-token',
    intervalMs: 15000,
    port: 9091,
  };
  return { app, config, behavior, calls, exists: () => exists };
}

async function results() {
  return (await checks.get()).values.map((value) => {
    const labels = value.labels as Record<string, string>;
    return { operation: labels.operation, result: labels.result, count: value.value };
  });
}

await test('cycle saves intervals, records three checks and cleans up', async () => {
  const f = await fixture();
  try {
    registry.resetMetrics();
    await runCycle(f.config);
    assert.deepEqual(
      (await results()).map((x) => x.result),
      ['success', 'success', 'success'],
    );
    assert.equal(f.exists(), false);
    assert.equal(f.calls.length, 8);
    assert.equal(f.calls.filter((x) => x.startsWith('DELETE')).length, 2);
    assert.equal(
      (await duration.get()).values
        .filter((x) => x.metricName?.endsWith('_count'))
        .reduce((sum, x) => sum + x.value, 0),
      3,
    );
  } finally {
    await f.app.close();
  }
});

for (const name of ['failSave', 'badRead', 'badResults', 'missingId', 'timeout'] as const) {
  await test(`${name}: records failures, cleans up and recovers`, async () => {
    const f = await fixture();
    try {
      registry.resetMetrics();
      f.behavior[name] = true;
      await runCycle(f.config);
      const values = await results();
      assert.equal(
        values.reduce((sum, x) => sum + x.count, 0),
        3,
      );
      assert.ok(
        values.some((x) => x.result === (name === 'timeout' ? 'timeout' : 'invalid_result')),
      );
      assert.equal(f.exists(), false);
      assert.ok(f.calls.at(-1)?.startsWith('DELETE'));
      f.behavior[name] = false;
      registry.resetMetrics();
      await runCycle(f.config);
      assert.deepEqual(
        (await results()).map((x) => x.result),
        ['success', 'success', 'success'],
      );
    } finally {
      await f.app.close();
    }
  });
}

await test('slow poll and final cleanup failure have separate metrics', async () => {
  const f = await fixture();
  try {
    registry.resetMetrics();
    f.behavior.slowPoll = true;
    f.behavior.failCleanup = true;
    await runCycle(f.config);
    assert.deepEqual(
      (await results()).map((x) => x.result),
      ['success', 'slow', 'success'],
    );
    assert.equal(f.exists(), true);
    assert.match(await registry.metrics(), /raincheck_probe_cleanup_failures_total.* 1/);
  } finally {
    await f.app.close();
  }
});

await test('backend outage produces all three failed checks without exposing token', async () => {
  const f = await fixture();
  await f.app.close();
  registry.resetMetrics();
  await runCycle(f.config);
  assert.deepEqual(
    (await results()).map((x) => x.result),
    ['error', 'error', 'error'],
  );
  assert.ok(!(await registry.metrics()).includes(f.config.token));
});
