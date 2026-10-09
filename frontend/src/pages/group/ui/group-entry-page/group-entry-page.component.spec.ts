import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { GroupFacade } from '../../model/group-facade/group.facade';
import { GroupEntryPageComponent } from './group-entry-page.component';

describe('GroupEntryPageComponent', () => {
  async function setup(
    me: {
      id: string;
      displayName: string;
      avatarColor: 'green' | 'blue' | 'purple' | 'rose' | 'yellow' | 'gray';
    } | null = null,
    routeData: Record<string, unknown> = {},
    onSave = vi.fn().mockResolvedValue(true),
    currentPoll: unknown = null,
  ) {
    const profileError = signal<string | null>(null);
    const facade = {
      inviteCode: signal('invite-code'),
      workspace: signal({
        group: {
          id: 'group-id',
          name: 'Team',
          inviteCode: 'invite-code',
        },
        me,
        participants: [],
        polls: [],
        currentPoll,
      }),
      loading: signal(false),
      notFound: signal(false),
      loadError: signal(null),
      savingProfile: signal(false),
      profileError,
      saveProfile: onSave,
      reload: vi.fn(),
      confirmLeave: vi.fn().mockResolvedValue(true),
    };
    await TestBed.configureTestingModule({
      imports: [GroupEntryPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: routeData } } },
        { provide: GroupFacade, useValue: facade },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(GroupEntryPageComponent);
    fixture.detectChanges();
    TestBed.tick();
    return { fixture, component: fixture.componentInstance, facade, navigate, profileError };
  }

  it('routes a new profile to poll creation when the group has no poll', async () => {
    const saveProfile = vi.fn().mockResolvedValue(true);
    const { component, facade, navigate } = await setup(null, {}, saveProfile);
    expect(component.avatarColor).toBe('green');

    component.displayName = ' Alex ';
    component.avatarColor = 'purple';
    await component.submitProfile();

    expect(saveProfile).toHaveBeenCalledWith({ displayName: 'Alex', avatarColor: 'purple' });
    expect(navigate).toHaveBeenCalledWith(['/g', 'invite-code', 'polls', 'new']);
    expect(facade.profileError()).toBeNull();
  });

  it('returns an edited profile to the group workspace', async () => {
    const member = { id: 'participant-id', displayName: 'Alex', avatarColor: 'blue' as const };
    const { component, navigate } = await setup(member, { profile: true });

    component.displayName = 'Alex';
    await component.submitProfile();

    expect(navigate).toHaveBeenCalledWith(['/g', 'invite-code']);
  });

  it('routes a first profile to the group when an active poll already exists', async () => {
    const { component, navigate } = await setup(null, {}, undefined, { id: 'active-poll' });

    component.displayName = 'Alex';
    await component.submitProfile();

    expect(navigate).toHaveBeenCalledWith(['/g', 'invite-code']);
  });

  it('pre-fills a valid participant on the explicit profile route', async () => {
    const member = { id: 'participant-id', displayName: 'Alex', avatarColor: 'blue' as const };
    const { component } = await setup(member, { profile: true });

    expect(component.displayName).toBe('Alex');
    expect(component.avatarColor).toBe('blue');
  });

  it('renders accessible colors in order and supports arrow navigation', async () => {
    const { fixture, component } = await setup();
    const choices = [...fixture.nativeElement.querySelectorAll('mat-button-toggle')];

    expect(choices.map((choice) => choice.textContent.trim())).toEqual([
      'Зелёный',
      'Синий',
      'Фиолетовый',
      'Розовый',
      'Жёлтый',
      'Серый',
    ]);
    expect(
      choices.filter(
        (choice) => choice.querySelector('[role="radio"]')?.getAttribute('aria-checked') === 'true',
      ),
    ).toHaveLength(1);

    const firstButton = choices[0].querySelector('button') as HTMLButtonElement;
    firstButton.focus();
    firstButton.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }),
    );
    fixture.detectChanges();

    expect(component.avatarColor).toBe('blue');
    expect(choices[1].querySelector('[role="radio"]')?.getAttribute('aria-checked')).toBe('true');
  });

  it('keeps profile errors visible and stays on the form after a failed save', async () => {
    const saveProfile = vi.fn().mockResolvedValue(false);
    const { fixture, component, navigate, profileError } = await setup(null, {}, saveProfile);
    saveProfile.mockImplementation(async () => {
      profileError.set('This name is already used.');
      return false;
    });
    component.displayName = 'Alex';
    await component.submitProfile();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(profileError()).toBe('This name is already used.');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'already used',
    );
  });
});
