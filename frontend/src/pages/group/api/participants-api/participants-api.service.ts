import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { groupApiPath, participantTokenHeaders } from '@shared/api';
import type { JoinResponse, ParticipantInput, ParticipantProfileResponse } from '@shared/api';

@Injectable({ providedIn: 'root' })
export class ParticipantsApiService {
  private readonly http = inject(HttpClient);

  joinGroup(inviteCode: string, body: ParticipantInput): Observable<JoinResponse> {
    return this.http.post<JoinResponse>(`${groupApiPath(inviteCode)}/participants`, body);
  }

  updateProfile(
    inviteCode: string,
    token: string,
    body: ParticipantInput,
  ): Observable<ParticipantProfileResponse> {
    return this.http.patch<ParticipantProfileResponse>(
      `${groupApiPath(inviteCode)}/participants/me`,
      body,
      { headers: participantTokenHeaders(token) },
    );
  }
}
