import { h } from 'preact';
import * as Context from '../context';
import AppBar from '../AppBar';
import { fireEvent, render, screen } from '@testing-library/preact';

describe('AppBar', () => {
  beforeEach(() => {
    vi.spyOn(Context, 'useDarkMode').mockImplementation(() => ({
      setDarkMode: vi.fn(),
    }));
    vi.spyOn(Context, 'DarkModeProvider').mockImplementation(({ children }) => {
      return <div>{children}</div>;
    });
  });

  test('shows a menu on overflow click', async () => {
    render(
      <Context.DarkModeProvider>
        <Context.DrawerProvider>
          <AppBar />
        </Context.DrawerProvider>
      </Context.DarkModeProvider>
    );

    const overflowButton = await screen.findByLabelText('More options');
    fireEvent.click(overflowButton);

    const menu = await screen.findByRole('listbox');
    expect(menu).toBeInTheDocument();
  });

  test('opens responsive restart confirmation with explicit buttons and no close icon', async () => {
    render(
      <Context.DarkModeProvider>
        <Context.DrawerProvider>
          <AppBar />
        </Context.DrawerProvider>
      </Context.DarkModeProvider>
    );
    fireEvent.click(await screen.findByLabelText('More options'));
    fireEvent.click(screen.getByText('Restart Frigate'));
    const dialog = screen.getByRole('dialog', { name: 'Frigate neu starten' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('Alle laufenden Prozesse');
    expect(dialog).toHaveClass('w-full', 'max-w-[460px]');
    expect(screen.queryByRole('button', { name: /schließen/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neu starten' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('sets dark mode on MenuItem select', async () => {
    const setDarkModeSpy = vi.fn();
    vi.spyOn(Context, 'useDarkMode').mockImplementation(() => ({
      setDarkMode: setDarkModeSpy,
    }));
    render(
      <Context.DarkModeProvider>
        <Context.DrawerProvider>
          <AppBar />
        </Context.DrawerProvider>
      </Context.DarkModeProvider>
    );

    const overflowButton = await screen.findByLabelText('More options');
    fireEvent.click(overflowButton);

    await screen.findByRole('listbox');

    fireEvent.click(screen.getByText('Light'));
    expect(setDarkModeSpy).toHaveBeenCalledWith('light');
  });
});
