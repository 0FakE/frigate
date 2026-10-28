import { getFrigateStarted, isNewFrigateProcess,
  RESTART_CHECK_INTERVAL_MS, RESTART_MONITOR_TIMEOUT_MS } from '../restartMonitor';

describe('Frigate restart process identity', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('uncached API response provides previous process start time', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ service: { last_updated: 1793200000, uptime: 125 } }),
    });
    expect(await getFrigateStarted()).toBe(1793199875);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringMatching(/api\/stats$/),
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }));
  });

  test('rejects unavailable or invalid status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    await expect(getFrigateStarted()).rejects.toThrow('unavailable');
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ service: { uptime: 5 } }) });
    await expect(getFrigateStarted()).rejects.toThrow('missing process uptime');
  });

  test('tolerates timestamp jitter but identifies a restarted process', () => {
    expect(isNewFrigateProcess(100, 100)).toBe(false);
    expect(isNewFrigateProcess(100, 101)).toBe(false);
    expect(isNewFrigateProcess(100, 104)).toBe(true);
    expect(isNewFrigateProcess(100, NaN)).toBe(false);
    expect(RESTART_CHECK_INTERVAL_MS).toBe(3000);
    expect(RESTART_MONITOR_TIMEOUT_MS).toBe(180000);
  });
});
