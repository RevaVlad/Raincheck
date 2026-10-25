import type { PollInput } from '#domain/poll/poll';

import type {
  InviteCodeParamsDto,
  OptionalParticipantTokenHeadersDto,
} from '../common/request.types.js';
export type {
  InviteCodeParamsDto,
  PollParamsDto,
  OptionalParticipantTokenHeadersDto,
} from '../common/request.types.js';
export type CreatePollBodyDto = PollInput;
export type CreatePollRequest = {
  Params: InviteCodeParamsDto;
  Headers: OptionalParticipantTokenHeadersDto;
  Body: CreatePollBodyDto;
};
