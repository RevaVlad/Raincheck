export interface Config {
  apiUrl: string;
  inviteCode: string;
  pollId: string;
  token: string;
  intervalMs: number;
  port: number;
}

export interface PollSlot {
  startAt: string;
  endAt: string;
}

export interface Poll {
  id: string;
  status: 'OPEN' | 'CLOSED';
}

export interface PollWithSlots extends Poll {
  slots: PollSlot[];
}

export interface PollResponse {
  poll: Poll;
}

export interface Participant {
  id: string;
  displayName: string;
}

export interface WorkspaceResponse {
  me: Participant | null;
  currentPoll: PollWithSlots | null;
}

export interface AvailabilityInterval extends PollSlot {
  kind: 'UNAVAILABLE' | 'IF_NEEDED' | 'PREFERRED';
  preferenceDirection: 'EARLIER' | 'FLAT' | 'LATER' | null;
}

export interface SaveIntervalsRequest {
  intervals: AvailabilityInterval[];
}

export interface ParticipantResponse extends SaveIntervalsRequest {
  id: string;
  state: 'DRAFT' | 'CONFIRMED';
  confirmedAt: string | null;
}

export interface ParticipantSummary {
  total: number;
  confirmed: number;
  pending: number;
}

export interface ResultParticipant extends Participant {
  state: 'NONE' | 'DRAFT' | 'CONFIRMED';
}

export interface HeatmapCell extends PollSlot {
  available: number;
  ifNeeded: number;
  preferred: number;
  unavailable: number;
  averageSoftScore: number;
}

export interface BestSlot extends PollSlot {
  available: number;
  ifNeeded: number;
  averageSoftScore: number;
  stars: number;
}

export interface ResultsResponse {
  participantSummary: ParticipantSummary;
  participants: ResultParticipant[];
  heatmap: HeatmapCell[];
  bestSlots: BestSlot[];
}

export interface ProbeFixture {
  participantId: string;
  slots: PollSlot[];
}

export interface PreparedTestData {
  fixture: ProbeFixture;
  responseBody: SaveIntervalsRequest;
}

export type ProbeOperation = 'poll_read' | 'availability_save' | 'common_slots';
export type ProbeResult = 'success' | 'slow' | 'timeout' | 'error' | 'invalid_result';
export type ProbeOutcome<T> = { value: T; error?: never } | { error: Error; value?: never };
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
