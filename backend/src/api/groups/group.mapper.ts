export interface GroupPreviewData {
  group: { name: string };
  currentPoll: { id: string; sequenceNo: number; startsOn: Date; endsOn: Date } | null;
}

export function toGroupDto(group: { id: string; name: string; inviteCode: string }) {
  return { id: group.id, name: group.name, inviteCode: group.inviteCode };
}

export function toGroupPreviewDto(preview: GroupPreviewData) {
  const poll = preview.currentPoll;
  return {
    group: { name: preview.group.name },
    currentPoll: poll
      ? {
          id: poll.id,
          sequenceNo: poll.sequenceNo,
          startsOn: poll.startsOn.toISOString().slice(0, 10),
          endsOn: poll.endsOn.toISOString().slice(0, 10),
        }
      : null,
  };
}
