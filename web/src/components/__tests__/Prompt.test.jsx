import { h } from 'preact';
import { fireEvent, render, screen } from '@testing-library/preact';
import Prompt from '../Prompt';
import { setLocaleMessages } from '../../locales';

describe('reusable responsive confirmation prompt', () => {
  afterEach(() => setLocaleMessages(null));

  test('loading status uses the host locale and falls back to bundled German', () => {
    setLocaleMessages({ app: { modal: { please_wait: 'Loading custom' } } });
    const { rerender } = render(<Prompt title="Hinweis" variant="info" />);
    expect(screen.getByRole('status', { name: 'Loading custom' })).toBeInTheDocument();
    setLocaleMessages(null);
    rerender(<Prompt title="Hinweis" variant="info" />);
    expect(screen.getByRole('status', { name: 'Bitte warten' })).toBeInTheDocument();
  });

  test('shows explicit primary and cancel actions without close controls', () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    render(<Prompt title="Aktion bestätigen" text="Möchtest du fortfahren?" variant="confirmation"
      actions={[{ text: 'Bestätigen', onClick: confirm }, { text: 'Abbrechen', onClick: cancel }]} />);
    const dialog = screen.getByRole('dialog', { name: 'Aktion bestätigen' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveClass('w-full', 'max-w-[460px]', 'max-h-[calc(100vh-2rem)]');
    expect(dialog).toHaveTextContent('Möchtest du fortfahren?');
    expect(screen.queryByRole('button', { name: /schließen/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toHaveClass('bg-blue-600');
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toHaveClass('bg-white');
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  test('supports information without actions and content after the description', () => {
    render(<Prompt title="Hinweis" text="Bitte warten." variant="info">
      <p>Zusätzliche Informationen</p>
    </Prompt>);
    expect(screen.getByRole('dialog', { name: 'Hinweis' })).toHaveTextContent('Zusätzliche Informationen');
    expect(screen.getByRole('status', { name: 'Bitte warten' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('supports error and warning variants without requiring new action props', () => {
    const { rerender } = render(<Prompt title="Fehler" text="Fehlgeschlagen" variant="error"
      actions={[{ text: 'OK', onClick: vi.fn() }]} />);
    expect(screen.getByRole('dialog', { name: 'Fehler' })).toHaveTextContent('Fehlgeschlagen');
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
    rerender(<Prompt title="Warnung" variant="warning"
      actions={[{ text: 'Weiter', color: 'red', onClick: vi.fn() }]} />);
    expect(screen.getByRole('button', { name: 'Weiter' })).toHaveClass('bg-red-600');
  });
});
