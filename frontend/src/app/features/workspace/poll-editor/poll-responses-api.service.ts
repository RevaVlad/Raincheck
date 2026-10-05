import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { groupApiPath, participantTokenHeaders } from '../../../core/api/api-http';
import type { ParticipantResponse, ReplaceResponseRequest } from '../../../core/api/api.types';

@Injectable({ providedIn: 'root' })
export class PollResponsesApiService {
  private readonly http = inject(HttpClient);

  getMyResponse(
    inviteCode: string,
    pollId: string,
    token: string,
  ): Observable<ParticipantResponse> {
    return this.http.get<ParticipantResponse>(this.responsePath(inviteCode, pollId), {
      headers: participantTokenHeaders(token),
    });
  }

  createMyResponse(
    inviteCode: string,
    pollId: string,
    token: string,
  ): Observable<ParticipantResponse> {
    return this.http.post<ParticipantResponse>(this.responsePath(inviteCode, pollId), null, {
      headers: participantTokenHeaders(token),
    });
  }

  replaceMyResponse(
    inviteCode: string,
    pollId: string,
    token: string,
    body: ReplaceResponseRequest,
  ): Observable<ParticipantResponse> {
    return this.http.put<ParticipantResponse>(this.responsePath(inviteCode, pollId), body, {
      headers: participantTokenHeaders(token),
    });
  }

  confirmMyResponse(
    inviteCode: string,
    pollId: string,
    token: string,
  ): Observable<ParticipantResponse> {
    return this.http.post<ParticipantResponse>(
      `${this.responsePath(inviteCode, pollId)}/confirm`,
      null,
      {
        headers: participantTokenHeaders(token),
      },
    );
  }

  private responsePath(inviteCode: string, pollId: string): string {
    return `${groupApiPath(inviteCode)}/polls/${encodeURIComponent(pollId)}/responses/me`;
  }
}
