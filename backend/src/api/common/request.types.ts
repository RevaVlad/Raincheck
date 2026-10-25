export interface InviteCodeParamsDto {
  inviteCode: string;
}

export interface PollParamsDto extends InviteCodeParamsDto {
  pollId: string;
}

export interface ParticipantTokenHeadersDto {
  'x-participant-token': string;
}

export interface OptionalParticipantTokenHeadersDto {
  'x-participant-token'?: string;
}
