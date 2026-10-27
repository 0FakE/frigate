import { h } from 'preact';
import Dialog from '../Dialog';
import { render, screen } from '@testing-library/preact';

describe('Dialog', () => {
  let portal;

  beforeAll(() => {
    portal = document.createElement('div');
    portal.id = 'dialogs';
    document.body.appendChild(portal);
  });

  afterAll(() => {
    document.body.removeChild(portal);
  });

  test('renders to a portal', async () => {
    render(<Dialog>Sample</Dialog>);
    expect(screen.getByText('Sample')).toBeInTheDocument();
    expect(screen.getByRole('dialog').closest('#dialogs')).not.toBeNull();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('dialog')).toHaveClass('w-full', 'max-h-[calc(100vh-2rem)]', 'max-w-[460px]');
    expect(screen.getByTestId('scrim')).toHaveClass('px-4', 'sm:px-6');
    expect(screen.queryByRole('button', { name: /schließen/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('scrim')).toHaveClass('z-50');
  });
});
