export interface Participant {
  id: string;
  groupId: string;
  displayName: string;
  displayNameNormalized: string;
  editTokenHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ValidParticipantName {
  displayName: string;
  displayNameNormalized: string;
}
