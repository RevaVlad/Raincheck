import type { ResponseDetails, ResponseDto } from './response.dto.js';

export function toResponseDto(details: ResponseDetails): ResponseDto {
  return {
    id: details.response.id,
    state: details.response.state,
    confirmedAt: details.response.confirmedAt?.toISOString() ?? null,
    intervals: details.intervals,
  };
}
