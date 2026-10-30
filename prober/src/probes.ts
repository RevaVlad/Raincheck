import { AssertionError } from 'node:assert/strict';
import { checkResponse, groupPath, pollPath, request } from './http.js';
import type {
  Config,
  ParticipantResponse,
  PollResponse,
  PreparedTestData,
  ProbeFixture,
  ResultsResponse,
  WorkspaceResponse,
} from './types.js';

export async function checkPoll(config: Config): Promise<void> {
  const response = await request<PollResponse>(config, pollPath(config));

  checkResponse(response, { poll: { id: config.pollId, status: 'OPEN' } });
}

async function prepareTestData(config: Config): Promise<PreparedTestData> {
  const workspace = await request<WorkspaceResponse>(config, `${groupPath(config)}/workspace`);
  const slot = workspace.currentPoll?.slots[0];

  if (!workspace.me || !workspace.currentPoll || !slot) {
    throw new AssertionError({ message: 'Test participant and open poll with slots are required' });
  }
  checkResponse(workspace, { currentPoll: { id: config.pollId } });

  return {
    fixture: { participantId: workspace.me.id, slots: workspace.currentPoll.slots },
    responseBody: {
      intervals: [{ ...slot, kind: 'IF_NEEDED', preferenceDirection: null }],
    },
  };
}

export async function checkSaveResponse(config: Config): Promise<ProbeFixture> {
  const { fixture, responseBody } = await prepareTestData(config);
  const path = `${pollPath(config)}/responses/me`;

  const draft = await request<ParticipantResponse>(config, path, 'POST', [201]);
  checkResponse(draft, { state: 'DRAFT', confirmedAt: null, intervals: [] });
  if (!draft.id) throw new AssertionError({ message: 'Created response must have an id' });

  const expected = { id: draft.id, state: 'DRAFT', confirmedAt: null, ...responseBody };

  const saved = await request<ParticipantResponse>(config, path, 'PUT', [200], responseBody);
  checkResponse(saved, expected);

  const read = await request<ParticipantResponse>(config, path);
  checkResponse(read, expected);

  return fixture;
}

export async function checkResults(config: Config, fixture: ProbeFixture): Promise<void> {
  const response = await request<ResultsResponse>(
    config,
    `${pollPath(config)}/results?timeZone=Europe%2FBerlin`,
  );

  checkResponse(response, {
    participantSummary: { total: 1, confirmed: 0, pending: 1 },
    participants: [{ id: fixture.participantId, state: 'DRAFT' }],
    bestSlots: [],
    heatmap: fixture.slots.map((slot) => ({
      ...slot,
      available: 0,
      ifNeeded: 0,
      preferred: 0,
      unavailable: 0,
      averageSoftScore: 0,
    })),
  });
}
