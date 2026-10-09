export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: Date;
}

export interface GroupInput {
  name: string;
}
