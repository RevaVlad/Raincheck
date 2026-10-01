import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateGroup } from '#domain/group/group.validation';

test('normalizes surrounding whitespace in a group name', () => {
  assert.deepEqual(validateGroup({ name: '  Team  ' }), { name: 'Team' });
});

test('rejects a blank group name', () => {
  assert.throws(() => validateGroup({ name: '   ' }), /name/i);
});
