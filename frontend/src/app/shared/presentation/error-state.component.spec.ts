import { TestBed } from '@angular/core/testing';
import { ErrorStateComponent } from './error-state.component';

describe('ErrorStateComponent', () => {
  it('announces feature-specific error copy without rendering a retry action by default', async () => {
    await TestBed.configureTestingModule({ imports: [ErrorStateComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ErrorStateComponent);
    fixture.componentRef.setInput('message', 'Не удалось загрузить результаты.');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Не удалось загрузить результаты.',
    );
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('emits retry only when a retry label is provided', async () => {
    await TestBed.configureTestingModule({ imports: [ErrorStateComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ErrorStateComponent);
    fixture.componentRef.setInput('message', 'Не удалось загрузить результаты.');
    fixture.componentRef.setInput('retryLabel', 'Повторить');
    fixture.detectChanges();
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

    expect(retry).toHaveBeenCalledOnce();
  });
});
