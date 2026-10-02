// Hand-maintained frontend types for the API contract in api/openapi.yaml.
export type components = {
  schemas: {
    Error: {
      error: {
        code:
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
        message: string;
        requestId: string;
      };
    };
    Group: { id: string; name: string; inviteCode: string; timezone: 'UTC' };
    Participant: { id: string; displayName: string };
    ParticipantInput: { displayName: string };
    PollInput: {
      title?: string | null;
      startsOn: string;
      endsOn: string;
      dayStart: string;
      dayEnd: string;
      slotMinutes: 30 | 60;
      meetingDurationMinutes: number;
    };
    Poll: {
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
    IntervalInput: {
      localDate: string;
      startTime: string;
      endTime: string;
      kind: 'UNAVAILABLE' | 'IF_NEEDED' | 'PREFERRED';
      preferenceDirection: 'EARLIER' | 'FLAT' | 'LATER' | null;
    };
    Interval: components['schemas']['IntervalInput'] & { id: string };
    Response: {
      id: string;
      state: 'DRAFT' | 'CONFIRMED';
      confirmedAt: string | null;
      intervals: components['schemas']['Interval'][];
    };
    CreateGroupRequest: {
      name: string;
      creatorDisplayName: string;
      timezone?: 'UTC';
      firstPoll: components['schemas']['PollInput'];
    };
    CreateGroupResponse: {
      group: components['schemas']['Group'];
      participant: components['schemas']['Participant'];
      participantEditToken: string;
      currentPoll: components['schemas']['Poll'];
    };
    JoinResponse: {
      participant: components['schemas']['Participant'];
      participantEditToken: string;
    };
    PublicGroupDto: { name: string; timezone: 'UTC' };
    PublicCurrentPollDto: {
      id: string;
      sequenceNo: number;
      startsOn: string;
      endsOn: string;
    };
    PublicGroupResponse: {
      group: components['schemas']['PublicGroupDto'];
      currentPoll: components['schemas']['PublicCurrentPollDto'] | null;
    };
    WorkspaceParticipant: {
      id: string;
      displayName: string;
      currentPollState: 'NONE' | 'DRAFT' | 'CONFIRMED';
    };
    Workspace: {
      group: components['schemas']['Group'];
      me: components['schemas']['Participant'] | null;
      participants: components['schemas']['WorkspaceParticipant'][];
      polls: components['schemas']['Poll'][];
      currentPoll: components['schemas']['Poll'] | null;
    };
    Results: {
      participantSummary: { total: number; confirmed: number; pending: number };
      heatmap: components['schemas']['HeatmapCell'][];
      bestSlots: components['schemas']['BestSlot'][];
    };
    HeatmapCell: {
      localDate: string;
      startTime: string;
      endTime: string;
      available: number;
      ifNeeded: number;
      preferred: number;
      unavailable: number;
      averageSoftScore: number;
    };
    BestSlot: {
      localDate: string;
      startTime: string;
      endTime: string;
      available: number;
      ifNeeded: number;
      averageSoftScore: number;
      stars: number;
    };
  };
};

export type ReplaceResponseRequest = {
  intervals: components['schemas']['IntervalInput'][];
};
