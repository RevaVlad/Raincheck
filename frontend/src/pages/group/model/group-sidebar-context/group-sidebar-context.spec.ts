import { TestBed } from '@angular/core/testing';
import { GroupSidebarContext } from './group-sidebar-context.service';

describe('GroupSidebarContext', () => {
  it('clears its temporary presentation when the child releases it', () => {
    TestBed.configureTestingModule({ providers: [GroupSidebarContext] });
    const context = TestBed.inject(GroupSidebarContext);
    const presentation = () => ({ showParticipantStatuses: false });

    const cleanup = context.setPresentationOverride(presentation);

    expect(context.temporaryPresentation()?.()).toEqual({ showParticipantStatuses: false });
    cleanup();
    expect(context.temporaryPresentation()).toBeNull();
  });
});
