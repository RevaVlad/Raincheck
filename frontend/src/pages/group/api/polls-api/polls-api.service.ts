import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { groupApiPath, participantTokenHeaders } from '@shared/api';
import type { PollInput, PollMutationResponse } from '@shared/api';

@Injectable({ providedIn: 'root' })
export class PollsApiService {
  private readonly http = inject(HttpClient);

  createPoll(inviteCode: string, body: PollInput, token: string): Observable<PollMutationResponse> {
    return this.http.post<PollMutationResponse>(`${groupApiPath(inviteCode)}/polls`, body, {
      headers: participantTokenHeaders(token),
    });
  }

  closePoll(inviteCode: string, pollId: string, token: string): Observable<PollMutationResponse> {
    return this.http.post<PollMutationResponse>(
      `${groupApiPath(inviteCode)}/polls/${encodeURIComponent(pollId)}/close`,
      null,
      { headers: participantTokenHeaders(token) },
    );
  }
}
