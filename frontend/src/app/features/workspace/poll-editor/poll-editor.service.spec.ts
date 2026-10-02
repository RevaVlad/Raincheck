import { PollEditorService } from './poll-editor.service';

describe('PollEditorService', () => {
  it('replaces an existing cell kind when painting with another brush', () => {
    const editor = new PollEditorService();

    editor.paint('2026-10-06', '09:00', 'PREFERRED');
    editor.paint('2026-10-06', '09:00', 'UNAVAILABLE');

    expect(editor.cellAt('2026-10-06', '09:00')).toBe('UNAVAILABLE');
    expect(editor.toIntervals()).toEqual([
      {
        localDate: '2026-10-06',
        startTime: '09:00',
        endTime: '09:30',
        kind: 'UNAVAILABLE',
        preferenceDirection: null,
      },
    ]);
  });
});
