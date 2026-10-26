import { h } from 'preact';
import { fireEvent, render, screen } from '@testing-library/preact';
import ButtonsTabbed from '../ButtonsTabbed';

describe('ButtonsTabbed controlled navigation', () => {
  test('camera pill tabs stay right-aligned, use icons, and keep the controlled selection', () => {
    const requestChange = vi.fn();
    const { rerender, container } = render(
      <ButtonsTabbed
        viewModes={['live', 'debug']}
        currentViewMode="debug"
        setViewMode={requestChange}
        variant="camera"
      />
    );

    const nav = screen.getByRole('navigation', { name: 'Kameraansicht' });
    const live = screen.getByRole('button', { name: 'Live' });
    const debug = screen.getByRole('button', { name: 'Debug' });
    expect(nav).toHaveClass('justify-end');
    expect(container.querySelectorAll('button svg[aria-hidden="true"]')).toHaveLength(2);
    expect(debug).toHaveAttribute('aria-pressed', 'true');
    expect(debug).toHaveClass('bg-blue-600', 'h-9', 'sm:h-10', 'px-2', 'sm:px-5');
    expect(live).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(live);
    expect(requestChange).toHaveBeenCalledWith('live');
    // A rejected navigation request does not change the active tab.
    expect(debug).toHaveAttribute('aria-pressed', 'true');
    expect(live).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <ButtonsTabbed
        viewModes={['live', 'debug']}
        currentViewMode="live"
        setViewMode={requestChange}
        variant="camera"
      />
    );
    expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Debug' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('a rejected view change keeps the current tab visibly selected', () => {
    const requestChange = vi.fn();
    const { rerender } = render(
      <ButtonsTabbed
        viewModes={['live', 'debug']}
        currentViewMode="debug"
        setViewMode={requestChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(requestChange).toHaveBeenCalledWith('live');
    expect(screen.getByRole('button', { name: 'Debug' })).toHaveClass('border-b-2');
    expect(screen.getByRole('button', { name: 'Live' })).not.toHaveClass('border-b-2');

    rerender(
      <ButtonsTabbed
        viewModes={['live', 'debug']}
        currentViewMode="live"
        setViewMode={requestChange}
      />
    );
    expect(screen.getByRole('button', { name: 'Live' })).toHaveClass('border-b-2');
  });
});
