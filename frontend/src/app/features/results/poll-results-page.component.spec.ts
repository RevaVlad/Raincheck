import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import type { PollResults } from '../../core/api/raincheck-api.service';
import { RaincheckApiService } from '../../core/api/raincheck-api.service';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { PollResultsPageComponent } from './poll-results-page.component';

describe('PollResultsPageComponent', () => {
  it('reloads results when invite-code or poll route parameters change', async () => {
    const params = new BehaviorSubject(
      convertToParamMap({ inviteCode: 'group-a', pollId: 'poll-a' }),
    );
    const result = (total: number): PollResults => ({
      participantSummary: { total, confirmed: 0, pending: total },
      bestSlots: [],
      heatmap: [],
    });
    const getPollResults = vi
      .fn()
      .mockReturnValueOnce(of(result(1)))
      .mockReturnValueOnce(of(result(2)));
    await TestBed.configureTestingModule({
      imports: [PollResultsPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params, snapshot: { paramMap: params.value } },
        },
        { provide: RaincheckApiService, useValue: { getPollResults } },
        {
          provide: TimezonePreferenceService,
          useValue: {
            selectedTimeZone: signal('UTC'),
            ensureConfirmed: vi.fn().mockResolvedValue('UTC'),
            convertUtc: vi.fn(),
            formatDate: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PollResultsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(getPollResults).toHaveBeenCalledTimes(1));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/g/group-a');
    params.next(convertToParamMap({ inviteCode: 'group-b', pollId: 'poll-b' }));
    await vi.waitFor(() => expect(getPollResults).toHaveBeenCalledTimes(2));
    fixture.detectChanges();

    expect(getPollResults).toHaveBeenNthCalledWith(1, 'group-a', 'poll-a');
    expect(getPollResults).toHaveBeenNthCalledWith(2, 'group-b', 'poll-b');
    expect(fixture.componentInstance.results()?.participantSummary.total).toBe(2);
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/g/group-b');
  });

  it('ignores an older results response after route parameters change', async () => {
    const params = new BehaviorSubject(
      convertToParamMap({ inviteCode: 'group-a', pollId: 'poll-a' }),
    );
    const result = (total: number): PollResults => ({
      participantSummary: { total, confirmed: 0, pending: total },
      bestSlots: [],
      heatmap: [],
    });
    const firstRequest = new Subject<PollResults>();
    const secondRequest = new Subject<PollResults>();
    const getPollResults = vi
      .fn()
      .mockReturnValueOnce(firstRequest)
      .mockReturnValueOnce(secondRequest);
    await TestBed.configureTestingModule({
      imports: [PollResultsPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params, snapshot: { paramMap: params.value } },
        },
        { provide: RaincheckApiService, useValue: { getPollResults } },
        {
          provide: TimezonePreferenceService,
          useValue: {
            selectedTimeZone: signal('UTC'),
            ensureConfirmed: vi.fn().mockResolvedValue('UTC'),
            convertUtc: vi.fn(),
            formatDate: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PollResultsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(getPollResults).toHaveBeenCalledTimes(1));

    params.next(convertToParamMap({ inviteCode: 'group-b', pollId: 'poll-b' }));
    await vi.waitFor(() => expect(getPollResults).toHaveBeenCalledTimes(2));
    secondRequest.next(result(2));
    await vi.waitFor(() =>
      expect(fixture.componentInstance.results()?.participantSummary.total).toBe(2),
    );

    firstRequest.next(result(1));

    expect(fixture.componentInstance.results()?.participantSummary.total).toBe(2);
    expect(fixture.componentInstance.inviteCode()).toBe('group-b');
  });
});
