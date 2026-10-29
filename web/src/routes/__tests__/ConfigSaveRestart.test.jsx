import { saveConfigAndMaybeRestart } from '../../util/configSaveRestart';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  restart: vi.fn(),
  onSaved: vi.fn(),
}));

vi.mock('axios', () => ({ default: { post: mocks.post } }));
vi.mock('../../util/restartMonitor', () => ({
  requestFrigateRestart: mocks.restart,
}));

describe('Config editor save-and-restart contract', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.restart.mockReset();
    mocks.onSaved.mockReset();
  });

  test('Save & Restart validates and saves once before requesting the monitored restart', async () => {
    let finishSave;
    mocks.post.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    const save = saveConfigAndMaybeRestart('mqtt:\\n  host: test', 'restart', mocks.onSaved);

    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith(
      'config/save?save_option=saveonly', expect.any(String), expect.any(Object)
    );
    expect(mocks.restart).not.toHaveBeenCalled();
    expect(mocks.onSaved).not.toHaveBeenCalled();

    finishSave({ status: 200, data: { success: true, message: 'Config successfully saved.' } });
    await expect(save).resolves.toBe('');
    expect(mocks.onSaved).toHaveBeenCalledTimes(1);
    expect(mocks.restart).toHaveBeenCalledTimes(1);
    expect(mocks.onSaved.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.restart.mock.invocationCallOrder[0]);
  });

  test('validation errors do not request restart or update the editor baseline', async () => {
    mocks.post.mockRejectedValue({ response: { data: { message: 'Invalid configuration' } } });
    await expect(saveConfigAndMaybeRestart('bad config', 'restart', mocks.onSaved)).rejects.toBeDefined();
    expect(mocks.restart).not.toHaveBeenCalled();
    expect(mocks.onSaved).not.toHaveBeenCalled();
  });

  test('an unsuccessful response, even with HTTP 200, must not restart', async () => {
    mocks.post.mockResolvedValue({ status: 200, data: { success: false, message: 'Invalid configuration' } });
    await expect(saveConfigAndMaybeRestart('bad config', 'restart', mocks.onSaved))
      .rejects.toThrow('Invalid configuration');
    expect(mocks.restart).not.toHaveBeenCalled();
    expect(mocks.onSaved).not.toHaveBeenCalled();
  });

  test('Save Only preserves its success message without restarting', async () => {
    mocks.post.mockResolvedValue({ status: 200, data: { success: true, message: 'Config successfully saved.' } });
    await expect(saveConfigAndMaybeRestart('mqtt:\\n  host: test', 'saveonly', mocks.onSaved))
      .resolves.toBe('Config successfully saved.');
    expect(mocks.onSaved).toHaveBeenCalledTimes(1);
    expect(mocks.restart).not.toHaveBeenCalled();
  });
});
