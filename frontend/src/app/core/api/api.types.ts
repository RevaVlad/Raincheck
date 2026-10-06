// Hand-maintained frontend types for the API contract in api/openapi.yaml.
export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'GROUP_NOT_FOUND'
  | 'POLL_NOT_FOUND'
  | 'RESPONSE_NOT_FOUND'
  | 'PARTICIPANT_NAME_TAKEN'
  | 'RESPONSE_ALREADY_EXISTS'
  | 'POLL_STATE_CONFLICT'
  | 'INVALID_SCHEDULE'
  | 'INTERNAL_ERROR';

export type ApiErrorResponse = {
  error: { code: ApiErrorCode; message: string; requestId: string };
};

export type Group = { id: string; name: string; inviteCode: string; timezone: 'UTC' };
export type AvatarColor = 'green' | 'blue' | 'purple' | 'rose' | 'yellow' | 'gray';
export type Participant = { id: string; displayName: string; avatarColor: AvatarColor };
export type ParticipantInput = { displayName: string; avatarColor: AvatarColor };
export type ParticipantProfileResponse = { participant: Participant };
export type WorkspaceParticipant = {
  id: string;
  displayName: string;
  avatarColor: AvatarColor;
  currentPollState: 'NONE' | 'DRAFT' | 'CONFIRMED';
};

export type PollInput = {
  title?: string | null;
  startsOn: string;
  endsOn: string;
  dayStart: string;
  dayEnd: string;
  slotMinutes: 30 | 60;
  meetingDurationMinutes: number;
};

export type Poll = {
  id: string;
  sequenceNo: number;
  title?: string | null;
  startsOn: string;
  endsOn: string;
  dayStart: string;
  dayEnd: string;
  slotMinutes: 30 | 60;
  meetingDurationMinutes: number;
  status: 'OPEN' | 'CLOSED';
  basedOnPollId: string | null;
  createdAt: string;
  closedAt: string | null;
};

export type IntervalInput = {
  localDate: string;
  startTime: string;
  endTime: string;
  kind: 'UNAVAILABLE' | 'IF_NEEDED' | 'PREFERRED';
  preferenceDirection: 'EARLIER' | 'FLAT' | 'LATER' | null;
};
export type Interval = IntervalInput & { id: string };
export type ParticipantResponse = {
  id: string;
  state: 'DRAFT' | 'CONFIRMED';
  confirmedAt: string | null;
  intervals: Interval[];
};
export type ReplaceResponseRequest = { intervals: IntervalInput[] };

export type CreateGroupRequest = {
  name: string;
};
export type CreateGroupResponse = {
  group: Group;
  currentPoll: null;
};
export type PollMutationResponse = { poll: Poll };
export type JoinResponse = { participant: Participant; participantEditToken: string };

export type PublicGroupDto = { name: string; timezone: 'UTC' };
export type PublicCurrentPollDto = {
  id: string;
  sequenceNo: number;
  startsOn: string;
  endsOn: string;
};
export type PublicGroupResponse = {
  group: PublicGroupDto;
  currentPoll: PublicCurrentPollDto | null;
};

export type Workspace = {
  group: Group;
  me: Participant | null;
  participants: WorkspaceParticipant[];
  polls: Poll[];
  currentPoll: Poll | null;
};

export type HeatmapCell = {
  localDate: string;
  startTime: string;
  endTime: string;
  available: number;
  ifNeeded: number;
  preferred: number;
  unavailable: number;
  averageSoftScore: number;
};
export type BestSlot = {
  localDate: string;
  startTime: string;
  endTime: string;
  available: number;
  ifNeeded: number;
  averageSoftScore: number;
  stars: number;
};
export type PollResults = {
  participantSummary: { total: number; confirmed: number; pending: number };
  heatmap: HeatmapCell[];
  bestSlots: BestSlot[];
  participants: Array<{
    id: string;
    displayName: string;
    state: 'NONE' | 'DRAFT' | 'CONFIRMED';
  }>;
};
