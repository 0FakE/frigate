import { h } from 'preact';
import { fireEvent, render, screen } from '@testing-library/preact';
import ButtonsTabbed from '../ButtonsTabbed';

describe('ButtonsTabbed controlled navigation', () => {
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
