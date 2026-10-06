import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, ResolveFn, Routes } from '@angular/router';
import { GroupFacade } from './group.facade';
import type { GroupEntryPageComponent } from '../group-entry/group-entry-page.component';

export const confirmGroupSwitch: CanActivateFn = (route) => {
  const facade = inject(GroupFacade);
  const nextInviteCode = route.paramMap.get('inviteCode') ?? '';
  return nextInviteCode === facade.inviteCode() ? true : facade.confirmLeave();
};

export const confirmGroupEntryLeave: import('@angular/router').CanDeactivateFn<
  GroupEntryPageComponent
> = (component) => component.canLeave();

export const resolveGroupInviteCode: ResolveFn<boolean> = (route: ActivatedRouteSnapshot) => {
  inject(GroupFacade).setInviteCode(route.paramMap.get('inviteCode') ?? '');
  return true;
};

const loadGroupEntryPage = () =>
  import('../group-entry/group-entry-page.component').then(
    (module) => module.GroupEntryPageComponent,
  );

export const GROUP_ROUTES: Routes = [
  {
    path: ':inviteCode',
    providers: [GroupFacade],
    canActivate: [confirmGroupSwitch],
    resolve: { groupLoaded: resolveGroupInviteCode },
    runGuardsAndResolvers: 'paramsChange',
    children: [
      {
        path: '',
        pathMatch: 'full',
        canDeactivate: [confirmGroupEntryLeave],
        loadComponent: loadGroupEntryPage,
      },
      {
        path: 'profile',
        data: { profile: true },
        canDeactivate: [confirmGroupEntryLeave],
        loadComponent: loadGroupEntryPage,
      },
      {
        path: 'polls/:pollId/results',
        loadComponent: () =>
          import('../results/poll-results-page.component').then(
            (module) => module.PollResultsPageComponent,
          ),
      },
    ],
  },
];
