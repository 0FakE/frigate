import { setLocaleMessages, t } from '../index';

describe('nested German camera editor translations', () => {
  afterEach(() => setLocaleMessages(null));

  test('resolves UI copy by page, view, component and key', () => {
    expect(t('cameras.debug.editor.button.open')).toBe('Zonen & Masken Editor');
    expect(t('cameras.debug.editor.button.close')).toBe('Editor schließen');
    expect(t('cameras.debug.editor.status.loading_stream')).toBe('Kamera Vorschau wird geladen…');
    expect(t('cameras.debug.editor.button.mask')).toBe('Maske');
    expect(t('cameras.debug.editor.button.object_filter')).toBe('Objektfilter');
    expect(t('cameras.debug.editor.header.new_area')).toBe('Neuen Bereich erstellen');
    expect(t('cameras.debug.editor.header.mobile_menu')).toBe('cameras.debug.editor.header.mobile_menu');
    expect(t('cameras.debug.editor.header.covered_areas', { count: 0 })).toBe('Abgedeckte Bereiche');
    expect(t('cameras.debug.editor.modal.error.invalid_zone_name')).toBe(
      'Der eingegebene Zonenname ist ungültig. Bitte verwende ausschließlich Buchstaben, Zahlen und Unterstriche.'
    );
    expect(t('cameras.debug.editor.modal.warning.invalid_zone', { name: 'Einfahrt' })).toBe(
      'Die Zone „Einfahrt“ kann nicht gespeichert werden. Bitte lege mindestens drei Eckpunkte fest, die nicht auf einer Linie liegen.'
    );
  });

  test('host-defined text wins and does not replace unrelated nested default keys', () => {
    setLocaleMessages({ cameras: { debug: { editor: { button: { open: 'Mein eigener Editor' } } } } });
    expect(t('cameras.debug.editor.button.open')).toBe('Mein eigener Editor');
    expect(t('cameras.debug.editor.header.new_area')).toBe('Neuen Bereich erstellen');
    expect(t('cameras.debug.editor.button.zone')).toBe('Zone');
  });

  test('interpolates placeholders from editable host entries and rejects invalid override values', () => {
    setLocaleMessages({ cameras: { debug: { editor: {
      header: { existing_areas: 'Bearbeitete Bereiche' },
      button: { open: ['not a string'] },
    } } } });
    expect(t('cameras.debug.editor.header.existing_areas')).toBe('Bearbeitete Bereiche');
    expect(t('cameras.debug.editor.button.open')).toBe('Zonen & Masken Editor');
  });

  test('new host modal texts override bundled messages and interpolate placeholders', () => {
    setLocaleMessages({ cameras: { debug: { editor: {
      modal: {
        error: { duplicate_zone_name: 'Zone existiert bereits.' },
        warning: { invalid_zone: 'Die Zone {name} benötigt drei Punkte.' },
      },
    } } } });
    expect(t('cameras.debug.editor.modal.error.duplicate_zone_name'))
      .toBe('Zone existiert bereits.');
    expect(t('cameras.debug.editor.modal.warning.invalid_zone', { name: 'Garten' }))
      .toBe('Die Zone Garten benötigt drei Punkte.');
    expect(t('cameras.debug.editor.modal.error.invalid_object_name'))
      .toBe('Der eingegebene Objektname ist ungültig. Bitte verwende ausschließlich Buchstaben, Zahlen und Unterstriche.');
  });

  test('superseded host error/warning keys are ignored without backwards compatibility', () => {
    setLocaleMessages({ cameras: { debug: { editor: {
      error: { invalid_zone_name: 'Veralteter Fehler' },
      warning: { invalid_zone: 'Veraltete Warnung' },
    } } } });
    expect(t('cameras.debug.editor.modal.error.invalid_zone_name'))
      .toBe('Der eingegebene Zonenname ist ungültig. Bitte verwende ausschließlich Buchstaben, Zahlen und Unterstriche.');
    expect(t('cameras.debug.editor.modal.warning.invalid_zone', { name: 'Garten' }))
      .toContain('Die Zone „Garten“ kann nicht gespeichert werden.');
  });

  test('malformed host modal values use bundled defaults', () => {
    setLocaleMessages({ cameras: { debug: { editor: {
      modal: { error: { invalid_zone_name: [] }, warning: { invalid_zone: 123 } },
    } } } });
    expect(t('cameras.debug.editor.modal.error.invalid_zone_name'))
      .toContain('Der eingegebene Zonenname ist ungültig.');
    expect(t('cameras.debug.editor.modal.warning.invalid_zone', { name: 'Garten' }))
      .toContain('Die Zone „Garten“ kann nicht gespeichert werden.');
  });

  test('every native browser alert has a bundled translation in the new modal namespace', () => {
    const errors = [
      'invalid_zone_name', 'duplicate_zone_name', 'invalid_object_name',
      'load_failed', 'save_failed', 'unknown_details',
    ];
    const warnings = ['invalid_zone', 'invalid_covered_area', 'invalid_object_filter'];
    errors.forEach((key) => {
      const path = `cameras.debug.editor.modal.error.${key}`;
      expect(t(path, { details: 'Testfehler.' })).not.toBe(path);
    });
    warnings.forEach((key) => {
      const path = `cameras.debug.editor.modal.warning.${key}`;
      expect(t(path, { name: 'Testzone' })).toContain('Testzone');
    });
  });

  test('modern camera interface and editor labels all have localized defaults', () => {
    const keys = [
      'cameras.page.detect_resolution',
      'cameras.page.stream_source',
      'cameras.page.camera_preview',
      'cameras.page.tracked_objects',
      'cameras.page.control_panel',
      'cameras.page.preview_loading',
      'cameras.page.preview_error',
      'cameras.page.back_to_cameras',
      'cameras.page.stream_source_jsmpeg',
      'cameras.page.stream_source_mse',
      'cameras.page.stream_source_webrtc',
      'cameras.page.mse_unsupported',
      'cameras.debug.controls.options_show',
      'cameras.debug.controls.options_hide',
      'cameras.debug.controls.options_title',
      'cameras.debug.controls.bounding_box',
      'cameras.debug.controls.timestamp',
      'cameras.debug.controls.zones',
      'cameras.debug.controls.motion_masks',
      'cameras.debug.controls.motion_boxes',
      'cameras.debug.controls.regions',
      'cameras.debug.editor.label.no_selection',
      'cameras.debug.editor.label.vertex_count',
      'cameras.debug.editor.button.discard_changes',
      'cameras.debug.editor.button.save_changes',
      'cameras.objects.class.person',
      'cameras.objects.class.car',
    ];
    keys.forEach((path) => expect(t(path)).not.toBe(path));
    expect(t('cameras.page.detect_resolution', { width: 640, height: 360 }))
      .toBe('Auflösung: 640 × 360');
    expect(t('cameras.page.subtitle')).toBe('cameras.page.subtitle');
    expect(t('cameras.debug.editor.label.vertex_count', { count: 3 }))
      .toBe('Eckpunkte: 3');
    expect(t('cameras.debug.editor.label.no_selection'))
      .toBe('Wähle einen Bereich zum Bearbeiten aus.');
    expect(t('cameras.page.preview_loading')).toBe('Kamera Vorschau wird geladen…');
    expect(t('cameras.page.view_events')).toBe('cameras.page.view_events');
  });

  test('interpolates area names and counts without HTML in the locale', () => {
    expect(t('cameras.debug.editor.header.existing_areas')).toBe('Vorhandene Bereiche');
    expect(t('cameras.debug.editor.modal.warning.invalid_object_filter', { name: 'person 1' }))
      .toContain('Der Objektfilter „person 1“ kann nicht gespeichert werden.');
  });
});
