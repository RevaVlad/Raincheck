import type { INTERVAL_KIND, PREFERENCE_DIRECTION } from '#shared/constants';
import type { Poll } from '#domain/poll/poll';

export type PollWindow = Pick<
  Poll,
  'startsOn' | 'endsOn' | 'dayStart' | 'dayEnd' | 'slotMinutes' | 'timeZone' | 'createdAt'
>;
export type IntervalKind = (typeof INTERVAL_KIND)[keyof typeof INTERVAL_KIND];
export type PreferenceDirection = (typeof PREFERENCE_DIRECTION)[keyof typeof PREFERENCE_DIRECTION];

interface IntervalFields {
  id: string;
  responseId: string;
  startAt: string;
  endAt: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AvailabilityInterval = IntervalFields &
  (
    | { kind: 'PREFERRED'; preferenceDirection: PreferenceDirection }
    | { kind: 'UNAVAILABLE' | 'IF_NEEDED'; preferenceDirection: null }
  );

export interface IntervalInput {
  startAt: string;
  endAt: string;
  kind: IntervalKind;
  preferenceDirection?: PreferenceDirection | null;
}
