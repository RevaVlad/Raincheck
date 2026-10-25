import type { ResponseDetails } from '#services/response/response-details';
export type { ResponseDetails } from '#services/response/response-details';

export type ResponseDto = {
  id: string;
  state: string;
  confirmedAt: string | null;
  intervals: ResponseDetails['intervals'];
};
