import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { GroupsApiService } from '../group/groups-api.service';
import { CreateGroupPageComponent } from './create-group-page.component';

describe('CreateGroupPageComponent', () => {
  it('creates the first UTC poll without a participant name and opens the profile route', async () => {
    const createGroup = vi.fn().mockReturnValue(
      of({
        group: { id: 'group-id', name: 'Team', inviteCode: 'invite-code', timezone: 'UTC' },
        currentPoll: {},
      }),
    );
    await TestBed.configureTestingModule({
      imports: [CreateGroupPageComponent],
      providers: [provideRouter([]), { provide: GroupsApiService, useValue: { createGroup } }],
    }).compileComponents();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(CreateGroupPageComponent);
    const component = fixture.componentInstance;
    component.form.setValue({
      groupName: 'Team',
      startsOn: '2026-10-06',
      endsOn: '2026-10-12',
      dayStart: '16:00',
      dayEnd: '23:00',
      slotMinutes: '30',
    });

    expect(component.form.contains('creatorName')).toBe(false);
    await component.submit();

    expect(createGroup).toHaveBeenCalledWith({
      name: 'Team',
      timezone: 'UTC',
      firstPoll: {
        title: null,
        startsOn: '2026-10-06',
        endsOn: '2026-10-12',
        dayStart: '16:00',
        dayEnd: '23:00',
        slotMinutes: 30,
        meetingDurationMinutes: 60,
      },
    });
    expect(navigate).toHaveBeenCalledWith(['/g', 'invite-code', 'profile']);
  });

  it('shows group creation errors without navigating', async () => {
    const createGroup = vi.fn().mockReturnValue(throwError(() => new Error('offline')));
    await TestBed.configureTestingModule({
      imports: [CreateGroupPageComponent],
      providers: [provideRouter([]), { provide: GroupsApiService, useValue: { createGroup } }],
    }).compileComponents();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(CreateGroupPageComponent);

    await fixture.componentInstance.submit();

    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.errorMessage()).toBeTruthy();
  });

  it('renders the required static schedule fields', async () => {
    await TestBed.configureTestingModule({
      imports: [CreateGroupPageComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CreateGroupPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Создать группу');
    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(5);
  });
});
