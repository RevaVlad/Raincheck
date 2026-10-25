import type { AvailabilityInterval } from '#domain/interval/interval';
import type { PollResponse } from '#domain/response/response';

export interface ResponseDetails {
  response: PollResponse;
  intervals: AvailabilityInterval[];
}
