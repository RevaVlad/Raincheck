import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { throwError, of } from 'rxjs';
import { CreateGroupApiService } from './create-group-api.service';
import { CreateGroupPageComponent } from './create-group-page.component';

describe('CreateGroupPageComponent', () => {
  it('creates only the group and opens the profile route', async () => {
    const createGroup = vi.fn().mockReturnValue(
      of({
        group: { id: 'group-id', name: 'Team', inviteCode: 'invite-code' },
        currentPoll: null,
      }),
    );
    await TestBed.configureTestingModule({
      imports: [CreateGroupPageComponent],
      providers: [provideRouter([]), { provide: CreateGroupApiService, useValue: { createGroup } }],
    }).compileComponents();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(CreateGroupPageComponent);
    const component = fixture.componentInstance;
    component.form.setValue({ groupName: 'Team' });

    await component.submit();

    expect(createGroup).toHaveBeenCalledWith({ name: 'Team' });
    expect(navigate).toHaveBeenCalledWith(['/g', 'invite-code', 'profile']);
  });

  it('does not create a group without a name', async () => {
    const createGroup = vi.fn().mockReturnValue(of({}));
    await TestBed.configureTestingModule({
      imports: [CreateGroupPageComponent],
      providers: [provideRouter([]), { provide: CreateGroupApiService, useValue: { createGroup } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(CreateGroupPageComponent);
    await fixture.componentInstance.submit();

    expect(createGroup).not.toHaveBeenCalled();
  });

  it('shows group creation errors without navigating', async () => {
    const createGroup = vi.fn().mockReturnValue(throwError(() => new Error('offline')));
    await TestBed.configureTestingModule({
      imports: [CreateGroupPageComponent],
      providers: [provideRouter([]), { provide: CreateGroupApiService, useValue: { createGroup } }],
    }).compileComponents();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(CreateGroupPageComponent);
    fixture.componentInstance.form.setValue({ groupName: 'Team' });

    await fixture.componentInstance.submit();

    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.errorMessage()).toBeTruthy();
  });

  it('renders only the group name input', async () => {
    await TestBed.configureTestingModule({
      imports: [CreateGroupPageComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CreateGroupPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(1);
  });
});
