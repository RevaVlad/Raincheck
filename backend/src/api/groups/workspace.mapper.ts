import { toPollDto } from '../polls/poll.mapper.js';
import { toGroupDto } from './group.mapper.js';
import { toParticipantDto } from '../participants/participant.mapper.js';

export function toWorkspaceDto(data: {
  group: { id: string; name: string; inviteCode: string };
  me: { id: string; displayName: string; avatarColor: string } | null;
  participants: Array<{
    id: string;
    displayName: string;
    avatarColor: string;
    currentPollState: string;
  }>;
  polls: Parameters<typeof toPollDto>[0][];
  currentPoll: Parameters<typeof toPollDto>[0] | null;
}) {
  return {
    group: toGroupDto(data.group),
    me: data.me ? toParticipantDto(data.me) : null,
    participants: data.participants.map((participant) => ({
      ...toParticipantDto(participant),
      currentPollState: participant.currentPollState,
    })),
    polls: data.polls.map((poll) => toPollDto(poll)),
    currentPoll: data.currentPoll ? toPollDto(data.currentPoll, true) : null,
  };
}
