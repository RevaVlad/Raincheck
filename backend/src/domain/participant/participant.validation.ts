import { LIMITS } from '#shared/constants';
import type { ValidParticipantName } from './participant.js';

export function validateParticipant(nameInput: string): ValidParticipantName {
  const displayName = normalizeDisplayName(nameInput);
  ensureDisplayNameIsPresent(displayName);
  ensureDisplayNameFits(displayName);
  return { displayName, displayNameNormalized: displayName.toLowerCase() };
}

function normalizeDisplayName(name: string): string {
  return name.trim().replace(/\s+/gu, ' ');
}

function ensureDisplayNameIsPresent(name: string): void {
  if (!name) throw new RangeError('Participant display name is required');
}

function ensureDisplayNameFits(name: string): void {
  if (Array.from(name).length > LIMITS.PARTICIPANT_NAME) {
    throw new RangeError(
      `Participant display name must contain at most ${LIMITS.PARTICIPANT_NAME} characters`,
    );
  }
}
