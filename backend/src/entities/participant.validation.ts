import { LIMITS } from '#shared/constants';

export function validateDisplayName(value: string): string {
  const name = value.trim().replace(/\s+/gu, ' ');
  if (Array.from(name).length < 1 || Array.from(name).length > LIMITS.PARTICIPANT_NAME) {
    throw new RangeError(`Participant display name must contain 1 to ${LIMITS.PARTICIPANT_NAME} characters`);
  }
  return name;
}
