import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ParticipantsApiService } from './participants-api.service';

describe('ParticipantsApiService', () => {
  let participants: ParticipantsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ParticipantsApiService],
    });
    participants = TestBed.inject(ParticipantsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('joins without forwarding an existing participant token', () => {
    participants
      .joinGroup('invite/code', { displayName: 'Alex', avatarColor: 'green' })
      .subscribe();

    const call = http.expectOne('/api/groups/invite%2Fcode/participants');
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({ displayName: 'Alex', avatarColor: 'green' });
    expect(call.request.headers.has('X-Participant-Token')).toBe(false);
    call.flush({});
  });

  it('updates a participant profile with its scoped token', () => {
    participants
      .updateProfile('invite/code', 'secret-token', {
        displayName: 'Alex',
        avatarColor: 'purple',
      })
      .subscribe();

    const call = http.expectOne('/api/groups/invite%2Fcode/participants/me');
    expect(call.request.method).toBe('PATCH');
    expect(call.request.headers.get('X-Participant-Token')).toBe('secret-token');
    expect(call.request.body).toEqual({ displayName: 'Alex', avatarColor: 'purple' });
    call.flush({
      participant: { id: 'participant-id', displayName: 'Alex', avatarColor: 'purple' },
    });
  });
});
