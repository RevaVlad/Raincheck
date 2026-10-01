import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IntervalEntity } from '#infrastructure/database/entities/interval.entity';
import { ResponseEntity } from '#infrastructure/database/entities/response.entity';
import { inTransaction, persistedResponse } from '../../support/database.js';

const firstInterval = {
  localDate: '2026-10-06', startTime: '18:00', endTime: '19:00', kind: 'PREFERRED' as const,
};

test('replaces intervals and returns a confirmed response to draft', async () => {
  await inTransaction(async (context) => {
    const { response } = await persistedResponse(context);
    await context.intervals.replace(response.id, [firstInterval]);
    await context.responses.confirm(response.id);
    await context.intervals.replace(response.id, [{ ...firstInterval, kind: 'UNAVAILABLE' }]);
    context.em.clear();
    const saved = await context.em.findOneOrFail(ResponseEntity, response.id);
    assert.equal(saved.state, 'DRAFT');
    assert.equal(saved.confirmedAt, null);
  });
});

test('preserves stored intervals when a replacement is unchanged', async () => {
  await inTransaction(async (context) => {
    const { response } = await persistedResponse(context);
    const [first] = await context.intervals.replace(response.id, [firstInterval]);
    const [second] = await context.intervals.replace(response.id, [firstInterval]);
    assert.equal(second?.id, first?.id);
    assert.equal(second?.createdAt.toISOString(), first?.createdAt.toISOString());
  });
});

test('rolls back an invalid interval replacement', async () => {
  await inTransaction(async (context) => {
    const { response } = await persistedResponse(context);
    await context.intervals.replace(response.id, [firstInterval]);
    await context.responses.confirm(response.id);
    await assert.rejects(() => context.intervals.replace(response.id, [
      firstInterval, { ...firstInterval, startTime: '18:30', endTime: '19:30' },
    ]), /overlap/i);
    context.em.clear();
    const saved = await context.em.findOneOrFail(ResponseEntity, response.id);
    const intervals = await context.em.find(IntervalEntity, { response: response.id });
    assert.equal(saved.state, 'CONFIRMED');
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0]?.startTime.slice(0, 5), '18:00');
  });
});

test('rejects interval changes after a poll closes', async () => {
  await inTransaction(async (context) => {
    const { poll, response } = await persistedResponse(context);
    await context.polls.close(poll.id);
    await assert.rejects(() => context.intervals.replace(response.id, [firstInterval]), /open poll/i);
  });
});
