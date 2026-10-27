/* eslint-disable no-console -- verify browser fallback warnings */
import { h } from 'preact';
import { render, screen, waitFor } from '@testing-library/preact';
import axios from 'axios';
import LocaleLoader from '../LocaleLoader';
import { setLocaleMessages, t } from '../index';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

function Probe() {
  return <div>{t('cameras.debug.editor.button.open')}</div>;
}

describe('host locale bootstrap', () => {
  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset().mockResolvedValue({ status: 204 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setLocaleMessages(null);
  });
  afterEach(() => {
    setLocaleMessages(null);
    vi.restoreAllMocks();
  });

  test('loads host labels before the main UI mounts', async () => {
    axios.get.mockResolvedValue({
      data: { language: 'de', messages: {
        cameras: { debug: { editor: { button: { open: 'Mein Editor' } } } },
      }, warning: null },
    });
    render(<LocaleLoader><Probe /></LocaleLoader>);
    await waitFor(() => expect(screen.getByText('Mein Editor')).toBeInTheDocument());
    expect(axios.get).toHaveBeenCalledWith('lang/de', expect.objectContaining({
      headers: { 'Cache-Control': 'no-cache' },
    }));
  });

  test('server-side locale warnings stay in Frigate logs without a visible toast', async () => {
    axios.get.mockResolvedValue({
      data: { language: 'de', messages: {}, warning: 'Die Sprachdatei /config/lang/de.json ist ungültig.' },
    });
    render(<LocaleLoader><Probe /></LocaleLoader>);
    await waitFor(() => expect(screen.getByText('Zonen & Masken Editor')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(console.warn).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('a network error logs to Frigate and uses the built-in UI without a toast', async () => {
    const error = Object.assign(new Error('offline'), { response: { status: 503 } });
    axios.get.mockRejectedValue(error);
    render(<LocaleLoader><Probe /></LocaleLoader>);
    await waitFor(() => expect(screen.getByText('Zonen & Masken Editor')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledWith(
      'Die externe Sprachdatei konnte nicht geladen werden. Die integrierten deutschen Texte werden verwendet.',
      error
    );
    expect(axios.post).toHaveBeenCalledWith('lang/de/client-warning', {
      reason: 'request_failed', status: 503,
    });
  });

  test('malformed API response logs a specific warning and keeps the fallback', async () => {
    axios.get.mockResolvedValue({ data: { messages: [] } });
    render(<LocaleLoader><Probe /></LocaleLoader>);
    await waitFor(() => expect(screen.getByText('Zonen & Masken Editor')).toBeInTheDocument());
    expect(axios.post).toHaveBeenCalledWith('lang/de/client-warning', {
      reason: 'invalid_response', status: null,
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('missing backend still uses the fallback when warning report also fails', async () => {
    axios.get.mockRejectedValue(new Error('offline'));
    axios.post.mockRejectedValue(new Error('offline'));
    render(<LocaleLoader><Probe /></LocaleLoader>);
    await waitFor(() => expect(screen.getByText('Zonen & Masken Editor')).toBeInTheDocument());
    expect(console.warn).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
