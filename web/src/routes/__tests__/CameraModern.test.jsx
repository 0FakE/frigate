import { h } from 'preact';
import { fireEvent, render, screen } from '@testing-library/preact';
import useSWR from 'swr';
import Camera from '../Camera';

vi.mock('swr', () => ({ default: vi.fn() }));
vi.mock('../../api', () => ({ useApiHost: () => '/' }));
vi.mock('../../context', () => ({
  usePersistence: (_key, initial) => [initial, vi.fn(), true],
}));
vi.mock('../../components/AutoUpdatingCameraImage', () => ({
  default: ({ className }) => <div className={className}>Debug Kamerabild</div>,
}));
vi.mock('../../components/JSMpegPlayer', () => ({
  default: ({ fillContainer }) => <div>{fillContainer ? 'JSMpeg Editorbild' : 'JSMpeg Livebild'}</div>,
}));
vi.mock('../../components/WebRtcPlayer', () => ({
  default: () => <div>WebRTC Livebild</div>,
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
    expect(screen.getByRole('heading', { name: 'Erkannte Objekte' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Person/ })).toHaveAttribute('href', '/events?cameras=test_camera&labels=person');
    expect(screen.getByRole('link', { name: /Auto/ })).toHaveAttribute('href', '/events?cameras=test_camera&labels=car');
    expect(screen.getByText('ONVIF Kamera-Steuerung')).toBeInTheDocument();
  });

  test('retains Debug option toggles, editor entry and a toolbar under the stream', () => {
    render(<Camera camera="test_camera" />);
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    const preview = screen.getByTestId('modern-debug-preview');
    expect(preview).toHaveClass('camera-modern-debug-preview', 'w-full', 'max-w-full');
    expect(preview).not.toHaveClass('inline-block');
    expect(preview.style.width).toBe('640px');
    expect(preview.style.maxWidth).toBe('100%');
    expect(preview.firstElementChild).toHaveClass('w-full');
    expect(screen.getByText('Debug Kamerabild')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Options' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zonen & Masken Editor' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show Options' }));
    expect(screen.getByText('Anzeigeoptionen')).toBeInTheDocument();
    expect(screen.getByText('Objektrahmen')).toBeInTheDocument();
    expect(screen.getByText('Bewegungsmasken')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zonen & Masken Editor' }));
    const editor = screen.getByTestId('camera-editor');
    expect(editor).toHaveTextContent('JSMpeg Editorbild');
    expect(editor).toHaveTextContent('Anzeigeoptionen');
    expect(editor).toHaveTextContent('Editor schließen');
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
    expect(frame.firstElementChild).toHaveClass('w-full');
    expect(screen.getByText('Erkennung: 1280 × 720')).toBeInTheDocument();

    // The ordinary Live tab still uses its unmodified stream player.
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(screen.getByText('JSMpeg Livebild')).toBeInTheDocument();
    expect(screen.queryByTestId('modern-debug-preview')).not.toBeInTheDocument();
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
