import { TestBed } from '@angular/core/testing';
import { LoadingStateComponent } from './loading-state.component';

describe('LoadingStateComponent', () => {
  it('announces loading and hides decorative skeleton shapes for every layout', async () => {
    await TestBed.configureTestingModule({ imports: [LoadingStateComponent] }).compileComponents();
    const fixture = TestBed.createComponent(LoadingStateComponent);
    fixture.componentRef.setInput('statusText', 'Загружаем расписание…');

    for (const layout of ['group', 'results', 'editor'] as const) {
      fixture.componentRef.setInput('layout', layout);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[role="status"]').textContent.trim()).toBe(
        'Загружаем расписание…',
      );
      expect(fixture.nativeElement.querySelector('[role="status"]').getAttribute('aria-live')).toBe(
        'polite',
      );
      expect(fixture.nativeElement.querySelector('[aria-hidden="true"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeTruthy();
    }
  });
});
