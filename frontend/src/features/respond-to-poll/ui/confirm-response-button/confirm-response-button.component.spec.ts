import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import type { SaveState } from '../../model/availability.types';
import { PollEditorService } from '../../model/poll-editor/poll-editor.service';
import { ConfirmResponseButtonComponent } from './confirm-response-button.component';

describe('ConfirmResponseButtonComponent', () => {
  async function createButton(
    responseId: string | null,
    responseState: 'DRAFT' | 'CONFIRMED',
    saveState: SaveState = 'SAVED',
  ) {
    const editor = {
      responseId: signal(responseId),
      responseState: signal(responseState),
      saveState: signal(saveState),
      confirm: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [ConfirmResponseButtonComponent],
      providers: [provideRouter([])],
    })
      .overrideComponent(ConfirmResponseButtonComponent, {
        set: { providers: [{ provide: PollEditorService, useValue: editor }] },
      })
      .compileComponents();
    const fixture = TestBed.createComponent(ConfirmResponseButtonComponent);
    fixture.componentRef.setInput('inviteCode', 'invite-code');
    fixture.componentRef.setInput('pollId', 'poll-id');
    fixture.detectChanges();
    return { fixture, editor };
  }

  it('keeps confirmation unavailable before a response has been created', async () => {
    const { fixture } = await createButton(null, 'DRAFT');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    expect(button.textContent.trim()).toBe('Подтвердить ответ');
    expect(button.disabled).toBe(true);
  });

  it('confirms a draft response', async () => {
    const { fixture, editor } = await createButton('response-id', 'DRAFT');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    expect(button.disabled).toBe(false);
    button.click();

    expect(editor.confirm).toHaveBeenCalledOnce();
  });

  it('shows the completed state after confirmation succeeds', async () => {
    const { fixture, editor } = await createButton('response-id', 'DRAFT');
    editor.confirm.mockImplementation(() => editor.responseState.set('CONFIRMED'));
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    fixture.detectChanges();

    expect(button.textContent.trim()).toBe('Ответ подтверждён');
    expect(button.disabled).toBe(true);
  });

  it('enables confirmation again after editing returns the response to a draft', async () => {
    const { fixture, editor } = await createButton('response-id', 'CONFIRMED');
    editor.responseState.set('DRAFT');
    editor.saveState.set('DIRTY');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('button').disabled).toBe(false);
  });

  it('disables confirmation while the response is loading', async () => {
    const { fixture } = await createButton('response-id', 'DRAFT', 'LOADING');

    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
  });

  it('keeps the results link unavailable until the response is confirmed', async () => {
    const { fixture, editor } = await createButton('response-id', 'DRAFT');
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a');

    expect(link.textContent.trim()).toBe('Посмотреть результаты');
    expect(link.getAttribute('href')).toBeNull();
    expect(link.getAttribute('aria-disabled')).toBe('true');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    link.click();
    expect(navigate).not.toHaveBeenCalled();

    editor.responseState.set('CONFIRMED');
    fixture.detectChanges();

    expect(link.getAttribute('aria-disabled')).toBeNull();
    expect(link.getAttribute('href')).toBe('/g/invite-code/polls/poll-id/results');
  });
});
