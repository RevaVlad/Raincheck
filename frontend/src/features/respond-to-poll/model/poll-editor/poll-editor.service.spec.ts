import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import type { WorkspacePoll } from '@shared/api';
import { AvailabilityIntervalsService } from '../availability-intervals/availability-intervals.service';
import { PollResponsesApiService } from '../../api/poll-responses-api/poll-responses-api.service';
import { PollEditorService } from './poll-editor.service';

const poll: WorkspacePoll = {
  id: 'poll-id',
  sequenceNo: 1,
  title: null,
  timeZone: 'UTC',
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
  slots: Array.from({ length: 4 }, (_, index) => ({
    startAt: new Date(Date.parse('2026-10-06T09:00:00.000Z') + index * 30 * 60_000).toISOString(),
    endAt: new Date(Date.parse('2026-10-06T09:30:00.000Z') + index * 30 * 60_000).toISOString(),
  })),
};
const draft = { id: 'response-id', state: 'DRAFT', confirmedAt: null, intervals: [] };

describe('PollEditorService', () => {
  let api: {
    getMyResponse: ReturnType<typeof vi.fn>;
    createMyResponse: ReturnType<typeof vi.fn>;
    replaceMyResponse: ReturnType<typeof vi.fn>;
    confirmMyResponse: ReturnType<typeof vi.fn>;
  };
  let editor: PollEditorService;

  beforeEach(() => {
    vi.useFakeTimers();
    api = {
      getMyResponse: vi.fn(),
      createMyResponse: vi.fn(),
      replaceMyResponse: vi.fn(),
      confirmMyResponse: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        PollEditorService,
        AvailabilityIntervalsService,
        { provide: PollResponsesApiService, useValue: api },
      ],
    });
    editor = TestBed.inject(PollEditorService);
  });

  afterEach(() => vi.useRealTimers());

  it('delegates interval loading and resets the interval state for a different poll', async () => {
    const loaded = {
      ...draft,
      intervals: [
        {
          id: 'interval-1',
          startAt: '2026-10-06T09:00:00.000Z',
          endAt: '2026-10-06T09:30:00.000Z',
          kind: 'PREFERRED' as const,
          preferenceDirection: 'FLAT' as const,
        },
      ],
    };
    api.getMyResponse.mockReturnValueOnce(of(loaded)).mockReturnValueOnce(of(draft));
    const availability = TestBed.inject(AvailabilityIntervalsService);

    await editor.load('invite-code', poll, 'secret-token', vi.fn());
    expect(availability.cellAt('2026-10-06T09:00:00.000Z')).toBe('PREFERRED');

    await editor.load('invite-code', { ...poll, id: 'another-poll' }, 'secret-token', vi.fn());
    expect(availability.cellAt('2026-10-06T09:00:00.000Z')).toBeNull();
  });

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

    expect(editor.cellAt('2026-10-06T09:00:00.000Z')).toBeNull();
    expect(editor.responseId()).toBeNull();
    editor.paint('2026-10-06T09:00:00.000Z', 'PREFERRED');
    await vi.advanceTimersByTimeAsync(600);

    expect(api.createMyResponse).toHaveBeenCalledWith('invite-code', 'poll-id', 'secret-token');
    expect(api.replaceMyResponse).toHaveBeenCalledWith('invite-code', 'poll-id', 'secret-token', {
      intervals: [
        {
          startAt: '2026-10-06T09:00:00.000Z',
          endAt: '2026-10-06T09:30:00.000Z',
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

    expect(editor.cellAt('2026-10-06T09:00:00.000Z')).toBeNull();
    expect(editor.responseLoaded()).toBe(false);
    expect(editor.saveState()).toBe('ERROR');
    expect(api.createMyResponse).not.toHaveBeenCalled();
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

    editor.paint('2026-10-06T09:00:00.000Z', 'PREFERRED');
    await vi.advanceTimersByTimeAsync(600);

    expect(editor.cellAt('2026-10-06T09:00:00.000Z')).toBe('PREFERRED');
    expect(editor.saveState()).toBe('ERROR');
    editor.paint('2026-10-06T09:30:00.000Z', 'UNAVAILABLE');
    await editor.saveNow();

    expect(api.replaceMyResponse).toHaveBeenLastCalledWith(
      'invite-code',
      'poll-id',
      'secret-token',
      {
        intervals: [
          {
            startAt: '2026-10-06T09:00:00.000Z',
            endAt: '2026-10-06T09:30:00.000Z',
            kind: 'PREFERRED',
            preferenceDirection: 'FLAT',
          },
          {
            startAt: '2026-10-06T09:30:00.000Z',
            endAt: '2026-10-06T10:00:00.000Z',
            kind: 'UNAVAILABLE',
            preferenceDirection: null,
          },
        ],
      },
    );
    expect(editor.saveState()).toBe('SAVED');
  });

  it('saves edits made during an in-flight write as a second serialized snapshot', async () => {
    const firstSave = new Subject<typeof draft>();
    api.getMyResponse.mockReturnValue(of(draft));
    api.replaceMyResponse.mockReturnValueOnce(firstSave).mockReturnValueOnce(of(draft));
    await editor.load('invite-code', poll, 'secret-token', vi.fn());
    editor.paint('2026-10-06T09:00:00.000Z', 'PREFERRED');
    const saving = editor.saveNow();
    await Promise.resolve();
    editor.paint('2026-10-06T09:30:00.000Z', 'UNAVAILABLE');
    firstSave.next(draft);
    await saving;

    expect(api.replaceMyResponse).toHaveBeenCalledTimes(2);
    expect(api.replaceMyResponse).toHaveBeenLastCalledWith(
      'invite-code',
      'poll-id',
      'secret-token',
      {
        intervals: [
          {
            startAt: '2026-10-06T09:00:00.000Z',
            endAt: '2026-10-06T09:30:00.000Z',
            kind: 'PREFERRED',
            preferenceDirection: 'FLAT',
          },
          {
            startAt: '2026-10-06T09:30:00.000Z',
            endAt: '2026-10-06T10:00:00.000Z',
            kind: 'UNAVAILABLE',
            preferenceDirection: null,
          },
        ],
      },
    );
    expect(editor.pendingChanges()).toBe(false);
  });

  it('flushes the latest autosave before confirming', async () => {
    api.getMyResponse.mockReturnValue(of(draft));
    api.replaceMyResponse.mockReturnValue(of(draft));
    api.confirmMyResponse.mockReturnValue(
      of({ ...draft, state: 'CONFIRMED', confirmedAt: '2026-10-02T12:00:00.000Z' }),
    );
    await editor.load('invite-code', poll, 'secret-token', vi.fn());
    editor.paint('2026-10-06T09:00:00.000Z', 'IF_NEEDED');

    await editor.confirm();

    expect(api.replaceMyResponse).toHaveBeenCalledOnce();
    expect(api.confirmMyResponse).toHaveBeenCalledOnce();
    expect(editor.responseState()).toBe('CONFIRMED');
  });

  it('returns a confirmed response to draft as soon as availability is edited', async () => {
    api.getMyResponse.mockReturnValue(
      of({ ...draft, state: 'CONFIRMED', confirmedAt: '2026-10-02T12:00:00.000Z' }),
    );
    api.replaceMyResponse.mockReturnValue(of(draft));
    await editor.load('invite-code', poll, 'secret-token', vi.fn());

    editor.paint('2026-10-06T09:00:00.000Z', 'PREFERRED');

    expect(editor.responseState()).toBe('DRAFT');
    expect(editor.saveState()).toBe('DIRTY');
  });

  it('clears an existing slot and leaves a no-op clear clean', async () => {
    api.getMyResponse.mockReturnValue(
      of({
        ...draft,
        intervals: [
          {
            id: 'interval-1',
            startAt: '2026-10-06T09:00:00.000Z',
            endAt: '2026-10-06T09:30:00.000Z',
            kind: 'PREFERRED',
            preferenceDirection: 'FLAT',
          },
        ],
      }),
    );
    api.replaceMyResponse.mockReturnValue(of(draft));
    await editor.load('invite-code', poll, 'secret-token', vi.fn());

    editor.paint('2026-10-06T09:30:00.000Z', 'CLEAR');
    expect(editor.saveState()).toBe('IDLE');
    editor.paint('2026-10-06T09:00:00.000Z', 'CLEAR');
    expect(editor.toIntervals()).toEqual([]);
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

    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it('does not apply a response load after another editor context is selected', async () => {
    const oldLoad = new Subject<typeof draft>();
    api.getMyResponse.mockReturnValueOnce(oldLoad).mockReturnValueOnce(of(draft));
    const oldPoll = { ...poll, id: 'old-poll' };
    const first = editor.load('old-group', oldPoll, 'old-token', vi.fn());
    await editor.load('new-group', poll, 'new-token', vi.fn());
    oldLoad.next({ ...draft, id: 'old-response' });
    await first;

    expect(editor.poll()?.id).toBe('poll-id');
    expect(editor.responseId()).toBe('response-id');
  });

  it('does not save to the new context after old draft creation finishes', async () => {
    const oldCreate = new Subject<typeof draft>();
    api.getMyResponse.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { error: { code: 'RESPONSE_NOT_FOUND' } },
          }),
      ),
    );
    api.getMyResponse.mockReturnValueOnce(of(draft));
    api.createMyResponse.mockReturnValue(oldCreate);
    await editor.load('old-group', { ...poll, id: 'old-poll' }, 'old-token', vi.fn());
    editor.paint('2026-10-06T09:00:00.000Z', 'PREFERRED');
    const save = editor.saveNow();
    await Promise.resolve();
    await editor.load('new-group', poll, 'new-token', vi.fn());
    oldCreate.next({ ...draft, id: 'old-response' });
    await save;

    expect(api.createMyResponse).toHaveBeenCalledWith('old-group', 'old-poll', 'old-token');
    expect(api.replaceMyResponse).not.toHaveBeenCalled();
    expect(editor.poll()?.id).toBe('poll-id');
  });

  it('tracks edits and active saves as pending changes', async () => {
    const saving = new Subject<typeof draft>();
    api.getMyResponse.mockReturnValue(of(draft));
    api.replaceMyResponse.mockReturnValue(saving);
    await editor.load('invite-code', poll, 'secret-token', vi.fn());
    expect(editor.pendingChanges()).toBe(false);
    editor.paint('2026-10-06T09:00:00.000Z', 'PREFERRED');
    expect(editor.pendingChanges()).toBe(true);
    const save = editor.saveNow();
    await Promise.resolve();
    expect(editor.pendingChanges()).toBe(true);
    saving.next(draft);
    await save;
    expect(editor.pendingChanges()).toBe(false);
  });

  it('pauses autosave during a leave prompt and resumes it on cancellation', async () => {
    api.getMyResponse.mockReturnValue(of(draft));
    api.replaceMyResponse.mockReturnValue(of(draft));
    await editor.load('invite-code', poll, 'secret-token', vi.fn());
    editor.paint('2026-10-06T09:00:00.000Z', 'PREFERRED');
    editor.pauseAutosave();
    await vi.advanceTimersByTimeAsync(600);
    expect(api.replaceMyResponse).not.toHaveBeenCalled();

    editor.resumeAutosave();
    await vi.advanceTimersByTimeAsync(600);
    expect(api.replaceMyResponse).toHaveBeenCalledOnce();
  });

  it('preserves the draft and restores autosave after navigation is cancelled', async () => {
    api.getMyResponse.mockReturnValue(of(draft));
    api.replaceMyResponse.mockReturnValue(of(draft));
    await editor.load('invite-code', poll, 'secret-token', vi.fn());
    editor.paint('2026-10-06T09:00:00.000Z', 'PREFERRED');
    editor.beginLeaving();
    editor.cancelLeaving();
    expect(editor.cellAt('2026-10-06T09:00:00.000Z')).toBe('PREFERRED');
    await vi.advanceTimersByTimeAsync(600);

    expect(api.replaceMyResponse).toHaveBeenCalledOnce();
  });

  it('invalidates queued writes after accepting navigation away', async () => {
    api.getMyResponse.mockReturnValue(of(draft));
    api.replaceMyResponse.mockReturnValue(of(draft));
    await editor.load('invite-code', poll, 'secret-token', vi.fn());
    editor.paint('2026-10-06T09:00:00.000Z', 'PREFERRED');
    editor.beginLeaving();
    await vi.advanceTimersByTimeAsync(600);

    expect(api.replaceMyResponse).not.toHaveBeenCalled();
    expect(editor.pendingChanges()).toBe(true);
  });

  it('clears pending autosave work on service teardown', async () => {
    api.getMyResponse.mockReturnValue(of(draft));
    api.replaceMyResponse.mockReturnValue(of(draft));
    await editor.load('invite-code', poll, 'secret-token', vi.fn());
    editor.paint('2026-10-06T09:00:00.000Z', 'PREFERRED');
    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(600);

    expect(api.replaceMyResponse).not.toHaveBeenCalled();
  });

  it('cancels an outstanding response read on teardown', async () => {
    const teardown = vi.fn();
    api.getMyResponse.mockReturnValue(new Observable(() => () => teardown()));
    const loading = editor.load('invite-code', poll, 'secret-token', vi.fn());
    await Promise.resolve();
    TestBed.resetTestingModule();
    await loading;

    expect(teardown).toHaveBeenCalledOnce();
  });
});
