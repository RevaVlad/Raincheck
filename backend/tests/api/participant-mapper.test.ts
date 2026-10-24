import assert from 'node:assert/strict';
import test from 'node:test';
import { toParticipantDto } from '../../src/api/participants/participant.mapper.js';

void test('participant DTO validates the color and never exposes stored token hashes', () => {
  const dto = toParticipantDto({
    id: 'p1',
    displayName: 'Alice',
    avatarColor: 'green',
    editTokenHash: 'secret',
  } as Parameters<typeof toParticipantDto>[0]);
  assert.deepEqual(dto, { id: 'p1', displayName: 'Alice', avatarColor: 'green' });
  assert.equal('editTokenHash' in dto, false);
});
