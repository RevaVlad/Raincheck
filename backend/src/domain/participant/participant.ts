export const AVATAR_COLORS = ['green', 'blue', 'purple', 'rose', 'yellow', 'gray'] as const;

export type AvatarColor = (typeof AVATAR_COLORS)[number];

export interface Participant {
  id: string;
  groupId: string;
  displayName: string;
  displayNameNormalized: string;
  avatarColor: AvatarColor;
  editTokenHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ValidParticipantName {
  displayName: string;
  displayNameNormalized: string;
}
