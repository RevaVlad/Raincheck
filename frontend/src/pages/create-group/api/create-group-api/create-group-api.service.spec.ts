import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CreateGroupApiService } from './create-group-api.service';

describe('CreateGroupApiService', () => {
  let api: CreateGroupApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CreateGroupApiService],
    });
    api = TestBed.inject(CreateGroupApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('creates a group without poll or participant data', () => {
    const body = { name: 'Team' };

    api.createGroup(body).subscribe();

    const call = http.expectOne('/api/groups');
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual(body);
    expect(call.request.headers.has('X-Participant-Token')).toBe(false);
    call.flush({ group: {}, currentPoll: null });
  });
});
