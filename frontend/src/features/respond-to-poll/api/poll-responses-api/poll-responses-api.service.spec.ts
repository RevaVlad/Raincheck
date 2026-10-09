import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PollResponsesApiService } from './poll-responses-api.service';

describe('PollResponsesApiService', () => {
  let responses: PollResponsesApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), PollResponsesApiService],
    });
    responses = TestBed.inject(PollResponsesApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('scopes each response operation to its explicit participant token', () => {
    const path = '/api/groups/group%2Fa/polls/poll%2Fb/responses/me';
    const token = 'secret-token';
    const verify = (url: string, method: string) => {
      const call = http.expectOne(url);
      expect(call.request.method).toBe(method);
      expect(call.request.headers.get('X-Participant-Token')).toBe(token);
      expect(call.request.headers.has('Authorization')).toBe(false);
      return call;
    };

    responses.getMyResponse('group/a', 'poll/b', token).subscribe();
    verify(path, 'GET').flush({});
    responses.createMyResponse('group/a', 'poll/b', token).subscribe();
    verify(path, 'POST').flush({});
    responses.replaceMyResponse('group/a', 'poll/b', token, { intervals: [] }).subscribe();
    const replacement = verify(path, 'PUT');
    expect(replacement.request.body).toEqual({ intervals: [] });
    replacement.flush({});
    responses.confirmMyResponse('group/a', 'poll/b', token).subscribe();
    verify(`${path}/confirm`, 'POST').flush({});
  });
});
