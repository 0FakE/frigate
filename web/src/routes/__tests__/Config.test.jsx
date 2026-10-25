import { h } from 'preact';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import useSWR from 'swr';
import axios from 'axios';
import { editor } from 'monaco-editor';
import Config from '../Config';

vi.mock('swr', () => ({ default: vi.fn() }));
vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../../api', () => ({ useApiHost: () => '/' }));
vi.mock('monaco-yaml', () => ({ setDiagnosticsOptions: vi.fn() }));
vi.mock('monaco-editor', () => ({
  Uri: { parse: vi.fn((value) => value) },
  editor: {
    getModel: vi.fn(),
    createModel: vi.fn(),
    create: vi.fn(),
  },
}));

describe('Config editor raw YAML synchronization', () => {
  let storedModel;
  let mutate;

  beforeEach(() => {
    storedModel = null;
    mutate = vi.fn();
    window.editor = null;
    useSWR.mockReturnValue({ data: 'cameras:\\n  old: true\\n', mutate });
    editor.getModel.mockReset().mockImplementation(() => storedModel);
    editor.createModel.mockReset().mockImplementation((text) => {
      let contents = text;
      storedModel = {
        getValue: vi.fn(() => contents),
        setValue: vi.fn((updated) => { contents = updated; }),
      };
      return storedModel;
    });
    editor.create.mockReset().mockImplementation((container, options) => {
      container.appendChild(document.createElement('div'));
      return { getModel: () => options.model, getValue: () => options.model.getValue(), dispose: vi.fn() };
    });
    axios.post.mockReset().mockResolvedValue({ status: 200, data: { message: 'saved' } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.editor = null;
  });

  test('updates a clean Monaco document when raw config changes without restarting Frigate', async () => {
    const { rerender } = render(<Config />);
    await waitFor(() => expect(editor.createModel).toHaveBeenCalledTimes(1));
    expect(storedModel.getValue()).toContain('old: true');

    useSWR.mockReturnValue({ data: 'cameras:\\n  updated: true\\n', mutate });
    rerender(<Config />);

    await waitFor(() => expect(storedModel.getValue()).toContain('updated: true'));
    expect(storedModel.setValue).toHaveBeenCalledWith('cameras:\\n  updated: true\\n');
  });

  test('preserves unsaved local YAML when another editor saves to disk', async () => {
    const { rerender } = render(<Config />);
    await waitFor(() => expect(editor.createModel).toHaveBeenCalledTimes(1));
    storedModel.setValue('cameras:\\n  my_unsaved_edit: true\\n');

    useSWR.mockReturnValue({ data: 'cameras:\\n  polygon_editor_saved: true\\n', mutate });
    rerender(<Config />);

    expect(storedModel.getValue()).toContain('my_unsaved_edit: true');
    expect(storedModel.getValue()).not.toContain('polygon_editor_saved');
  });

  test('marks Save Only as synchronized and updates the raw SWR cache', async () => {
    render(<Config />);
    await waitFor(() => expect(editor.createModel).toHaveBeenCalledTimes(1));
    storedModel.setValue('cameras:\\n  saved_from_config: true\\n');

    fireEvent.click(screen.getByRole('button', { name: 'Save Only' }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith('cameras:\\n  saved_from_config: true\\n', false));
  });
});
