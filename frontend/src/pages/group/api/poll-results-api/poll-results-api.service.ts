import { httpResource } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { HttpResourceRef } from '@angular/common/http';
import { groupApiPath } from '@shared/api';
import type { PollResults } from '@shared/api';

@Injectable({ providedIn: 'root' })
export class PollResultsApiService {
  resultsResource(
    parameters: () => { inviteCode: string; pollId: string; timeZone: string } | undefined,
  ): HttpResourceRef<PollResults | undefined> {
    return httpResource<PollResults>(() => {
      const params = parameters();
      if (!params?.inviteCode || !params.pollId || !params.timeZone) return undefined;
      return {
        url: `${groupApiPath(params.inviteCode)}/polls/${encodeURIComponent(
          params.pollId,
        )}/results`,
        params: { timeZone: params.timeZone },
      };
    });
  }
}
