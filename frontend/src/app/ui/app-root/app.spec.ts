import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { appConfig } from '../../app.config';
import { BrowserTimeZoneService } from '@shared/lib/dates';

describe('App', () => {
  it('renders the routed application shell', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: appConfig.providers,
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
    expect(TestBed.inject(BrowserTimeZoneService).timeZone).toBeTruthy();
  });
});
