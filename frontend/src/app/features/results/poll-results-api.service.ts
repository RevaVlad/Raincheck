import { httpResource } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { HttpResourceRef } from '@angular/common/http';
import { groupApiPath } from '../../core/api/api-http';
import type { PollResults } from '../../core/api/api.types';

@Injectable({ providedIn: 'root' })
export class PollResultsApiService {
  resultsResource(
    parameters: () => { inviteCode: string; pollId: string } | undefined,
  ): HttpResourceRef<PollResults | undefined> {
    return httpResource<PollResults>(() => {
      const params = parameters();
      if (!params?.inviteCode || !params.pollId) return undefined;
      return {
        url: `${groupApiPath(params.inviteCode)}/polls/${encodeURIComponent(
          params.pollId,
        )}/results`,
      };
    });
  }
}
