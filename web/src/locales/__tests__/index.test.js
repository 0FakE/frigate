import { t } from '../index';

describe('nested German camera editor translations', () => {
  test('resolves UI copy by page, view, component and key', () => {
    expect(t('cameras.debug.editor.button.close')).toBe('Editor schließen');
    expect(t('cameras.debug.editor.button.mask')).toBe('+ Maske');
    expect(t('cameras.debug.editor.button.object_filter')).toBe('+ Objektfilter');
    expect(t('cameras.debug.editor.header.new_area')).toBe('Neuer Bereich erstellen');
    expect(t('cameras.debug.editor.header.covered_areas', { count: 0 })).toBe('Abgedeckte Bereiche (0)');
  });

  test('interpolates area names and counts without HTML in the locale', () => {
    expect(t('cameras.debug.editor.header.existing_areas', { count: 4 })).toBe('Vorhandene Bereiche (4)');
    expect(t('cameras.debug.editor.warning.invalid_object_filter', { name: 'person 1' }))
      .toContain('Der Objektfilter „person 1“ kann nicht gespeichert werden.');
  });
});
