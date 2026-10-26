import { h } from 'preact';
import * as Hooks from '../../hooks';
import CameraImage from '../CameraImage';
import { render, screen } from '@testing-library/preact';

vi.mock('swr', () => ({
  default: () => ({
    data: {
      cameras: {
        front: { name: 'front', enabled: true, detect: { width: 640, height: 360 } },
      },
    },
  }),
}));
vi.mock('../../api', () => ({ useApiHost: () => '/' }));

describe('CameraImage', () => {
  beforeEach(() => {
    vi.spyOn(Hooks, 'useResizeObserver').mockImplementation(() => [{ width: 0 }]);
  });

  test('uses the entire Debug preview width without subtracting the global scrollbar twice', () => {
    vi.spyOn(Hooks, 'useResizeObserver').mockImplementation(() => [{ width: 640 }]);
    const originalWidth = Object.getOwnPropertyDescriptor(document.body, 'offsetWidth');
    const scrollbarWidth = 20;
    Object.defineProperty(document.body, 'offsetWidth', {
      configurable: true, value: window.innerWidth - scrollbarWidth,
    });
    try {
      const { rerender } = render(<CameraImage camera="front" matchContainer />);
      const canvas = screen.getByTestId('cameraimage-canvas');
      expect(canvas).toHaveAttribute('width', '640');
      expect(canvas).toHaveAttribute('height', '360');
      expect(canvas.style.width).toBe('100%');
      expect(canvas.style.height).toBe('100%');

      rerender(<CameraImage camera="front" />);
      expect(canvas).toHaveAttribute('width', '620');
      expect(canvas.style.width).toBe('');
    } finally {
      if (originalWidth) Object.defineProperty(document.body, 'offsetWidth', originalWidth);
      else delete document.body.offsetWidth;
    }
  });

  test('renders an activity indicator while loading', async () => {
    render(<CameraImage camera="front" />);
    expect(screen.queryByLabelText('Loading…')).toBeInTheDocument();
  });
});
