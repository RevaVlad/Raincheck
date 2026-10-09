import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-error-state',
  templateUrl: './error-state.component.html',
  styles: ':host { display: block; }',
})
export class ErrorStateComponent {
  readonly message = input.required<string>();
  readonly retryLabel = input<string | null>(null);
  readonly retry = output<void>();
}
