import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterOutlet,
  RouterStateSnapshot,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { GroupFacade } from './group.facade';
import { GROUP_ROUTES, confirmGroupEntryLeave, confirmGroupSwitch } from './group.routes';

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

  it('registers poll creation inside the group', () => {
    const routes = GROUP_ROUTES[0]?.children ?? [];
    const createPoll = routes.find((route) => route.path === 'polls/new');

    expect(createPoll?.loadComponent).toBeDefined();
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
});
