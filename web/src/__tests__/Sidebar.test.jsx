import { h } from 'preact';
import { DrawerProvider }  from '../context';
import Sidebar from '../Sidebar';
import { render, screen } from '@testing-library/preact';
import useSWR from 'swr';

vi.mock('swr', async () => {
  const actual = await vi.importActual('swr');
  return { ...actual, default: vi.fn() };
});

describe('Sidebar', () => {
  test('keeps GitHub navigation without the Documentation item', () => {
    useSWR.mockReturnValue({ data: { cameras: {}, birdseye: { enabled: false } } });
    render(<DrawerProvider><Sidebar /></DrawerProvider>);
    expect(screen.queryByRole('link', { name: 'Documentation' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cameras' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Storage' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ereignisse' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/blakeblackshear/frigate');
  });

  test('navigation links have no focus ring or clipped outline', () => {
    useSWR.mockReturnValue({ data: { cameras: {}, birdseye: { enabled: false } } });
    render(<DrawerProvider><Sidebar /></DrawerProvider>);
    const link = screen.getByRole('link', { name: 'Cameras' });
    expect(link).not.toHaveClass('ring-opacity-50', 'focus:ring-2', 'ring-blue-300');
    expect(link).toHaveClass('focus:outline-none', 'focus-visible:bg-blue-500', 'focus-visible:underline');
  });

  // eslint-disable-next-line jest/no-disabled-tests
  test.skip('does not render cameras by default', async () => {
    const { findByText } = render(<DrawerProvider><Sidebar /></DrawerProvider>);
    await findByText('Cameras');
    expect(screen.queryByRole('link', { name: 'front' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'side' })).not.toBeInTheDocument();
  });
});
