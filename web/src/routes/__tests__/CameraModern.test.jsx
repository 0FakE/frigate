import { h } from 'preact';
import { useState } from 'preact/hooks';
import { set as setData, del as deleteData } from 'idb-keyval';
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
  default: ({ className, showFps, onFirstFrame, matchContainer }) => (
    <div className={className} data-show-fps={String(showFps)} data-match-container={String(matchContainer)}>
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
  default: ({ onFirstFrame }) => (
    <div>
      WebRTC Livebild
      <video data-testid="mock-webrtc-video" />
      <button type="button" onClick={onFirstFrame}>WebRTC Bild dargestellt</button>
    </div>
  ),
}));
vi.mock('../../components/MsePlayer', () => ({}));
vi.mock('../../components/CameraControlPanel', () => ({
  default: () => <div>ONVIF Kamera-Steuerung</div>,
}));
vi.mock('../../components/LiveZoneEditor', () => ({
  default: ({ camera, streamReady, streamError, streamDisabled, children, toolbar, optionsPanel, onDirtyChange }) => (
    <div data-testid="camera-editor" data-camera={camera} data-stream-ready={String(streamReady)}
      data-stream-error={String(streamError)} data-stream-disabled={String(streamDisabled)}>
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
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('uppercase');
    expect(screen.queryByText('Kameravorschau und Ereignisse')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Kameraübersicht' }).querySelector('path'))
      .toHaveAttribute('d', 'M19 12H5m7-7-7 7 7 7');
    expect(screen.getByText('Auflösung: 640 × 360')).toBeInTheDocument();
    const selector = screen.getByRole('combobox', { name: 'Videoquelle' });
    expect(selector).toHaveValue('jsmpeg');
    expect(selector).toBeEnabled();
    expect(selector).toHaveClass('h-9', 'sm:h-10', 'rounded-lg', 'border-0', 'w-[6.5rem]', 'pr-7', 'sm:pr-8');
    expect(selector).not.toHaveClass('border', 'border-slate-700', 'focus-visible:ring-2');
    expect(selector).not.toHaveClass('min-w-[8rem]', 'pr-10');
    expect(selector).toHaveClass('bg-none');
    expect(selector.parentElement.querySelector('svg')).toHaveClass('pointer-events-none', 'right-2', 'sm:right-3');
    expect(selector.closest('header').lastElementChild)
      .toHaveClass('ml-auto', 'w-full', 'flex-wrap', 'items-center', 'justify-end', 'gap-2', 'sm:w-auto', 'sm:gap-3');
    expect(selector.closest('label')).toHaveClass('p-1', 'pl-2', 'sm:pl-3', 'rounded-lg', 'border');
    expect(selector.closest('label')).not.toHaveClass('py-1.5');
    const tabs = screen.getByRole('navigation', { name: 'Kameraansicht' });
    expect(tabs.firstElementChild).toHaveClass('p-1', 'camera-modern-tab-group', 'max-w-full');
    expect(tabs.firstElementChild).toHaveAttribute('data-testid', 'camera-view-tabs');
    const liveTab = screen.getByRole('button', { name: 'Live' });
    expect(liveTab).toHaveAttribute('aria-pressed', 'true');
    expect(liveTab).not.toHaveClass('sm:ring-1', 'sm:ring-blue-400/60');
    expect(screen.getByRole('button', { name: 'Debug' })).not.toHaveClass('sm:ring-1');
    expect(screen.getByRole('navigation', { name: 'Kameraansicht' }).closest('header').lastElementChild)
      .toHaveClass('justify-end');
    expect(screen.getByText('JSMpeg Livebild')).toBeInTheDocument();
    const previewSection = screen.getByRole('region', { name: 'Kameravorschau' });
    expect(previewSection).toHaveClass('camera-modern-stage', 'mb-8');
    expect(previewSection).not.toHaveClass('mb-4');
    const liveFrame = screen.getByTestId('modern-live-preview');
    expect(liveFrame).toHaveClass('camera-modern-video-frame', 'w-full', 'overflow-hidden');
    expect(liveFrame).not.toHaveClass('rounded-2xl', 'rounded-lg', 'rounded-xl');
    expect(liveFrame.style.width).toBe('640px');
    expect(liveFrame.style.aspectRatio).toBe('640 / 360');
    expect(screen.getByTestId('camera-preview-overlay')).toHaveTextContent('Kamera Vorschau wird geladen...');
    const trackedSection = screen.getByRole('region', { name: 'Erkannte Objekte' });
    expect(trackedSection).toHaveClass('border-t', 'pt-6');
    const thumbnails = trackedSection.querySelectorAll('img');
    expect(thumbnails).toHaveLength(2);
    thumbnails.forEach((img) => {
      expect(img).toHaveClass('shrink-0', 'object-cover');
      expect(img).toHaveAttribute('width', '175');
      expect(img).toHaveAttribute('height', '175');
      const style = window.getComputedStyle(img);
      expect(style.width).toBe('175px');
      expect(style.height).toBe('175px');
      expect(style.minWidth).toBe('175px');
      expect(style.maxWidth).toBe('175px');
      expect(style.minHeight).toBe('175px');
      expect(style.maxHeight).toBe('175px');
      expect(img.parentElement).toHaveClass('flex-col');
      expect(img.parentElement).not.toHaveClass('w-[360px]', 'w-[400px]');
      expect(img.previousElementSibling).toHaveClass('text-sm', 'text-center', 'uppercase');
      expect(img.parentElement).toHaveClass('transition-colors', 'hover:border-blue-500/70', 'hover:bg-slate-100', 'dark:hover:bg-slate-800');
      expect(img.parentElement).not.toHaveClass('hover:-translate-y-0.5', 'transition-all');
      expect(img.previousElementSibling).toHaveTextContent(/Person|Auto/);
    });
    expect(screen.queryByText('Ereignisse anzeigen')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Erkannte Objekte' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Person/ })).toHaveAttribute('href', '/events?cameras=test_camera&labels=person');
    expect(screen.getByRole('link', { name: /Auto/ })).toHaveAttribute('href', '/events?cameras=test_camera&labels=car');
    expect(screen.getByText('ONVIF Kamera-Steuerung')).toBeInTheDocument();
  });

  test('shows a short no-objects message below detected objects', () => {
    useSWR.mockImplementation((key) => key === 'config'
      ? { data: cameraConfig } : { data: [] });
    render(<Camera camera="test_camera" />);
    const section = screen.getByRole('region', { name: 'Erkannte Objekte' });
    expect(section).toHaveTextContent('Noch keine Objekte erkannt');
    expect(section).not.toHaveTextContent('Für diese Kamera sind keine Objektklassen verfügbar.');
    expect(section.querySelectorAll('img')).toHaveLength(0);
  });

  test('object cards emphasize border and background without moving when hovered', () => {
    render(<Camera camera="test_camera" />);
    const card = screen.getByRole('link', { name: /Person/ });
    expect(card).toHaveClass('transition-colors', 'hover:border-blue-500/70', 'hover:bg-slate-100', 'dark:hover:bg-slate-800');
    expect(card).not.toHaveClass('hover:-translate-y-0.5', 'transition-all');
    const title = card.querySelector('span');
    expect(title).toHaveClass('text-center', 'uppercase');
    expect(title).toHaveTextContent('Person'); // CSS uppercase preserves locale data.
    expect(card.querySelector('img')).toHaveAttribute('width', '175');
    expect(card.querySelector('img')).toHaveAttribute('height', '175');
  });

  test('object thumbnails remain exactly 175 CSS pixels even with a 15px root font size', () => {
    const originalRootFontSize = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = '15px';
    try {
      render(<Camera camera="test_camera" />);
      const section = screen.getByRole('region', { name: 'Erkannte Objekte' });
      for (const img of section.querySelectorAll('img')) {
        expect(img).toHaveAttribute('width', '175');
        expect(img).toHaveAttribute('height', '175');
        expect(window.getComputedStyle(img).width).toBe('175px');
        expect(window.getComputedStyle(img).height).toBe('175px');
        expect(img).not.toHaveClass('w-40', 'h-40');
      }
    } finally {
      document.documentElement.style.fontSize = originalRootFontSize;
    }
  });

  test('retains Debug option toggles, editor entry and a toolbar under the stream', () => {
    render(<Camera camera="test_camera" />);
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    const preview = screen.getByTestId('modern-debug-preview');
    expect(preview).toHaveClass('camera-modern-debug-preview', 'camera-modern-video-frame', 'w-full', 'max-w-full');
    expect(preview).not.toHaveClass('rounded-2xl', 'rounded-lg', 'rounded-xl');
    expect(preview.querySelector('[data-show-fps]')).toHaveAttribute('data-show-fps', 'false');
    expect(preview.querySelector('[data-match-container]')).toHaveAttribute('data-match-container', 'true');
    expect(screen.queryByRole('combobox', { name: 'Videoquelle' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('modern-live-preview')).not.toBeInTheDocument();
    expect(preview).not.toHaveClass('inline-block');
    expect(preview.style.width).toBe('640px');
    expect(preview.style.maxWidth).toBe('100%');
    expect(preview.querySelector('[data-show-fps]')).toHaveClass('w-full');
    expect(screen.getByText('Debug Kamerabild')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Options' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Erkannte Objekte' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zonen & Masken Editor' })).toBeInTheDocument();
    expect(screen.getByTestId('camera-debug-controls')).toHaveClass('py-4');
    expect(screen.getByTestId('camera-debug-controls')).not.toHaveClass('pb-0');

    fireEvent.click(screen.getByRole('button', { name: 'Show Options' }));
    expect(screen.getByText('Anzeigeoptionen')).toBeInTheDocument();
    const optionsPanel = document.getElementById('camera-debug-options');
    expect(optionsPanel).toHaveClass('w-fit', 'max-w-full');
    expect(optionsPanel.querySelector('.flex-col')).toHaveClass('w-max', 'gap-3');
    expect(optionsPanel.querySelectorAll('input[type="checkbox"]')).toHaveLength(6);
    expect(screen.getByText('Objekte')).toBeInTheDocument();
    expect(screen.getByText('Zonen')).toBeInTheDocument();
    expect(screen.getByText('Masken')).toBeInTheDocument();
    expect(screen.getByText('Bewegungsbereiche')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zonen & Masken Editor' }));
    const editor = screen.getByTestId('camera-editor');
    expect(editor).toHaveTextContent('JSMpeg Livebild');
    expect(editor).not.toHaveTextContent('Anzeigeoptionen');
    expect(editor).toHaveTextContent('Editor schließen');
    const lockedOptions = screen.getByRole('button', { name: 'Show Options' });
    expect(lockedOptions).toBeDisabled();
    expect(lockedOptions).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('camera-debug-options')).toBeNull();
    fireEvent.click(lockedOptions);
    expect(document.getElementById('camera-debug-options')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editor schließen' }));
    expect(screen.getByRole('button', { name: 'Show Options' })).toBeEnabled();
    expect(screen.queryByText('Anzeigeoptionen')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show Options' }));
    expect(screen.getByText('Anzeigeoptionen')).toBeInTheDocument();
    expect(screen.getByTestId('camera-debug-controls')).toHaveClass('py-4');
    expect(screen.queryByRole('combobox', { name: 'Videoquelle' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    // The actual stream-source selector stays in Live, not the Debug toolbar.
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(screen.getByRole('combobox', { name: 'Videoquelle' })).toBeInTheDocument();
    expect(screen.getByTestId('modern-live-preview')).toBeInTheDocument();
  });


  test('switching cameras while editor stays open requires a fresh frame for the new camera', () => {
    const both = {
      ...cameraConfig,
      cameras: {
        ...cameraConfig.cameras,
        other_camera: {
          ...cameraConfig.cameras.test_camera,
          live: { height: 360, stream_name: 'other_camera' },
        },
      },
    };
    useSWR.mockImplementation((key) => key === 'config'
      ? { data: both } : { data: ['person'] });
    const { rerender } = render(<Camera camera="test_camera" />);
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zonen & Masken Editor' }));
    expect(screen.getByTestId('camera-editor')).toHaveAttribute('data-stream-ready', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'JSMpeg Bild empfangen' }));
    expect(screen.getByTestId('camera-editor')).toHaveAttribute('data-stream-ready', 'true');

    rerender(<Camera camera="other_camera" />);
    expect(screen.getByTestId('camera-editor')).toHaveAttribute('data-camera', 'other_camera');
    expect(screen.getByTestId('camera-editor')).toHaveAttribute('data-stream-ready', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'JSMpeg Bild empfangen' }));
    expect(screen.getByTestId('camera-editor')).toHaveAttribute('data-stream-ready', 'true');
  });

  test('an explicitly disabled camera never starts a stream in Live, Debug or editor', () => {
    const configDisabled = {
      ...cameraConfig,
      cameras: {
        ...cameraConfig.cameras,
        test_camera: { ...cameraConfig.cameras.test_camera, enabled: false },
      },
    };
    useSWR.mockImplementation((key) => key === 'config'
      ? { data: configDisabled } : { data: ['person'] });
    render(<Camera camera="test_camera" />);
    let warning = screen.getByTestId('camera-preview-overlay');
    expect(warning).toHaveAttribute('role', 'alert');
    expect(warning).toHaveTextContent('Kamera ist deaktiviert');
    expect(warning).toHaveClass('text-red-600', 'dark:text-red-400', 'font-bold');
    expect(screen.queryByText('Kamera Vorschau wird geladen...')).not.toBeInTheDocument();
    expect(screen.queryByText('JSMpeg Livebild')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Videoquelle' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    warning = screen.getByTestId('camera-preview-overlay');
    expect(warning).toHaveTextContent('Kamera ist deaktiviert');
    expect(screen.queryByText('Debug Kamerabild')).not.toBeInTheDocument();
    const optionsButton = screen.getByRole('button', { name: 'Show Options' });
    expect(optionsButton).toBeDisabled();
    fireEvent.click(optionsButton);
    expect(screen.queryByRole('region', { name: 'Anzeigeoptionen' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zonen & Masken Editor' }));
    const editor = screen.getByTestId('camera-editor');
    expect(editor).toHaveAttribute('data-stream-disabled', 'true');
    expect(editor).toHaveAttribute('data-stream-ready', 'false');
    expect(editor).toHaveAttribute('data-stream-error', 'false');
    expect(editor).not.toHaveTextContent('JSMpeg Livebild');
    expect(screen.getByRole('button', { name: 'Editor schließen' })).toBeEnabled();
  });

  test.each(['webrtc', 'mse'])(
    'disabled to enabled navigation waits for the saved %s source without starting JSMpeg',
    async (source) => {
      const { usePersistence: realPersistence } = await vi.importActual('../../context');
      // Use the real IndexedDB-backed hook so the test catches stale source
      // values during router reuse, not just an instantaneous mock.
      usePersistence.mockImplementation(realPersistence);
      await setData('active_camera-source', source);
      await setData('disabled_camera-source', 'jsmpeg');
      const originalMediaSource = window.MediaSource;
      Object.defineProperty(window, 'MediaSource', { configurable: true, value: class MediaSource {} });

      try {
        const configs = {
          ...cameraConfig,
          ui: { live_mode: 'webrtc' },
          cameras: {
            ...cameraConfig.cameras,
            disabled_camera: { ...cameraConfig.cameras.test_camera, enabled: false },
            active_camera: {
              ...cameraConfig.cameras.test_camera,
              enabled: true,
              live: { height: 360, stream_name: 'active_camera' },
            },
          },
          go2rtc: { streams: { active_camera: {} } },
        };
        useSWR.mockImplementation((key) => key === 'config' ? { data: configs } : { data: [] });

        const view = render(<Camera camera="disabled_camera" />);
        expect(await screen.findByText('Kamera ist deaktiviert')).toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: 'Videoquelle' })).not.toBeInTheDocument();

        view.rerender(<Camera camera="active_camera" />);
        // No provisional JSMpeg instance while IndexedDB loads the new source.
        expect(screen.queryByText('JSMpeg Livebild')).not.toBeInTheDocument();
        const selector = await screen.findByRole('combobox', { name: 'Videoquelle' });
        expect(selector).toHaveValue(source);
        const livePlayer = source === 'webrtc'
          ? screen.queryByText('WebRTC Livebild')
          : screen.getByTestId('modern-live-preview').querySelector('video-stream');
        expect(livePlayer).not.toBeNull();
        // WebRTC's mock reports its first frame directly. For MSE no decoded
        // frame has arrived yet, so its loading overlay must remain visible.
        if (source === 'webrtc') {
          fireEvent.click(screen.getByRole('button', { name: 'WebRTC Bild dargestellt' }));
        }
        expect(screen.queryByTestId('camera-preview-overlay') !== null).toBe(source === 'mse');

        view.rerender(<Camera camera="disabled_camera" />);
        expect(await screen.findByText('Kamera ist deaktiviert')).toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: 'Videoquelle' })).not.toBeInTheDocument();
        expect(screen.queryByText('JSMpeg Livebild')).not.toBeInTheDocument();
        expect(screen.queryByText('WebRTC Livebild')).not.toBeInTheDocument();
        expect(screen.getByTestId('modern-live-preview').querySelector('video-stream')).toBeNull();

        view.rerender(<Camera camera="active_camera" />);
        expect(screen.queryByText('JSMpeg Livebild')).not.toBeInTheDocument();
        expect(await screen.findByRole('combobox', { name: 'Videoquelle' })).toHaveValue(source);
        const restoredPlayer = source === 'webrtc'
          ? screen.queryByText('WebRTC Livebild')
          : screen.getByTestId('modern-live-preview').querySelector('video-stream');
        expect(restoredPlayer).not.toBeNull();
        view.unmount();
      } finally {
        await deleteData('active_camera-source');
        await deleteData('disabled_camera-source');
        if (originalMediaSource === undefined) delete window.MediaSource;
        else Object.defineProperty(window, 'MediaSource', { configurable: true, value: originalMediaSource });
      }
    }
  );

  test('camera without restream uses JSMpeg without changing persisted source during render', () => {
    const setSource = vi.fn();
    usePersistence.mockImplementation((_key, _initial) => ['webrtc', setSource, true]);
    render(<Camera camera="test_camera" />);
    expect(screen.getByRole('combobox', { name: 'Videoquelle' })).toHaveValue('jsmpeg');
    expect(screen.getByText('JSMpeg Livebild')).toBeInTheDocument();
    expect(setSource).not.toHaveBeenCalled();
  });

  test('switching from a live camera to a disabled camera clears readiness and does not mount a player', () => {
    const configs = {
      ...cameraConfig,
      cameras: {
        ...cameraConfig.cameras,
        disabled_camera: {
          ...cameraConfig.cameras.test_camera,
          enabled: false,
        },
      },
    };
    useSWR.mockImplementation((key) => key === 'config' ? { data: configs } : { data: [] });
    const { rerender } = render(<Camera camera="test_camera" />);
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zonen & Masken Editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'JSMpeg Bild empfangen' }));
    expect(screen.getByTestId('camera-editor')).toHaveAttribute('data-stream-ready', 'true');

    rerender(<Camera camera="disabled_camera" />);
    expect(screen.getByTestId('camera-editor')).toHaveAttribute('data-stream-disabled', 'true');
    expect(screen.getByTestId('camera-editor')).toHaveAttribute('data-stream-ready', 'false');
    expect(screen.queryByText('JSMpeg Livebild')).not.toBeInTheDocument();

    rerender(<Camera camera="test_camera" />);
    expect(screen.getByTestId('camera-editor')).toHaveAttribute('data-stream-ready', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'JSMpeg Bild empfangen' }));
    expect(screen.getByTestId('camera-editor')).toHaveAttribute('data-stream-ready', 'true');
  });


  test('camera switch closes existing options and keeps controls locked on a disabled camera', () => {
    const configs = {
      ...cameraConfig,
      cameras: {
        ...cameraConfig.cameras,
        disabled_camera: { ...cameraConfig.cameras.test_camera, enabled: false },
      },
    };
    useSWR.mockImplementation((key) => key === 'config' ? { data: configs } : { data: [] });
    const { rerender } = render(<Camera camera="test_camera" />);
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show Options' }));
    expect(screen.getByRole('button', { name: 'Hide Options' })).toHaveAttribute('aria-expanded', 'true');
    rerender(<Camera camera="disabled_camera" />);
    const button = screen.getByRole('button', { name: 'Show Options' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Anzeigeoptionen' })).not.toBeInTheDocument();
    rerender(<Camera camera="test_camera" />);
    expect(screen.getByRole('button', { name: 'Show Options' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Show Options' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('dirty editor blocks other camera links unless discard is confirmed', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { container } = render(
      <div>
        <Camera camera="test_camera" />
        <a href="/cameras/other_camera">Andere Kamera</a>
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zonen & Masken Editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simulierte Änderung' }));
    expect(screen.getByRole('button', { name: 'Editor schließen' })).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'Andere Kamera' });
    const accepted = fireEvent.click(link);
    expect(accepted).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Ungespeicherte Änderungen verwerfen?');
    expect(container.querySelector('[data-testid="camera-editor"]')).toBeInTheDocument();
    confirm.mockReturnValue(true);
    expect(fireEvent.click(link)).toBe(true);
  });

  test('camera controls and object cards have contrasting light and dark colors', () => {
    render(<Camera camera="test_camera" />);
    const cameraName = screen.getByRole('heading', { name: /test camera/i });
    expect(cameraName).toHaveClass('text-slate-900', 'dark:text-white');
    const back = screen.getByRole('link', { name: 'Zur Kameraübersicht' });
    expect(back).toHaveClass('bg-slate-100', 'dark:bg-slate-800/90');
    const source = screen.getByRole('combobox', { name: 'Videoquelle' });
    expect(source).toHaveClass('text-slate-900', 'dark:text-slate-100');
    const objectLink = screen.getByRole('link', { name: /Person/ });
    expect(objectLink).toHaveClass('bg-white', 'dark:bg-slate-900/90');
    expect(screen.getByRole('heading', { name: 'Erkannte Objekte' }))
      .toHaveClass('text-slate-600', 'dark:text-slate-300');
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show Options' }));
    expect(document.getElementById('camera-debug-options'))
      .toHaveClass('bg-white', 'dark:bg-slate-900/80');
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
    expect(frame.querySelector('[data-match-container]')).toHaveAttribute('data-match-container', 'true');
    expect(screen.getByText('Auflösung: 1280 × 720')).toBeInTheDocument();

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
    expect(frame).toHaveClass('camera-modern-live-preview');
    expect(screen.getByRole('status')).toHaveTextContent('Kamera Vorschau wird geladen...');
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
    expect(screen.getByTestId('camera-preview-overlay')).toHaveTextContent('Kamera Vorschau wird geladen...');
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
    // A real WebRTC video may render frames without bubbling loadeddata.
    // The player explicitly signals its first *presented* frame via callback.
    fireEvent.change(screen.getByRole('combobox', { name: 'Videoquelle' }), { target: { value: 'jsmpeg' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Videoquelle' }), { target: { value: 'webrtc' } });
    expect(screen.getByTestId('camera-preview-overlay')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'WebRTC Bild dargestellt' }));
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

  test('a directly reported WebRTC first frame cancels the spurious 20-second error', () => {
    vi.useFakeTimers();
    try {
      const restreamConfig = {
        ...cameraConfig,
        ui: { live_mode: 'webrtc' },
        go2rtc: { streams: { test_camera: {} } },
      };
      useSWR.mockImplementation((key) =>
        key === 'config' ? { data: restreamConfig } : { data: ['person'] }
      );
      render(<Camera camera="test_camera" />);
      expect(screen.getByTestId('camera-preview-overlay')).toHaveAttribute('role', 'status');
      fireEvent.click(screen.getByRole('button', { name: 'WebRTC Bild dargestellt' }));
      expect(screen.queryByTestId('camera-preview-overlay')).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(20000));
      expect(screen.queryByTestId('camera-preview-overlay')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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
