import { h } from 'preact';
import * as Context from '../context';
import AppBar from '../AppBar';
import { fireEvent, render, screen } from '@testing-library/preact';
import { setLocaleMessages } from '../locales';

describe('AppBar', () => {
  let setDarkModeSpy;

  beforeEach(() => {
    setLocaleMessages(null);
    setDarkModeSpy = vi.fn();
    vi.spyOn(Context, 'useDarkMode').mockImplementation(() => ({
      persistedMode: 'dark',
      currentMode: 'dark',
      setDarkMode: setDarkModeSpy,
    }));
    vi.spyOn(Context, 'DarkModeProvider').mockImplementation(({ children }) => (
      <div>{children}</div>
    ));
  });

  afterEach(() => {
    setLocaleMessages(null);
    vi.restoreAllMocks();
  });

  function mount() {
    render(
      <Context.DarkModeProvider>
        <Context.DrawerProvider>
          <AppBar />
        </Context.DrawerProvider>
      </Context.DarkModeProvider>
    );
  }

  function openSettings() {
    fireEvent.click(screen.getByRole('button', { name: 'Weitere Optionen' }));
    return screen.getByRole('menu', { name: 'Darstellung und System' });
  }

  test('compact localized settings menu has only two theme modes and restart', () => {
    mount();
    const menu = openSettings();
    expect(menu).toHaveClass('frigate-settings-menu');
    expect(menu.querySelector('.frigate-settings-content')).not.toBeNull();
    expect(menu.querySelectorAll('.frigate-settings-heading')).toHaveLength(2);
    expect(menu.querySelectorAll('.frigate-settings-divider')).toHaveLength(1);
    expect(menu).toHaveTextContent('Design');
    expect(menu).toHaveTextContent('System');
    expect(menu).not.toHaveTextContent('Automatisch');
    expect(menu.querySelectorAll('[role="menuitemradio"]')).toHaveLength(2);
    const dark = screen.getByRole('menuitemradio', { name: 'Dunkel' });
    expect(dark).toHaveAttribute('aria-checked', 'true');
    expect(dark).toHaveClass('frigate-settings-action--selected');
    expect(dark.querySelector('.frigate-settings-radio--selected')).not.toBeNull();
    expect(screen.getByRole('menuitemradio', { name: 'Hell' })).toHaveAttribute('aria-checked', 'false');
    const restartItem = screen.getByRole('menuitem', { name: 'Frigate neu starten' });
    expect(restartItem).toBeInTheDocument();
    expect(restartItem.querySelector('.frigate-settings-chevron')).not.toBeNull();
    expect(menu).not.toHaveTextContent('Dunkles Design verwenden');
  });

  test('theme selection persists and closes the menu', () => {
    mount();
    openSettings();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Hell' }));
    expect(setDarkModeSpy).toHaveBeenCalledWith('light');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('light mode highlights light and allows switching back to dark', () => {
    vi.spyOn(Context, 'useDarkMode').mockImplementation(() => ({
      persistedMode: 'light', currentMode: 'light', setDarkMode: setDarkModeSpy,
    }));
    mount();
    openSettings();
    expect(screen.getByRole('menuitemradio', { name: 'Hell' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Dunkel' })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dunkel' }));
    expect(setDarkModeSpy).toHaveBeenCalledWith('dark');
  });

  test('restart uses localized responsive confirmation, with no close icon', () => {
    mount();
    openSettings();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Frigate neu starten' }));
    const dialog = screen.getByRole('dialog', { name: 'Frigate neu starten' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('Alle laufenden Prozesse');
    expect(dialog).toHaveClass('w-full', 'max-w-[460px]');
    expect(screen.queryByRole('button', { name: /schließen/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('new menu and restart use external locale overrides', () => {
    setLocaleMessages({
      app: {
        menu: {
          more_options: 'More custom', settings_label: 'Settings custom',
          design: 'Theme custom', light: 'Light custom', dark: 'Dark custom',
          system: 'System custom', restart: 'Restart custom',
        },
        modal: { restart: {
          title: 'Restart title custom', confirm: 'Restart confirmation custom',
          restart: 'Restart action custom', cancel: 'Cancel custom',
        } },
      },
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'More custom' }));
    expect(screen.getByRole('menu', { name: 'Settings custom' })).toHaveTextContent('Theme custom');
    expect(screen.getByRole('menuitemradio', { name: 'Dark custom' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restart custom' }));
    expect(screen.getByRole('dialog', { name: 'Restart title custom' })).toHaveTextContent('Restart confirmation custom');
    expect(screen.getByRole('button', { name: 'Restart action custom' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel custom' })).toBeInTheDocument();
  });
});
