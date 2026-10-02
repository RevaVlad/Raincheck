import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { components, ReplaceResponseRequest } from './api.types';

type Schemas = components['schemas'];
export type CreateGroupRequest = Schemas['CreateGroupRequest'];
export type CreateGroupResponse = Schemas['CreateGroupResponse'];
export type JoinResponse = Schemas['JoinResponse'];
export type Workspace = Schemas['Workspace'];
export type Poll = Schemas['Poll'];
export type Participant = Schemas['Participant'];
export type WorkspaceParticipant = Schemas['WorkspaceParticipant'];
export type ParticipantResponse = Schemas['Response'];
export type ApiErrorCode = Schemas['Error']['error']['code'];
export type { ReplaceResponseRequest } from './api.types';

@Injectable({ providedIn: 'root' })
export class RaincheckApiService {
  private readonly http = inject(HttpClient);

  createGroup(body: CreateGroupRequest): Observable<CreateGroupResponse> {
    return this.http.post<CreateGroupResponse>('/api/groups', body);
  }

  getWorkspace(inviteCode: string, token?: string): Observable<Workspace> {
    return this.http.get<Workspace>(`${this.groupPath(inviteCode)}/workspace`, {
      headers: token ? this.participantHeaders(token) : undefined,
    });
  }

  joinGroup(inviteCode: string, body: Schemas['ParticipantInput']): Observable<JoinResponse> {
    return this.http.post<JoinResponse>(`${this.groupPath(inviteCode)}/participants`, body);
  }

  getMyResponse(inviteCode: string, pollId: string, token: string): Observable<ParticipantResponse> {
    return this.http.get<ParticipantResponse>(this.responsePath(inviteCode, pollId), {
      headers: this.participantHeaders(token),
    });
  }

  createMyResponse(
    inviteCode: string,
    pollId: string,
    token: string,
  ): Observable<ParticipantResponse> {
    return this.http.post<ParticipantResponse>(this.responsePath(inviteCode, pollId), null, {
      headers: this.participantHeaders(token),
    });
  }

  replaceMyResponse(
    inviteCode: string,
    pollId: string,
    token: string,
    body: ReplaceResponseRequest,
  ): Observable<ParticipantResponse> {
    return this.http.put<ParticipantResponse>(this.responsePath(inviteCode, pollId), body, {
      headers: this.participantHeaders(token),
    });
  }

  confirmMyResponse(
    inviteCode: string,
    pollId: string,
    token: string,
  ): Observable<ParticipantResponse> {
    return this.http.post<ParticipantResponse>(`${this.responsePath(inviteCode, pollId)}/confirm`, null, {
      headers: this.participantHeaders(token),
    });
  }

  static errorCode(error: unknown): ApiErrorCode | null {
    if (!(error instanceof HttpErrorResponse)) return null;
    const body: unknown = error.error;
    if (typeof body !== 'object' || body === null || !('error' in body)) return null;
    const detail = body.error;
    if (typeof detail !== 'object' || detail === null || !('code' in detail)) return null;
    const code = detail.code;
    const stableCodes: readonly ApiErrorCode[] = [
      'INVALID_REQUEST',
      'UNAUTHORIZED',
      'GROUP_NOT_FOUND',
      'POLL_NOT_FOUND',
      'RESPONSE_NOT_FOUND',
      'PARTICIPANT_NAME_TAKEN',
      'RESPONSE_ALREADY_EXISTS',
      'POLL_STATE_CONFLICT',
      'INVALID_SCHEDULE',
      'INTERNAL_ERROR',
    ];
    return typeof code === 'string' && stableCodes.includes(code as ApiErrorCode)
      ? (code as ApiErrorCode)
      : null;
  }

  static errorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;
    const body: unknown = error.error;
    if (typeof body !== 'object' || body === null || !('error' in body)) return fallback;
    const detail = body.error;
    if (typeof detail !== 'object' || detail === null || !('message' in detail)) return fallback;
    return typeof detail.message === 'string' ? detail.message : fallback;
  }

  private groupPath(inviteCode: string): string {
    return `/api/groups/${encodeURIComponent(inviteCode)}`;
  }

  private responsePath(inviteCode: string, pollId: string): string {
    return `${this.groupPath(inviteCode)}/polls/${encodeURIComponent(pollId)}/responses/me`;
  }

  private participantHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ 'X-Participant-Token': token });
  }
}
