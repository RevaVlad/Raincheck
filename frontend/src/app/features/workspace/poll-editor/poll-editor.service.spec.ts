import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RaincheckApiService, type Poll } from '../../../core/api/raincheck-api.service';
import { ParticipantSessionService } from '../../../core/session/participant-session.service';
import { PollEditorService } from './poll-editor.service';

const poll: Poll = {
  id: 'poll-id',
  sequenceNo: 1,
  title: null,
  startsOn: '2026-10-06',
  endsOn: '2026-10-06',
  dayStart: '09:00',
  dayEnd: '11:00',
  slotMinutes: 30,
  meetingDurationMinutes: 60,
  status: 'OPEN',
  basedOnPollId: null,
  createdAt: '2026-10-02T00:00:00.000Z',
  closedAt: null,
};
const draft = { id: 'response-id', state: 'DRAFT', confirmedAt: null, intervals: [] };

describe('PollEditorService', () => {
  let api: {
    getMyResponse: ReturnType<typeof vi.fn>;
    createMyResponse: ReturnType<typeof vi.fn>;
    replaceMyResponse: ReturnType<typeof vi.fn>;
    confirmMyResponse: ReturnType<typeof vi.fn>;
  };
  let session: { clear: ReturnType<typeof vi.fn> };
  let editor: PollEditorService;

  beforeEach(() => {
    vi.useFakeTimers();
    api = {
      getMyResponse: vi.fn(),
      createMyResponse: vi.fn(),
      replaceMyResponse: vi.fn(),
      confirmMyResponse: vi.fn(),
    };
    session = { clear: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        PollEditorService,
        { provide: RaincheckApiService, useValue: api },
        { provide: ParticipantSessionService, useValue: session },
      ],
    });
    editor = TestBed.inject(PollEditorService);
  });

  afterEach(() => vi.useRealTimers());

  it('starts empty for RESPONSE_NOT_FOUND and lazily creates a draft on first edit', async () => {
    api.getMyResponse.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { error: { code: 'RESPONSE_NOT_FOUND' } },
          }),
      ),
    );
    api.createMyResponse.mockReturnValue(of(draft));
    api.replaceMyResponse.mockReturnValue(of(draft));
    await editor.load('invite-code', poll, 'secret-token', vi.fn());

    expect(editor.cells()).toEqual({});
    expect(editor.responseId()).toBeNull();
    editor.paint('2026-10-06', '09:00', 'PREFERRED');
    await vi.advanceTimersByTimeAsync(600);

    expect(api.createMyResponse).toHaveBeenCalledWith('invite-code', 'poll-id', 'secret-token');
    expect(api.replaceMyResponse).toHaveBeenCalledWith('invite-code', 'poll-id', 'secret-token', {
      intervals: [
        {
          localDate: '2026-10-06',
          startTime: '09:00',
          endTime: '09:30',
          kind: 'PREFERRED',
          preferenceDirection: 'FLAT',
        },
      ],
    });
    expect(editor.saveState()).toBe('SAVED');
  });

  it('does not treat unrelated 404 responses as an empty editor', async () => {
    api.getMyResponse.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { error: { code: 'POLL_NOT_FOUND' } },
          }),
      ),
    );
    const unauthorized = vi.fn();

    await editor.load('invite-code', poll, 'secret-token', unauthorized);

    expect(editor.cells()).toEqual({});
    expect(editor.responseLoaded()).toBe(false);
    expect(editor.saveState()).toBe('ERROR');
    expect(api.createMyResponse).not.toHaveBeenCalled();
    expect(session.clear).not.toHaveBeenCalled();
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it('preserves local cells after a failed save and retries the newest snapshot', async () => {
    api.getMyResponse.mockReturnValue(of(draft));
    api.replaceMyResponse
      .mockReturnValueOnce(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 500,
              error: { error: { code: 'INTERNAL_ERROR' } },
            }),
        ),
      )
      .mockReturnValueOnce(of(draft));
    await editor.load('invite-code', poll, 'secret-token', vi.fn());

    editor.paint('2026-10-06', '09:00', 'PREFERRED');
    await vi.advanceTimersByTimeAsync(600);

    expect(editor.cellAt('2026-10-06', '09:00')).toBe('PREFERRED');
    expect(editor.saveState()).toBe('ERROR');
    editor.paint('2026-10-06', '09:30', 'UNAVAILABLE');
    await editor.saveNow();

    expect(api.replaceMyResponse).toHaveBeenLastCalledWith(
      'invite-code',
      'poll-id',
      'secret-token',
      {
        intervals: [
          {
            localDate: '2026-10-06',
            startTime: '09:00',
            endTime: '09:30',
            kind: 'PREFERRED',
            preferenceDirection: 'FLAT',
          },
          {
            localDate: '2026-10-06',
            startTime: '09:30',
            endTime: '10:00',
            kind: 'UNAVAILABLE',
            preferenceDirection: null,
          },
        ],
      },
    );
    expect(editor.saveState()).toBe('SAVED');
  });

  it('flushes the latest autosave before confirming', async () => {
    api.getMyResponse.mockReturnValue(of(draft));
    api.replaceMyResponse.mockReturnValue(of(draft));
    api.confirmMyResponse.mockReturnValue(
      of({ ...draft, state: 'CONFIRMED', confirmedAt: '2026-10-02T12:00:00.000Z' }),
    );
    await editor.load('invite-code', poll, 'secret-token', vi.fn());
    editor.paint('2026-10-06', '09:00', 'IF_NEEDED');

    await editor.confirm();

    expect(api.replaceMyResponse).toHaveBeenCalledOnce();
    expect(api.confirmMyResponse).toHaveBeenCalledOnce();
    expect(editor.responseState()).toBe('CONFIRMED');
  });

  it('clears an existing slot and leaves a no-op clear clean', async () => {
    api.getMyResponse.mockReturnValue(
      of({
        ...draft,
        intervals: [
          {
            id: 'interval-1',
            localDate: '2026-10-06',
            startTime: '09:00',
            endTime: '09:30',
            kind: 'PREFERRED',
            preferenceDirection: 'FLAT',
          },
        ],
      }),
    );
    api.replaceMyResponse.mockReturnValue(of(draft));
    await editor.load('invite-code', poll, 'secret-token', vi.fn());

    editor.paint('2026-10-06', '09:30', 'CLEAR');
    expect(editor.saveState()).toBe('IDLE');
    editor.paint('2026-10-06', '09:00', 'CLEAR');
    expect(editor.cells()).toEqual({});
    expect(editor.responseState()).toBe('DRAFT');
    await vi.advanceTimersByTimeAsync(600);
    expect(api.replaceMyResponse).toHaveBeenCalledWith('invite-code', 'poll-id', 'secret-token', {
      intervals: [],
    });
    expect(editor.saveState()).toBe('SAVED');
  });

  it('signals the group facade after a participant-only 401', async () => {
    const unauthorized = vi.fn();
    api.getMyResponse.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            error: { error: { code: 'UNAUTHORIZED' } },
          }),
      ),
    );

    await editor.load('invite-code', poll, 'secret-token', unauthorized);

    expect(session.clear).not.toHaveBeenCalled();
    expect(unauthorized).toHaveBeenCalledOnce();
  });
});
