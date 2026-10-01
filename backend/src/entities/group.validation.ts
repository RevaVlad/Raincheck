import { LIMITS } from '#shared/constants';

export function validateGroupName(value: string): string {
  const name = value.trim();
  if (Array.from(name).length < 1 || Array.from(name).length > LIMITS.GROUP_NAME) {
    throw new RangeError(`Group name must contain 1 to ${LIMITS.GROUP_NAME} characters`);
  }
  return name;
}
