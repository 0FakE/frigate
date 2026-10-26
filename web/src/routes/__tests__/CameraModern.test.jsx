import { h } from 'preact';
import { useState } from 'preact/hooks';
import { act, fireEvent, render, screen } from '@testing-library/preact';
import useSWR from 'swr';
import { usePersistence } from '../../context';
import Camera from '../Camera';

vi.mock('swr', () => ({ default: vi.fn() }));
vi.mock('../../api', () => ({ useApiHost: () => '/' }));
vi.mock('../../context', () => ({
  usePersistence: vi.fn((_key, initial) => [initial, vi.fn(), true]),
}));
vi.mock('../../components/AutoUpdatingCameraImage', () => ({
  default: ({ className, showFps, onFirstFrame }) => (
    <div className={className} data-show-fps={String(showFps)}>
      Debug Kamerabild
      <button type="button" onClick={onFirstFrame}>JPEG Bild empfangen</button>
    </div>
  ),
}));
vi.mock('../../components/JSMpegPlayer', () => ({
  default: ({ onFirstFrame }) => (
    <div>
      JSMpeg Livebild
      <button type="button" onClick={onFirstFrame}>JSMpeg Bild empfangen</button>
    </div>
  ),
}));
vi.mock('../../components/WebRtcPlayer', () => ({
  default: () => <div>WebRTC Livebild<video data-testid="mock-webrtc-video" /></div>,
}));
vi.mock('../../components/MsePlayer', () => ({}));
vi.mock('../../components/CameraControlPanel', () => ({
  default: () => <div>ONVIF Kamera-Steuerung</div>,
}));
vi.mock('../../components/LiveZoneEditor', () => ({
  default: ({ children, toolbar, optionsPanel, onDirtyChange }) => (
    <div data-testid="camera-editor">
      <div>{children}</div>
      {toolbar}
      {optionsPanel}
      <button type="button" onClick={() => onDirtyChange(true)}>Simulierte Änderung</button>
    </div>
  ),
}));

const cameraConfig = {
  cameras: {
    test_camera: {
      live: { height: 360, stream_name: 'test_camera' },
      detect: { width: 640, height: 360 },
      objects: { track: ['person'] },
      onvif: { host: '192.0.2.1' },
    },
  },
  go2rtc: { streams: {} },
  ui: { live_mode: 'jsmpeg' },
};

describe('modern camera page keeps its original actions', () => {
  beforeEach(() => {
    usePersistence.mockImplementation((_key, initial) => [initial, vi.fn(), true]);
    useSWR.mockImplementation((key) => {
      if (key === 'config') return { data: cameraConfig };
      return { data: ['person', 'car'] };
    });
  });

  afterEach(() => vi.restoreAllMocks());

  test('shows translated header, stream selector, tracked objects and ONVIF panel in Live', () => {
    render(<Camera camera="test_camera" />);
    expect(screen.getByTestId('modern-camera-header')).toHaveTextContent('test camera');
    expect(screen.getByText('Erkennung: 640 × 360')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Videoquelle' })).toHaveValue('jsmpeg');
    expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('JSMpeg Livebild')).toBeInTheDocument();
    const liveFrame = screen.getByTestId('modern-live-preview');
    expect(liveFrame).toHaveClass('camera-modern-video-frame', 'w-full', 'overflow-hidden');
    expect(liveFrame).not.toHaveClass('rounded-2xl', 'rounded-lg', 'rounded-xl');
    expect(liveFrame.style.width).toBe('640px');
    expect(liveFrame.style.aspectRatio).toBe('640 / 360');
    expect(screen.getByTestId('camera-preview-overlay')).toHaveTextContent('Kamera Vorschau wird geladen…');
    const trackedSection = screen.getByRole('region', { name: 'Erkannte Objekte' });
    expect(trackedSection).toHaveClass('border-t', 'pt-6');
    const thumbnails = trackedSection.querySelectorAll('img');
    expect(thumbnails).toHaveLength(2);
    thumbnails.forEach((img) => {
      expect(img).toHaveClass('h-[120px]', 'w-[120px]', 'object-cover');
      expect(img.parentElement).not.toHaveClass('w-[360px]', 'w-[400px]');
    });
    expect(screen.queryByText('Ereignisse anzeigen')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Erkannte Objekte' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Person/ })).toHaveAttribute('href', '/events?cameras=test_camera&labels=person');
    expect(screen.getByRole('link', { name: /Auto/ })).toHaveAttribute('href', '/events?cameras=test_camera&labels=car');
    expect(screen.getByText('ONVIF Kamera-Steuerung')).toBeInTheDocument();
  });

  test('retains Debug option toggles, editor entry and a toolbar under the stream', () => {
    render(<Camera camera="test_camera" />);
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    const preview = screen.getByTestId('modern-debug-preview');
    expect(preview).toHaveClass('camera-modern-debug-preview', 'camera-modern-video-frame', 'w-full', 'max-w-full');
    expect(preview).not.toHaveClass('rounded-2xl', 'rounded-lg', 'rounded-xl');
    expect(preview.querySelector('[data-show-fps]')).toHaveAttribute('data-show-fps', 'false');
    expect(screen.queryByRole('combobox', { name: 'Videoquelle' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('modern-live-preview')).not.toBeInTheDocument();
    expect(preview).not.toHaveClass('inline-block');
    expect(preview.style.width).toBe('640px');
    expect(preview.style.maxWidth).toBe('100%');
    expect(preview.querySelector('[data-show-fps]')).toHaveClass('w-full');
    expect(screen.getByText('Debug Kamerabild')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Options' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zonen & Masken Editor' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show Options' }));
    expect(screen.getByText('Anzeigeoptionen')).toBeInTheDocument();
    expect(screen.getByText('Objektrahmen')).toBeInTheDocument();
    expect(screen.getByText('Bewegungsmasken')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zonen & Masken Editor' }));
    const editor = screen.getByTestId('camera-editor');
    expect(editor).toHaveTextContent('JSMpeg Livebild');
    expect(editor).toHaveTextContent('Anzeigeoptionen');
    expect(editor).toHaveTextContent('Editor schließen');
    expect(screen.queryByRole('combobox', { name: 'Videoquelle' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    // The actual stream-source selector stays in Live, not the Debug toolbar.
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(screen.getByRole('combobox', { name: 'Videoquelle' })).toBeInTheDocument();
    expect(screen.getByTestId('modern-live-preview')).toBeInTheDocument();
  });

  test('Debug snapshot retains full camera resolution while remaining width-responsive', () => {
    const highResolution = {
      ...cameraConfig,
      cameras: {
        ...cameraConfig.cameras,
        test_camera: {
          ...cameraConfig.cameras.test_camera,
          detect: { width: 1280, height: 720 },
        },
      },
    };
    useSWR.mockImplementation((key) => (
      key === 'config' ? { data: highResolution } : { data: [] }
    ));
    render(<Camera camera="test_camera" />);
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));

    const frame = screen.getByTestId('modern-debug-preview');
    expect(frame).toHaveClass('w-full', 'max-w-full');
    expect(frame).not.toHaveClass('inline-block');
    expect(frame.style.width).toBe('1280px');
    expect(frame.style.maxWidth).toBe('100%');
    expect(frame.querySelector('[data-show-fps]')).toHaveClass('w-full');
    expect(screen.getByText('Erkennung: 1280 × 720')).toBeInTheDocument();

    // The ordinary Live tab still uses its unmodified stream player.
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(screen.getByText('JSMpeg Livebild')).toBeInTheDocument();
    expect(screen.queryByTestId('modern-debug-preview')).not.toBeInTheDocument();
  });

  test('source selector reappears on Live and the Debug source remains a separate preview', () => {
    render(<Camera camera="test_camera" />);
    expect(screen.getByRole('combobox', { name: 'Videoquelle' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    expect(screen.queryByRole('combobox', { name: 'Videoquelle' })).not.toBeInTheDocument();
    expect(screen.getByTestId('modern-debug-preview').querySelector('[data-show-fps]'))
      .toHaveAttribute('data-show-fps', 'false');
    expect(screen.queryByTestId('modern-live-preview')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(screen.getByRole('combobox', { name: 'Videoquelle' })).toHaveValue('jsmpeg');
    expect(screen.getByTestId('modern-live-preview')).toHaveClass('camera-modern-video-frame');
    expect(screen.queryByTestId('modern-debug-preview')).not.toBeInTheDocument();
  });

  test('JSMpeg Live keeps its size while loading and hides the overlay only after decoding', () => {
    render(<Camera camera="test_camera" />);
    const frame = screen.getByTestId('modern-live-preview');
    expect(frame.style.aspectRatio).toBe('640 / 360');
    expect(screen.getByRole('status')).toHaveTextContent('Kamera Vorschau wird geladen…');
    fireEvent.click(screen.getByRole('button', { name: 'JSMpeg Bild empfangen' }));
    expect(screen.queryByTestId('camera-preview-overlay')).not.toBeInTheDocument();
    expect(frame.style.aspectRatio).toBe('640 / 360');
    expect(frame.style.width).toBe('640px');
  });

  test('Debug JPEG view keeps its 16:9 footprint before the first drawn image', () => {
    render(<Camera camera="test_camera" />);
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    const frame = screen.getByTestId('modern-debug-preview');
    expect(frame.style.width).toBe('640px');
    expect(frame.style.aspectRatio).toBe('640 / 360');
    expect(screen.getByTestId('camera-preview-overlay')).toHaveTextContent('Kamera Vorschau wird geladen…');
    fireEvent.click(screen.getByRole('button', { name: 'JPEG Bild empfangen' }));
    expect(screen.queryByTestId('camera-preview-overlay')).not.toBeInTheDocument();
    expect(frame.style.aspectRatio).toBe('640 / 360');
  });

  test('MSE and WebRTC keep the same reserved size and wait for first real video frame', () => {
    const restreamConfig = {
      ...cameraConfig,
      go2rtc: { streams: { test_camera: {} } },
    };
    useSWR.mockImplementation((key) => (
      key === 'config' ? { data: restreamConfig } : { data: ['person'] }
    ));
    // Use real hook state so selecting another source really rerenders Camera.
    usePersistence.mockImplementation((_key, initial) => {
      const [value, setValue] = useState(initial);
      return [value, setValue, true];
    });
    const { rerender } = render(<Camera camera="test_camera" />);
    const frame = screen.getByTestId('modern-live-preview');
    fireEvent.change(screen.getByRole('combobox', { name: 'Videoquelle' }), { target: { value: 'webrtc' } });
    expect(screen.getByTestId('mock-webrtc-video')).toBeInTheDocument();
    expect(frame.style.width).toBe('640px');
    expect(frame.style.aspectRatio).toBe('640 / 360');
    expect(screen.getByTestId('camera-preview-overlay')).toBeInTheDocument();

    const rtcVideo = screen.getByTestId('mock-webrtc-video');
    Object.defineProperty(rtcVideo, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(rtcVideo, 'videoWidth', { configurable: true, value: 640 });
    fireEvent.loadedData(rtcVideo);
    expect(screen.queryByTestId('camera-preview-overlay')).not.toBeInTheDocument();

    // MSE is a custom element which attaches its native video after connecting.
    Object.defineProperty(window, 'MediaSource', { configurable: true, value: class MediaSource {} });
    fireEvent.change(screen.getByRole('combobox', { name: 'Videoquelle' }), { target: { value: 'mse' } });
    const mse = frame.querySelector('video-stream');
    expect(mse).not.toBeNull();
    expect(frame.style.width).toBe('640px');
    expect(frame.style.aspectRatio).toBe('640 / 360');
    expect(screen.getByTestId('camera-preview-overlay')).toBeInTheDocument();
    const mseVideo = document.createElement('video');
    Object.defineProperty(mseVideo, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(mseVideo, 'videoWidth', { configurable: true, value: 640 });
    mse.appendChild(mseVideo);
    fireEvent.loadedData(mseVideo);
    expect(screen.queryByTestId('camera-preview-overlay')).not.toBeInTheDocument();
    delete window.MediaSource;
    rerender(<Camera camera="test_camera" />);
  });

  test('a camera source that never provides a frame reports a translated error', () => {
    vi.useFakeTimers();
    try {
      render(<Camera camera="test_camera" />);
      expect(screen.getByTestId('camera-preview-overlay')).toHaveAttribute('role', 'status');
      act(() => vi.advanceTimersByTime(20000));
      expect(screen.getByTestId('camera-preview-overlay')).toHaveAttribute('role', 'alert');
      expect(screen.getByTestId('camera-preview-overlay')).toHaveTextContent(
        'Die Kameravorschau konnte nicht geladen werden.'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test('a rejected unsaved-change navigation keeps the selected Debug tab and editor', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Camera camera="test_camera" />);
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zonen & Masken Editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simulierte Änderung' }));
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(window.confirm).toHaveBeenCalledWith('Ungespeicherte Änderungen verwerfen?');
    expect(screen.getByRole('button', { name: 'Debug' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('camera-editor')).toBeInTheDocument();
  });
});
