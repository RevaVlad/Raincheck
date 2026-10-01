import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysInclusive, utcTimeMinutes } from '#shared/utils/time';

test('UTC date math stays stable across a daylight-saving change', () => {
  const previousZone = process.env['TZ'];
  try {
    process.env['TZ'] = 'Europe/Berlin';
    assert.equal(daysInclusive('2026-03-28', '2026-03-30'), 3);
    assert.equal(utcTimeMinutes('23:30'), 23 * 60 + 30);
  } finally {
    if (previousZone === undefined) delete process.env['TZ'];
    else process.env['TZ'] = previousZone;
  }
});
