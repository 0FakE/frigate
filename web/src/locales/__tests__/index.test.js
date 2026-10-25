import { setLocaleMessages, t } from '../index';

describe('nested German camera editor translations', () => {
  afterEach(() => setLocaleMessages(null));

  test('resolves UI copy by page, view, component and key', () => {
    expect(t('cameras.debug.editor.button.open')).toBe('Zonen & Masken Editor');
    expect(t('cameras.debug.editor.button.close')).toBe('Editor schließen');
    expect(t('cameras.debug.editor.status.loading_stream')).toBe('Kamera Vorschau wird geladen…');
    expect(t('cameras.debug.editor.button.mask')).toBe('+ Maske');
    expect(t('cameras.debug.editor.button.object_filter')).toBe('+ Objektfilter');
    expect(t('cameras.debug.editor.header.new_area')).toBe('Neuen Bereich erstellen');
    expect(t('cameras.debug.editor.header.covered_areas', { count: 0 })).toBe('Abgedeckte Bereiche (0)');
  });

  test('host-defined text wins and does not replace unrelated nested default keys', () => {
    setLocaleMessages({ cameras: { debug: { editor: { button: { open: 'Mein eigener Editor' } } } } });
    expect(t('cameras.debug.editor.button.open')).toBe('Mein eigener Editor');
    expect(t('cameras.debug.editor.header.new_area')).toBe('Neuen Bereich erstellen');
    expect(t('cameras.debug.editor.button.zone')).toBe('+ Zone');
  });

  test('interpolates placeholders from editable host entries and rejects invalid override values', () => {
    setLocaleMessages({ cameras: { debug: { editor: {
      header: { existing_areas: 'Bearbeitete Bereiche ({count})' },
      button: { open: ['not a string'] },
    } } } });
    expect(t('cameras.debug.editor.header.existing_areas', { count: 12 })).toBe('Bearbeitete Bereiche (12)');
    expect(t('cameras.debug.editor.button.open')).toBe('Zonen & Masken Editor');
  });

  test('interpolates area names and counts without HTML in the locale', () => {
    expect(t('cameras.debug.editor.header.existing_areas', { count: 4 })).toBe('Vorhandene Bereiche (4)');
    expect(t('cameras.debug.editor.warning.invalid_object_filter', { name: 'person 1' }))
      .toContain('Der Objektfilter „person 1“ kann nicht gespeichert werden.');
  });
});
