import { Routes } from '@angular/router';
import { CreateGroupPageComponent } from './features/create-group/create-group-page.component';

export const routes: Routes = [
  { path: 'create', component: CreateGroupPageComponent },
  {
    path: 'g',
    loadChildren: () => import('./features/group/group.routes').then((m) => m.GROUP_ROUTES),
  },
  { path: '', pathMatch: 'full', redirectTo: 'create' },
  { path: '**', redirectTo: 'create' },
];
