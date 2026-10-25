import { validateAvatarColor } from '#domain/participant/participant.validation';

export function toParticipantDto(participant: {
  id: string;
  displayName: string;
  avatarColor: string;
}) {
  return {
    id: participant.id,
    displayName: participant.displayName,
    avatarColor: validateAvatarColor(participant.avatarColor),
  };
}

export function toJoinedParticipantDto(created: {
  participant: { id: string; displayName: string; avatarColor: string };
  editToken: string;
}) {
  return {
    participant: toParticipantDto(created.participant),
    participantEditToken: created.editToken,
  };
}
