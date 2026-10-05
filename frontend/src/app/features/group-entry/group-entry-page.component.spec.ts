import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { GroupFacade } from '../group/group.facade';
import { GroupEntryPageComponent } from './group-entry-page.component';

describe('GroupEntryPageComponent', () => {
  it('keeps the group form in the feature and delegates joining to the facade', async () => {
    const facade = {
      inviteCode: signal('invite-code'),
      workspace: signal({ group: { name: 'Team' }, me: null, polls: [], currentPoll: null }),
      loading: signal(false),
      joining: signal(false),
      notFound: signal(false),
      loadError: signal(null),
      joinError: signal(null),
      join: vi.fn(),
      reload: vi.fn(),
    };
    const timezone = {
      selectedTimeZone: signal('UTC'),
      ensureConfirmed: vi.fn().mockResolvedValue('UTC'),
      convertUtc: vi.fn(),
      formatDate: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [GroupEntryPageComponent],
      providers: [
        { provide: GroupFacade, useValue: facade },
        { provide: TimezonePreferenceService, useValue: timezone },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(GroupEntryPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.displayName = ' Alex ';
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );

    expect(facade.join).toHaveBeenCalledWith(' Alex ');
  });
});
