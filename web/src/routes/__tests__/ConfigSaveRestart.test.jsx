import { h } from 'preact';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import Config from '../Config';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  restart: vi.fn(),
  mutate: vi.fn(),
  model: {
    getValue: vi.fn(() => 'mqtt:\\n  host: test'),
    setValue: vi.fn(),
  },
  widget: {
    getValue: vi.fn(() => 'mqtt:\\n  host: test'),
    getModel: vi.fn(),
    dispose: vi.fn(),
  },
}));

vi.mock('axios', () => ({ default: { post: mocks.post } }));
vi.mock('swr', () => ({
  default: () => ({ data: 'mqtt:\\n  host: test', mutate: mocks.mutate }),
}));
vi.mock('monaco-yaml', () => ({ setDiagnosticsOptions: vi.fn() }));
vi.mock('monaco-editor', () => ({
  editor: {
    getModel: () => mocks.model,
    createModel: () => mocks.model,
    create: () => mocks.widget,
  },
  Uri: { parse: (url) => url },
}));
vi.mock('../../api', () => ({ useApiHost: () => '/' }));
vi.mock('../../util/restartMonitor', async () => {
  const real = await vi.importActual('../../util/restartMonitor');
  return { ...real, requestFrigateRestart: mocks.restart };
});

describe('Config editor restart flow', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.restart.mockReset();
    mocks.mutate.mockReset();
    mocks.widget.getModel.mockReturnValue(mocks.model);
  });

  test('Save & Restart validates and saves once before opening the shared restart modal', async () => {
    let finishSave;
    mocks.post.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    render(<Config />);

    fireEvent.click(screen.getByRole('button', { name: 'Save & Restart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save & Restart' }));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith(
      'config/save?save_option=saveonly', expect.any(String), expect.any(Object)
    );
    expect(mocks.restart).not.toHaveBeenCalled();

    finishSave({ status: 200, data: { success: true, message: 'Config successfully saved.' } });
    await waitFor(() => expect(mocks.restart).toHaveBeenCalledTimes(1));
    expect(mocks.mutate).toHaveBeenCalled();
    expect(screen.queryByText('Config successfully saved.')).not.toBeInTheDocument();
  });

  test('save failure keeps the error visible and does not send a restart', async () => {
    mocks.post.mockRejectedValue({ response: { data: { message: 'Invalid configuration' } } });
    render(<Config />);
    fireEvent.click(screen.getByRole('button', { name: 'Save & Restart' }));
    await waitFor(() => expect(screen.getByText('Invalid configuration')).toBeInTheDocument());
    expect(mocks.restart).not.toHaveBeenCalled();
  });

  test('Save Only keeps the normal success message and never restarts', async () => {
    mocks.post.mockResolvedValue({ status: 200, data: { success: true, message: 'Config successfully saved.' } });
    render(<Config />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Only' }));
    await waitFor(() => expect(screen.getByText('Config successfully saved.')).toBeInTheDocument());
    expect(mocks.restart).not.toHaveBeenCalled();
  });
});
