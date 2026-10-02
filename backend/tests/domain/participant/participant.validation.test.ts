import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateParticipant } from '#domain/participant/participant.validation';

void test('normalizes whitespace in a participant name', () => {
  assert.deepEqual(validateParticipant('  Alice   Smith  '), {
    displayName: 'Alice Smith',
    displayNameNormalized: 'alice smith',
  });
});

void test('rejects a blank participant name', () => {
  assert.throws(() => validateParticipant('   '), /name/i);
});
