import { TestBed } from '@angular/core/testing';
import { ParticipantSessionService } from './participant-session.service';

describe('ParticipantSessionService', () => {
  let session: ParticipantSessionService;

  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({ providers: [ParticipantSessionService] });
    session = TestBed.inject(ParticipantSessionService);
  });

  it('stores participant identity separately for each invite code', () => {
    expect(session.store('group-a', { participantId: 'participant-a', token: 'secret-a' })).toBe(true);
    expect(session.store('group-b', { participantId: 'participant-b', token: 'secret-b' })).toBe(true);

    expect(session.get('group-a')).toEqual({ participantId: 'participant-a', token: 'secret-a' });
    expect(session.get('group-b')).toEqual({ participantId: 'participant-b', token: 'secret-b' });
  });

  it('clears only the identity for the requested invite code', () => {
    session.store('group-a', { participantId: 'participant-a', token: 'secret-a' });
    session.store('group-b', { participantId: 'participant-b', token: 'secret-b' });

    session.clear('group-a');

    expect(session.get('group-a')).toBeNull();
    expect(session.get('group-b')).not.toBeNull();
  });

  it('treats malformed stored identity as missing and removes it', () => {
    window.localStorage.setItem('raincheck.identity.group-a', '{');

    expect(session.get('group-a')).toBeNull();
    expect(window.localStorage.getItem('raincheck.identity.group-a')).toBeNull();
  });

  it('reports when browser storage rejects participant identity', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'QuotaExceededError');
    });

    try {
      expect(session.store('group-a', { participantId: 'participant-a', token: 'secret-a' })).toBe(
        false,
      );
    } finally {
      setItem.mockRestore();
    }
  });
});
