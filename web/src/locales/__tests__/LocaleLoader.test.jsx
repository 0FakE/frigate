import { h } from 'preact';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import axios from 'axios';
import LocaleLoader from '../LocaleLoader';
import { setLocaleMessages, t } from '../index';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));

function Probe() {
  return <div>{t('cameras.debug.editor.button.open')}</div>;
}

describe('host locale bootstrap', () => {
  beforeEach(() => {
    axios.get.mockReset();
    setLocaleMessages(null);
  });
  afterEach(() => setLocaleMessages(null));

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

  test('malformed host JSON reported by server has visible dismissible warning', async () => {
    axios.get.mockResolvedValue({
      data: { language: 'de', messages: {}, warning: 'Die Sprachdatei /config/lang/de.json ist ungültig.' },
    });
    render(<LocaleLoader><Probe /></LocaleLoader>);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('ungültig'));
    expect(screen.getByText('Zonen & Masken Editor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hinweis schließen' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a network error does not prevent the built-in UI from mounting', async () => {
    axios.get.mockRejectedValue(new Error('offline'));
    render(<LocaleLoader><Probe /></LocaleLoader>);
    await waitFor(() => expect(screen.getByText('Zonen & Masken Editor')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Die externe Sprachdatei konnte nicht geladen werden.');
  });
});
