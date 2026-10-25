import type { AvatarColor } from '#domain/participant/participant';
import type { InviteCodeParamsDto, ParticipantTokenHeadersDto } from '../common/request.types.js';

export interface ParticipantProfileBodyDto {
  displayName: string;
  avatarColor: AvatarColor;
}
export type JoinParticipantRequest = {
  Params: InviteCodeParamsDto;
  Body: ParticipantProfileBodyDto;
};
export type UpdateParticipantRequest = JoinParticipantRequest & {
  Headers: ParticipantTokenHeadersDto;
};
export type {
  ParticipantTokenHeadersDto,
  OptionalParticipantTokenHeadersDto,
} from '../common/request.types.js';
