import { Component, input } from '@angular/core';

export type LoadingLayout = 'group' | 'results' | 'editor';

@Component({
  selector: 'app-loading-state',
  templateUrl: './loading-state.component.html',
  styles: ':host { display: block; }',
})
export class LoadingStateComponent {
  readonly layout = input.required<LoadingLayout>();
  readonly statusText = input.required<string>();
}
