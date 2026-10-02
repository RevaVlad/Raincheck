import { TestBed } from '@angular/core/testing';
import { CreateGroupPageComponent } from './create-group-page.component';

describe('CreateGroupPageComponent', () => {
  it('renders the required static schedule fields', async () => {
    await TestBed.configureTestingModule({
      imports: [CreateGroupPageComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CreateGroupPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Создать группу');
    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(6);
  });
});
