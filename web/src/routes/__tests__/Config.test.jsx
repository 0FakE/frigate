import { setSyncedConfigContents, syncConfigModel } from '../../utils/configModelSync';

function mockMonacoModel(initial) {
  let value = initial;
  return {
    getValue: vi.fn(() => value),
    setValue: vi.fn((next) => { value = next; }),
  };
}

describe('Config editor raw YAML synchronization', () => {
  test('shows new on-disk YAML immediately when the Monaco model has no local edits', () => {
    const model = mockMonacoModel('cameras:\\n  old: true\\n');
    setSyncedConfigContents(model, model.getValue());

    expect(syncConfigModel(model, 'cameras:\\n  polygon_saved: true\\n')).toBe(true);
    expect(model.getValue()).toContain('polygon_saved: true');
    expect(model.setValue).toHaveBeenCalledTimes(1);
  });

  test('never overwrites uncommitted local YAML with polygon-editor changes', () => {
    const model = mockMonacoModel('cameras:\\n  old: true\\n');
    setSyncedConfigContents(model, model.getValue());
    model.setValue('cameras:\\n  locally_edited: true\\n');

    expect(syncConfigModel(model, 'cameras:\\n  polygon_saved: true\\n')).toBe(false);
    expect(model.getValue()).toContain('locally_edited: true');
    expect(model.getValue()).not.toContain('polygon_saved: true');
  });

  test('a saved model can be synchronized again after updating its baseline', () => {
    const model = mockMonacoModel('initial');
    setSyncedConfigContents(model, 'initial');
    model.setValue('saved in Config page');
    setSyncedConfigContents(model, 'saved in Config page');

    expect(syncConfigModel(model, 'polygons saved later')).toBe(true);
    expect(model.getValue()).toBe('polygons saved later');
    expect(syncConfigModel(model, 'polygons saved later')).toBe(false);
  });
});
