import { h } from 'preact';
import AutoUpdatingCameraImage from '../AutoUpdatingCameraImage';
import { screen, render } from '@testing-library/preact';

let mockOnload;
vi.mock('../CameraImage', () => {
  function CameraImage({ onload, searchParams, matchContainer }) {
    mockOnload = () => {
      onload();
    };
    return <div data-testid="camera-image" data-match-container={String(matchContainer)}>{searchParams}</div>;
  }
  return {
    __esModule: true,
    default: CameraImage,
  };
});

describe('AutoUpdatingCameraImage', () => {
  let dateNowSpy;
  beforeEach(() => {
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  test('shows FPS by default', async () => {
    render(<AutoUpdatingCameraImage camera="tacos" />);
    expect(screen.queryByText('Displaying at 0fps')).toBeInTheDocument();
  });

  test('does not show FPS if turned off', async () => {
    render(<AutoUpdatingCameraImage camera="tacos" showFps={false} />);
    expect(screen.queryByText('Displaying at 0fps')).not.toBeInTheDocument();
  });

  test('reports the first successfully drawn image to the camera preview', () => {
    const onFirstFrame = vi.fn();
    render(<AutoUpdatingCameraImage camera="garage" showFps={false} onFirstFrame={onFirstFrame} />);
    expect(onFirstFrame).not.toHaveBeenCalled();
    mockOnload();
    expect(onFirstFrame).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Displaying at 0fps')).not.toBeInTheDocument();
  });

  test('enables exact-fit canvas only when explicitly requested by modern Debug preview', () => {
    const { rerender } = render(<AutoUpdatingCameraImage camera="garage" showFps={false} />);
    expect(screen.getByTestId('camera-image')).toHaveAttribute('data-match-container', 'false');
    rerender(<AutoUpdatingCameraImage camera="garage" showFps={false} matchContainer />);
    expect(screen.getByTestId('camera-image')).toHaveAttribute('data-match-container', 'true');
    expect(screen.queryByText('Displaying at 0fps')).not.toBeInTheDocument();
  });

  test('on load, sets a new cache key to search params', async () => {
    dateNowSpy.mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValueOnce(300);
    render(<AutoUpdatingCameraImage camera="front" searchParams="foo" />);
    mockOnload();
    await screen.findByText('cache=100&foo');
    expect(screen.getByText('cache=100&foo')).toBeInTheDocument();
  });
});
