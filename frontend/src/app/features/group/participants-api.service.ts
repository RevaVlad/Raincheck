import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { groupApiPath } from '../../core/api/api-http';
import type { JoinResponse, ParticipantInput } from '../../core/api/api.types';

@Injectable({ providedIn: 'root' })
export class ParticipantsApiService {
  private readonly http = inject(HttpClient);

  joinGroup(inviteCode: string, body: ParticipantInput): Observable<JoinResponse> {
    return this.http.post<JoinResponse>(`${groupApiPath(inviteCode)}/participants`, body);
  }
}
