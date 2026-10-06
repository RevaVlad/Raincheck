import { LIMITS } from '#shared/constants';
import { AVATAR_COLORS, type AvatarColor, type ValidParticipantName } from './participant.js';

export function validateAvatarColor(value: string): AvatarColor {
  if (!(AVATAR_COLORS as readonly string[]).includes(value)) {
    throw new RangeError('Participant avatar color is invalid');
  }
  return value as AvatarColor;
}

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
