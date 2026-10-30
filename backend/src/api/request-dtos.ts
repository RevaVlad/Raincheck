import type { IntervalInput } from '#domain/interval/interval';
import type { AvatarColor } from '#domain/participant/participant';
import type { PollInput } from '#domain/poll/poll';

export interface InviteCodeParamsDto {
  inviteCode: string;
}

export interface PollParamsDto extends InviteCodeParamsDto {
  pollId: string;
}

export interface ViewerTimeZoneQueryDto {
  timeZone: string;
}

export interface ParticipantTokenHeadersDto {
  'x-participant-token': string;
}

export interface OptionalParticipantTokenHeadersDto {
  'x-participant-token'?: string;
}

export interface CreateGroupBodyDto {
  name: string;
}

export interface ParticipantProfileBodyDto {
  displayName: string;
  avatarColor: AvatarColor;
}

export type CreatePollBodyDto = PollInput;

export interface ReplaceIntervalsBodyDto {
  intervals: Required<IntervalInput>[];
}
