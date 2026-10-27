import { h } from 'preact';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { get, set } from 'idb-keyval';
import { DarkModeProvider, useDarkMode } from '../index';

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn() }));

function Probe() {
  const { currentMode, persistedMode, setDarkMode } = useDarkMode();
  return <div>
    <span data-testid="mode">{currentMode}/{persistedMode}</span>
    <button type="button" onClick={() => setDarkMode('light')}>Light</button>
    <button type="button" onClick={() => setDarkMode('dark')}>Dark</button>
  </div>;
}

describe('dark is the default theme when automatic theme is removed', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue(undefined);
    set.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.classList.remove('dark');
    vi.restoreAllMocks();
  });

  test.each([
    [undefined, 'dark'],
    ['media', 'dark'],
    ['light', 'light'],
    ['dark', 'dark'],
  ])('previous stored setting %s resolves to %s', async (stored, expected) => {
    get.mockResolvedValue(stored);
    render(<DarkModeProvider><Probe /></DarkModeProvider>);
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent(expected + '/' + expected));
    expect(document.body.classList.contains('dark')).toBe(expected === 'dark');
    expect(set).toHaveBeenCalledWith('darkmode', expected);
  });

  test('user can still change to light and back to dark', async () => {
    render(<DarkModeProvider><Probe /></DarkModeProvider>);
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('dark/dark'));
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(screen.getByTestId('mode')).toHaveTextContent('light/light');
    expect(document.body).not.toHaveClass('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(document.body).toHaveClass('dark');
  });
});
