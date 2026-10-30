import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { Histogram, Registry } from '@prometheus-io/client';
import type { Config } from '#config/config';
import { IntervalService } from '#services/interval/interval.service';
import { ResponseService } from '#services/response/response.service';
import { buildApp } from '../src/app.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { buildMetricsApp } from '../src/metrics-app.js';
import { routeFixtures } from './support/route-fixtures.js';

const metricName = 'http_request_duration_seconds';
const pollRoute = '/api/groups/:inviteCode/polls/:pollId';
const config: Config = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl: 'postgres://localhost/raincheck',
  logLevel: 'silent',
};

function histogram(registry: Registry) {
  const metric = registry.getSingleMetric(metricName);
  assert.ok(metric instanceof Histogram, 'fastify-metrics histogram must be registered');
  return metric;
}

async function sample(
  registry: Registry,
  request: { method: string; route: string },
  status: number,
  suffix = 'count',
) {
  const values = (await histogram(registry).get()).values;
  return values.find(
    (value) =>
      value.metricName === `${metricName}_${suffix}` &&
      value.labels.method === request.method &&
      value.labels.route === request.route &&
      Number(value.labels.status_code) === status,
  )?.value;
}

async function routeApp() {
  const fixture = routeFixtures();
  const database = {
    ...fixture.database,
    $disconnect: async () => {},
    poll: {
      ...fixture.database.poll,
      findUniqueOrThrow: async () => ({
        ...fixture.poll,
        startsOn: new Date(fixture.poll.startsOn),
        endsOn: new Date(fixture.poll.endsOn),
        dayStart: new Date('1970-01-01T16:00:00Z'),
        dayEnd: new Date('1970-01-01T20:00:00Z'),
      }),
    },
    participant: { ...fixture.database.participant, findMany: async () => [] },
  } as unknown as PrismaClient;
  const registry = new Registry();
  const app = buildApp(config, database, registry);
  const base = `/api/groups/${fixture.group.inviteCode}/polls/${fixture.poll.id}`;
  const headers = { 'x-participant-token': fixture.token };
  const requests = [
    { method: 'GET', url: base, route: pollRoute },
    { method: 'GET', url: `${base}/results?timeZone=UTC`, route: `${pollRoute}/results` },
    {
      method: 'PUT',
      url: `${base}/responses/me`,
      route: `${pollRoute}/responses/me`,
      headers,
      payload: { intervals: [] },
    },
    {
      method: 'POST',
      url: `${base}/responses/me/confirm`,
      route: `${pollRoute}/responses/me/confirm`,
      headers,
    },
  ] as const;
  await app.ready();
  return { app, registry, database, fixture, requests, base };
}

void test('plugin exports HTTP buckets alongside business metrics', async (t) => {
  const { app, registry, requests } = await routeApp();
  const metricsApp = buildMetricsApp(registry);
  t.after(() => Promise.all([app.close(), metricsApp.close()]));
  assert.equal((await app.inject(requests[0])).statusCode, 200);
  const response = await metricsApp.inject('/metrics');
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'] ?? '', /application\/openmetrics-text/);
  assert.match(response.body, new RegExp(`# TYPE ${metricName} histogram`));
  assert.match(response.body, /raincheck_groups_created_total/);
  assert.match(response.body, /process_cpu_user_seconds_total/);
  assert.doesNotMatch(response.body, /http_request_summary_seconds|raincheck_operation_duration/);
  const values = (await histogram(registry).get()).values;
  assert.deepEqual(
    values.filter((value) => value.labels.le !== undefined).map((value) => value.labels.le),
    [0.1, 0.2, 0.3, 0.5, 0.75, 1, 2, 5, 10, '+Inf'],
  );
  assert.deepEqual(Object.keys(values[0]?.labels ?? {}).sort(), [
    'le',
    'method',
    'route',
    'status_code',
  ]);
});

void test('each scenario request is observed once with method, route and status', async (t) => {
  const { app, registry, fixture, requests } = await routeApp();
  t.after(() => app.close());
  t.mock.method(IntervalService.prototype, 'replace', async () => {});
  t.mock.method(ResponseService.prototype, 'confirm', async () => ({
    ...fixture.response,
    state: 'CONFIRMED',
    confirmedAt: fixture.now,
  }));
  for (const request of requests) {
    const response = await app.inject(request);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(await sample(registry, request, 200), 1);
  }
});

void test('HTTP errors are observed once without losing the application error', async (t) => {
  const { app, registry, database, requests } = await routeApp();
  t.after(() => app.close());
  t.mock.method(database.group, 'findUnique', async () => {
    throw new Error('database down');
  });
  for (const request of requests) {
    const response = await app.inject(request);
    assert.equal(response.statusCode, 500, response.body);
    assert.equal(response.json().error.code, 'INTERNAL_ERROR');
    assert.equal(response.json().error.requestId, response.headers['x-request-id']);
    assert.equal(await sample(registry, request, 500), 1);
    assert.equal(await sample(registry, request, 200), undefined);
  }
});

void test('client and validation errors are measured before the handler succeeds', async (t) => {
  const { app, registry, requests } = await routeApp();
  t.after(() => app.close());
  const save = requests[2];
  assert.equal((await app.inject({ ...save, headers: {} })).statusCode, 401);
  assert.equal(await sample(registry, save, 401), 1);
  assert.equal((await app.inject({ ...save, payload: {} })).statusCode, 400);
  assert.equal(await sample(registry, save, 400), 1);
});

void test('timing includes database waits and final readback on success or failure', async (t) => {
  const { app, registry, fixture, database, requests } = await routeApp();
  t.after(() => app.close());
  t.mock.method(IntervalService.prototype, 'replace', async () => {});
  t.mock.method(ResponseService.prototype, 'confirm', async () => ({
    ...fixture.response,
    state: 'CONFIRMED',
    confirmedAt: fixture.now,
  }));
  let failReadback = false;
  t.mock.method(database.availabilityInterval, 'findMany', async () => {
    await setTimeout(30);
    if (failReadback) throw new Error('readback failed');
    return [];
  });
  t.mock.method(database.group, 'findUnique', async () => {
    await setTimeout(30);
    return fixture.group;
  });
  for (const request of requests) {
    assert.equal((await app.inject(request)).statusCode, 200);
    assert.ok(((await sample(registry, request, 200, 'sum')) ?? 0) >= 0.02);
  }
  failReadback = true;
  for (const request of requests.slice(2)) {
    assert.equal((await app.inject(request)).statusCode, 500);
    assert.equal(await sample(registry, request, 500), 1);
    assert.ok(((await sample(registry, request, 500, 'sum')) ?? 0) >= 0.04);
  }
});

void test('health and scrapes are excluded and unknown paths never become labels', async (t) => {
  const registry = new Registry();
  const app = buildApp(config, { isAvailable: async () => true, close: async () => {} }, registry);
  const metricsApp = buildMetricsApp(registry);
  t.after(() => Promise.all([app.close(), metricsApp.close()]));
  assert.equal((await app.inject('/health/live')).statusCode, 200);
  assert.equal((await app.inject('/health/ready')).statusCode, 200);
  await metricsApp.inject('/metrics');
  assert.deepEqual((await histogram(registry).get()).values, []);
  for (const url of ['/missing/invite-secret?token=token-secret', '/another/secret']) {
    assert.equal((await app.inject(url)).statusCode, 404);
  }
  assert.equal(await sample(registry, { method: 'GET', route: '__unknown__' }, 404), 2);
  assert.doesNotMatch(
    JSON.stringify(await histogram(registry).get()),
    /invite-secret|token-secret/,
  );
  assert.equal((await app.inject('/metrics')).statusCode, 404);
});

void test('application instances have independent HTTP registries', async (t) => {
  const first = await routeApp();
  const second = await routeApp();
  t.after(() => Promise.all([first.app.close(), second.app.close()]));
  await first.app.inject(first.requests[0]);
  assert.equal(await sample(first.registry, first.requests[0], 200), 1);
  assert.equal(await sample(second.registry, second.requests[0], 200), undefined);
});
