import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterOutlet,
  RouterStateSnapshot,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Poll, Workspace } from '@shared/api';
import { ParticipantSessionService } from '../model/participant-session/participant-session.service';
import { GroupFacade } from '../model/group-facade/group.facade';
import { GROUP_ROUTES, confirmGroupEntryLeave, confirmGroupSwitch } from './group.routes';
import { GroupEntryPageComponent } from '../ui/group-entry-page/group-entry-page.component';
import { PollCreationPageComponent } from '../ui/poll-creation-page/poll-creation-page.component';
import { PollResultsPageComponent } from '../ui/poll-results-page/poll-results-page.component';

describe('group route leave guards', () => {
  it('registers the same entry component for first entry and explicit profile editing', () => {
    const children = GROUP_ROUTES[0]?.children ?? [];
    const entry = children.find((route) => route.path === '');
    const profile = children.find((route) => route.path === 'profile');

    expect(entry?.loadComponent).toBeDefined();
    expect(profile?.loadComponent).toBe(entry?.loadComponent);
    expect(profile?.data?.['profile']).toBe(true);
    expect(profile?.canDeactivate).toContain(confirmGroupEntryLeave);
  });

  it('keeps the facade route-scoped under the group shell', () => {
    const route = GROUP_ROUTES[0];
    expect(route?.loadComponent).toBeDefined();
    expect(route?.providers).toContain(GroupFacade);
  });

  it('registers poll creation inside the group', () => {
    const routes = GROUP_ROUTES[0]?.children ?? [];
    const createPoll = routes.find((route) => route.path === 'polls/new');

    expect(createPoll?.loadComponent).toBeDefined();
  });

  it('loads profile, poll creation and results through the real group routes', async () => {
    const participant = {
      id: 'participant-id',
      displayName: 'Alex',
      avatarColor: 'green' as const,
    };
    const closedPoll: Poll = {
      id: 'poll-id',
      sequenceNo: 1,
      title: null,
      timeZone: 'UTC',
      startsOn: '2026-11-01',
      endsOn: '2026-11-01',
      dayStart: '09:00',
      dayEnd: '10:00',
      slotMinutes: 30,
      meetingDurationMinutes: 60,
      status: 'CLOSED',
      basedOnPollId: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      closedAt: '2026-10-02T00:00:00.000Z',
    };
    const workspace: Workspace = {
      group: { id: 'group-id', name: 'Team', inviteCode: 'invite-code' },
      me: participant,
      participants: [{ ...participant, currentPollState: 'NONE' }],
      polls: [closedPoll],
      currentPoll: null,
    };
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'g', children: GROUP_ROUTES }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    const session = TestBed.inject(ParticipantSessionService);
    expect(
      session.store('invite-code', { participantId: participant.id, token: 'test-token' }),
    ).toBe(true);
    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create('/g/invite-code/profile');
    const workspaceRequest = http.expectOne('/api/groups/invite-code/workspace');
    expect(workspaceRequest.request.headers.get('X-Participant-Token')).toBe('test-token');
    workspaceRequest.flush(workspace);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    expect(
      harness.fixture.debugElement.query(By.directive(GroupEntryPageComponent)),
    ).not.toBeNull();

    await harness.navigateByUrl('/g/invite-code/polls/new');
    await harness.fixture.whenStable();
    expect(
      harness.fixture.debugElement.query(By.directive(PollCreationPageComponent)),
    ).not.toBeNull();
    http.expectNone('/api/groups/invite-code/workspace');

    await harness.navigateByUrl('/g/invite-code/polls/poll-id/results');
    const resultsRequest = http.expectOne(
      (request) =>
        request.url === '/api/groups/invite-code/polls/poll-id/results' &&
        request.params.has('timeZone'),
    );
    resultsRequest.flush({
      participantSummary: { total: 1, confirmed: 0, pending: 1 },
      heatmap: [],
      bestSlots: [],
      participants: [],
    });
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    expect(
      harness.fixture.debugElement.query(By.directive(PollResultsPageComponent)),
    ).not.toBeNull();
    http.verify();
    session.clear('invite-code');
  });

  it('asks the active workspace to confirm a group switch', async () => {
    const confirmLeave = vi.fn().mockResolvedValue(false);
    TestBed.configureTestingModule({
      providers: [{ provide: GroupFacade, useValue: { inviteCode: () => 'old', confirmLeave } }],
    });
    const route = {
      paramMap: convertToParamMap({ inviteCode: 'new' }),
    } as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() =>
      confirmGroupSwitch(route, {} as RouterStateSnapshot),
    );

    await expect(result).resolves.toBe(false);
    expect(confirmLeave).toHaveBeenCalledOnce();
  });

  it('does not ask again when the group route is unchanged', () => {
    const confirmLeave = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: GroupFacade, useValue: { inviteCode: () => 'same', confirmLeave } }],
    });
    const route = {
      paramMap: convertToParamMap({ inviteCode: 'same' }),
    } as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() =>
      confirmGroupSwitch(route, {} as RouterStateSnapshot),
    );

    expect(result).toBe(true);
    expect(confirmLeave).not.toHaveBeenCalled();
  });

  it('delegates component deactivation to the group-entry page', async () => {
    const canLeave = vi.fn().mockResolvedValue(false);
    const route = {} as ActivatedRouteSnapshot;

    const result = await confirmGroupEntryLeave(
      { canLeave } as never,
      route,
      {} as RouterStateSnapshot,
      {} as RouterStateSnapshot,
    );

    expect(result).toBe(false);
    expect(canLeave).toHaveBeenCalledOnce();
  });

  it('runs the group-switch guard when the invite route parameter changes', async () => {
    @Component({ template: 'Group', standalone: true })
    class GroupRoute {}

    @Component({ imports: [RouterOutlet], template: '<router-outlet />', standalone: true })
    class RouterHost {}

    const confirmLeave = vi.fn().mockResolvedValue(false);
    TestBed.configureTestingModule({
      imports: [RouterHost],
      providers: [
        provideRouter([
          {
            path: 'g/:inviteCode',
            component: GroupRoute,
            canActivate: [confirmGroupSwitch],
            runGuardsAndResolvers: 'paramsChange',
          },
        ]),
        { provide: GroupFacade, useValue: { inviteCode: () => 'old', confirmLeave } },
      ],
    });
    const fixture = TestBed.createComponent(RouterHost);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/g/old');
    confirmLeave.mockClear();

    const navigated = await router.navigateByUrl('/g/new');

    expect(navigated).toBe(false);
    expect(confirmLeave).toHaveBeenCalledOnce();
    expect(router.url).toBe('/g/old');
  });

  it('keeps an editor route active when its unsaved changes cannot be saved', async () => {
    const canLeaveMock = vi.fn().mockResolvedValue(false);

    @Component({ selector: 'app-guarded-editor', template: '', standalone: true })
    class GuardedEditorPage {
      canLeave = () => canLeaveMock();
    }

    @Component({
      selector: 'app-nested-router-host',
      imports: [RouterOutlet],
      template: '<router-outlet />',
      standalone: true,
    })
    class NestedRouterHost {}

    @Component({ selector: 'app-next-page', template: 'Next page', standalone: true })
    class NextPage {}

    TestBed.configureTestingModule({
      imports: [NestedRouterHost],
      providers: [
        provideRouter([
          {
            path: 'g/:inviteCode',
            component: NestedRouterHost,
            children: [
              { path: '', component: GuardedEditorPage, canDeactivate: [confirmGroupEntryLeave] },
              { path: 'next', component: NextPage },
            ],
          },
        ]),
      ],
    });
    await RouterTestingHarness.create('/g/invite-code');

    const navigated = await TestBed.inject(Router).navigateByUrl('/g/invite-code/next');

    expect(navigated).toBe(false);
    expect(canLeaveMock).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).url).toBe('/g/invite-code');
  });
});
