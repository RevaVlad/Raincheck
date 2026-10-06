import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateAvatarColor,
  validateParticipant,
} from '#domain/participant/participant.validation';

void test('normalizes whitespace in a participant name', () => {
  assert.deepEqual(validateParticipant('  Alice   Smith  '), {
    displayName: 'Alice Smith',
    displayNameNormalized: 'alice smith',
  });
});

void test('rejects a blank participant name', () => {
  assert.throws(() => validateParticipant('   '), /name/i);
});

void test('accepts the six avatar colors and rejects all other values', () => {
  for (const color of ['green', 'blue', 'purple', 'rose', 'yellow', 'gray']) {
    assert.equal(validateAvatarColor(color), color);
  }
  assert.throws(() => validateAvatarColor('teal'), /color/i);
});
