import { HttpHeaders } from '@angular/common/http';

export function groupApiPath(inviteCode: string): string {
  return `/api/groups/${encodeURIComponent(inviteCode)}`;
}

export function participantTokenHeaders(token: string): HttpHeaders {
  return new HttpHeaders({ 'X-Participant-Token': token });
}
