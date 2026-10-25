import type { IntervalInput } from '#domain/interval/interval';
import type { OptionalParticipantTokenHeadersDto, PollParamsDto } from '../common/request.types.js';

export interface ReplaceIntervalsBodyDto {
  intervals: Required<IntervalInput>[];
}

export type ResponseRoute = { Params: PollParamsDto; Headers: OptionalParticipantTokenHeadersDto };
export type ReplaceResponseRoute = ResponseRoute & { Body: ReplaceIntervalsBodyDto };
