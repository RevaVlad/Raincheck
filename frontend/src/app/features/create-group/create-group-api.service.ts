import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { CreateGroupRequest, CreateGroupResponse } from '../../core/api/api.types';

@Injectable({ providedIn: 'root' })
export class CreateGroupApiService {
  private readonly http = inject(HttpClient);

  createGroup(body: CreateGroupRequest): Observable<CreateGroupResponse> {
    return this.http.post<CreateGroupResponse>('/api/groups', body);
  }
}
