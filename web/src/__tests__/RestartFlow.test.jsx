import { h } from 'preact';
import { act, fireEvent, render, screen } from '@testing-library/preact';
import * as Context from '../context';
import AppBar from '../AppBar';

const mocks = vi.hoisted(() => ({
  started: vi.fn(),
  reload: vi.fn(),
  send: vi.fn(),
  socket: { ready: true },
}));

vi.mock('../api/ws', async () => {
  const real = await vi.importActual('../api/ws');
  return {
    ...real,
    useRestart: () => ({ send: mocks.send }),
    useWsReady: () => mocks.socket.ready,
  };
});

vi.mock('../util/restartMonitor', async () => {
  const real = await vi.importActual('../util/restartMonitor');
  return {
    ...real,
    getFrigateStarted: mocks.started,
    reloadFrigatePage: mocks.reload,
  };
});

describe('automatic Frigate restart monitor', () => {
  beforeEach(() => {
    mocks.started.mockReset();
    mocks.send.mockReset();
    mocks.reload.mockReset();
    mocks.socket.ready = true;
    vi.spyOn(Context, 'useDarkMode').mockImplementation(() => ({
      persistedMode: 'dark', currentMode: 'dark', setDarkMode: vi.fn(),
    }));
    vi.spyOn(Context, 'DarkModeProvider').mockImplementation(({ children }) => <div>{children}</div>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mountAndConfirm() {
    render(<Context.DarkModeProvider><Context.DrawerProvider><AppBar /></Context.DrawerProvider></Context.DarkModeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Weitere Optionen' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Frigate neu starten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Neu starten' }));
  }

  test('baseline read comes before websocket restart send', async () => {
    mocks.started.mockResolvedValue(1234);
    mountAndConfirm();
    expect(screen.getByRole('dialog', { name: 'Frigate wird neu gestartet' }))
      .toHaveTextContent('Der aktuelle Prozess wird geprüft');
    await act(async () => { await Promise.resolve(); });
    expect(mocks.started).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Frigate wird neu gestartet' }))
      .toHaveTextContent('Warte auf den neuen Prozess');
  });

  test('failed baseline read never sends a restart and offers retry or cancel', async () => {
    mocks.started.mockRejectedValue(new Error('offline'));
    mountAndConfirm();
    await act(async () => { await Promise.resolve(); });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Neustart konnte nicht ausgelöst werden' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('old process is ignored and reload only follows two confirmed checks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    mocks.started.mockResolvedValueOnce(100)
      .mockResolvedValueOnce(100).mockResolvedValueOnce(110).mockResolvedValueOnce(110);
    mountAndConfirm();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mocks.reload).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByRole('dialog', { name: 'Frigate wird neu gestartet' }))
      .toHaveTextContent('Verbindung wird überprüft');
    expect(mocks.reload).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  test('180 second timeout provides retry polling and manual reload', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    mocks.started.mockResolvedValue(100);
    mountAndConfirm();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(180000); });
    expect(screen.getByRole('dialog', { name: 'Frigate ist weiterhin nicht erreichbar' }))
      .toHaveTextContent('Container-Logs');
    expect(mocks.reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Erneut prüfen' }));
    expect(screen.getByRole('dialog', { name: 'Frigate wird neu gestartet' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(180000); });
    fireEvent.click(screen.getByRole('button', { name: 'Seite neu laden' }));
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });
});
