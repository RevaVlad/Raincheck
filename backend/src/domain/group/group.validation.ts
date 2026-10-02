import { LIMITS } from '#shared/constants';
import type { GroupInput } from './group.js';

export function validateGroup(input: GroupInput): GroupInput {
  const name = normalizeGroupName(input.name);
  ensureGroupNameIsPresent(name);
  ensureGroupNameFits(name);
  return { name };
}

function normalizeGroupName(name: string): string {
  return name.trim();
}

function ensureGroupNameIsPresent(name: string): void {
  if (!name) throw new RangeError('Group name is required');
}

function ensureGroupNameFits(name: string): void {
  if (Array.from(name).length > LIMITS.GROUP_NAME) {
    throw new RangeError(`Group name must contain at most ${LIMITS.GROUP_NAME} characters`);
  }
}
