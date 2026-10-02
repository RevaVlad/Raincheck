import { Routes } from '@angular/router';
import { CreateGroupPageComponent } from './features/create-group/create-group-page.component';
import { GroupEntryPageComponent } from './features/group-entry/group-entry-page.component';

export const routes: Routes = [
  { path: 'create', component: CreateGroupPageComponent },
  { path: 'g/:inviteCode', component: GroupEntryPageComponent },
  { path: '', pathMatch: 'full', redirectTo: 'create' },
  { path: '**', redirectTo: 'create' },
];
