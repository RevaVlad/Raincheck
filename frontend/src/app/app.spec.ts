import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  it('renders the routed application shell', async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });
});
