import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, ResolveFn, Routes } from '@angular/router';
import { GroupFacade } from './group.facade';

export const resolveGroupInviteCode: ResolveFn<boolean> = (route: ActivatedRouteSnapshot) => {
  inject(GroupFacade).setInviteCode(route.paramMap.get('inviteCode') ?? '');
  return true;
};

export const GROUP_ROUTES: Routes = [
  {
    path: ':inviteCode',
    providers: [GroupFacade],
    resolve: { groupLoaded: resolveGroupInviteCode },
    runGuardsAndResolvers: 'paramsChange',
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('../group-entry/group-entry-page.component').then(
            (module) => module.GroupEntryPageComponent,
          ),
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
