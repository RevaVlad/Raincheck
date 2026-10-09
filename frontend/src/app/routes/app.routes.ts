import { Routes } from '@angular/router';
import { CreateGroupPageComponent } from '@pages/create-group';

export const routes: Routes = [
  { path: 'create', component: CreateGroupPageComponent },
  {
    path: 'g',
    loadChildren: () => import('@pages/group').then((m) => m.GROUP_ROUTES),
  },
  { path: '', pathMatch: 'full', redirectTo: 'create' },
  { path: '**', redirectTo: 'create' },
];
