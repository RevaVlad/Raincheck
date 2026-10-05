import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { ParticipantSessionService } from '../../core/session/participant-session.service';
import { GroupsApiService } from '../group/groups-api.service';
import { CreateGroupPageComponent } from './create-group-page.component';

describe('CreateGroupPageComponent', () => {
  it('creates the first UTC poll, stores the creator identity, and opens the group', async () => {
    const createGroup = vi.fn().mockReturnValue(
      of({
        group: { id: 'group-id', name: 'Team', inviteCode: 'invite-code', timezone: 'UTC' },
        participant: { id: 'participant-id', displayName: 'Alex' },
        participantEditToken: 'secret-token',
        currentPoll: {},
      }),
    );
    const store = vi.fn().mockReturnValue(true);
    await TestBed.configureTestingModule({
      imports: [CreateGroupPageComponent],
      providers: [
        provideRouter([]),
        { provide: GroupsApiService, useValue: { createGroup } },
        { provide: ParticipantSessionService, useValue: { store } },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(CreateGroupPageComponent);
    const component = fixture.componentInstance;
    component.form.setValue({
      groupName: 'Team',
      creatorName: 'Alex',
      startsOn: '2026-10-06',
      endsOn: '2026-10-12',
      dayStart: '16:00',
      dayEnd: '23:00',
      slotMinutes: '30',
    });

    await component.submit();

    expect(createGroup).toHaveBeenCalledWith({
      name: 'Team',
      creatorDisplayName: 'Alex',
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
    expect(store).toHaveBeenCalledWith('invite-code', {
      participantId: 'participant-id',
      token: 'secret-token',
    });
    expect(navigate).toHaveBeenCalledWith(['/g', 'invite-code']);
  });

  it('does not navigate when participant identity cannot be stored', async () => {
    const createGroup = vi.fn().mockReturnValue(
      of({
        group: { id: 'group-id', name: 'Team', inviteCode: 'invite-code', timezone: 'UTC' },
        participant: { id: 'participant-id', displayName: 'Alex' },
        participantEditToken: 'secret-token',
        currentPoll: {},
      }),
    );
    await TestBed.configureTestingModule({
      imports: [CreateGroupPageComponent],
      providers: [
        provideRouter([]),
        { provide: GroupsApiService, useValue: { createGroup } },
        { provide: ParticipantSessionService, useValue: { store: () => false } },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(CreateGroupPageComponent);

    await fixture.componentInstance.submit();

    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.errorMessage()).toContain('could not store');
  });

  it('renders the required static schedule fields', async () => {
    await TestBed.configureTestingModule({
      imports: [CreateGroupPageComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CreateGroupPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Создать группу');
    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(6);
  });
});
