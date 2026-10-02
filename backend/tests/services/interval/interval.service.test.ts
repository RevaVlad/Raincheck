import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inTransaction, persistedResponse } from '../../support/database.js';

const firstInterval = {
  localDate: '2026-10-06',
  startTime: '18:00',
  endTime: '19:00',
  kind: 'PREFERRED' as const,
};

void test('replaces intervals and returns a confirmed response to draft', async () => {
  await inTransaction(async (context) => {
    const { response } = await persistedResponse(context);
    await context.intervals.replace(response.id, [firstInterval]);
    await context.responses.confirm(response.id);
    await context.intervals.replace(response.id, [{ ...firstInterval, kind: 'UNAVAILABLE' }]);
    const saved = await context.probe.responseState(response.id);
    assert.equal(saved.state, 'DRAFT');
    assert.equal(saved.confirmedAt, null);
  });
});

void test('preserves stored intervals when a replacement is unchanged', async () => {
  await inTransaction(async (context) => {
    const { response } = await persistedResponse(context);
    const createdAt = new Date('2026-10-01T10:00:00.000Z');
    const confirmedAt = new Date('2026-10-01T11:00:00.000Z');
    const [first] = await context.intervals.replace(response.id, [firstInterval], createdAt);
    await context.responses.confirm(response.id, confirmedAt);
    const [second] = await context.intervals.replace(
      response.id,
      [firstInterval],
      new Date('2026-10-01T12:00:00.000Z'),
    );
    const saved = await context.probe.responseState(response.id);
    assert.ok(first);
    assert.ok(second);
    assert.equal(second.id, first.id);
    assert.equal(second.createdAt.toISOString(), first.createdAt.toISOString());
    assert.equal(saved.state, 'CONFIRMED');
    assert.equal(saved.confirmedAt?.toISOString(), confirmedAt.toISOString());
  });
});

void test('rolls back an invalid interval replacement', async () => {
  await inTransaction(async (context) => {
    const { response } = await persistedResponse(context);
    await context.intervals.replace(response.id, [firstInterval]);
    await context.responses.confirm(response.id);
    await assert.rejects(
      () =>
        context.intervals.replace(response.id, [
          firstInterval,
          { ...firstInterval, startTime: '18:30', endTime: '19:30' },
        ]),
      /overlap/i,
    );
    const saved = await context.probe.responseState(response.id);
    const intervals = await context.probe.storedIntervals(response.id);
    assert.equal(saved.state, 'CONFIRMED');
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0]?.startTime, '18:00');
  });
});

void test('rejects interval changes after a poll closes', async () => {
  await inTransaction(async (context) => {
    const { poll, response } = await persistedResponse(context);
    await context.polls.close(poll.id);
    await assert.rejects(
      () => context.intervals.replace(response.id, [firstInterval]),
      /open poll/i,
    );
  });
});
