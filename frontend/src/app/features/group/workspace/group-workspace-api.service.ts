import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { HttpResourceRef } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { groupApiPath, participantTokenHeaders } from '../../../core/api/api-http';
import type { Workspace } from '../../../core/api/api.types';

@Injectable({ providedIn: 'root' })
export class GroupWorkspaceApiService {
  private readonly http = inject(HttpClient);

  getWorkspace(inviteCode: string, token?: string): Observable<Workspace> {
    return this.http.get<Workspace>(`${groupApiPath(inviteCode)}/workspace`, {
      headers: token ? participantTokenHeaders(token) : undefined,
    });
  }

  workspaceResource(
    parameters: () => { inviteCode: string; token?: string } | undefined,
  ): HttpResourceRef<Workspace | undefined> {
    return httpResource<Workspace>(() => {
      const params = parameters();
      if (!params?.inviteCode) return undefined;
      return {
        url: `${groupApiPath(params.inviteCode)}/workspace`,
        headers: params.token ? participantTokenHeaders(params.token) : undefined,
      };
    });
  }
}
