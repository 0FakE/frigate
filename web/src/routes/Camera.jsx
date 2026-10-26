import { h, Fragment } from 'preact';
import AutoUpdatingCameraImage from '../components/AutoUpdatingCameraImage';
import ActivityIndicator from '../components/ActivityIndicator';
import JSMpegPlayer from '../components/JSMpegPlayer';
import Switch from '../components/Switch';
import ButtonsTabbed from '../components/ButtonsTabbed';
import { usePersistence } from '../context';
import { useCallback, useMemo, useState } from 'preact/hooks';
import { useApiHost } from '../api';
import useSWR from 'swr';
import WebRtcPlayer from '../components/WebRtcPlayer';
import '../components/MsePlayer';
import CameraControlPanel from '../components/CameraControlPanel';
import LiveZoneEditor from '../components/LiveZoneEditor';
import { baseUrl } from '../api/baseUrl';
import { t } from '../locales';

const emptyObject = Object.freeze({});

export default function Camera({ camera }) {
  const { data: config } = useSWR('config');
  const { data: trackedLabels } = useSWR(['labels', { camera }]);
  const apiHost = useApiHost();
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState('live');
  const [editLivePolygons, setEditLivePolygons] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorStreamReady, setEditorStreamReady] = useState(false);
  const handleFirstEditorFrame = useCallback(() => setEditorStreamReady(true), []);

  const cameraConfig = config?.cameras[camera];
  const restreamEnabled =
    cameraConfig && Object.keys(config.go2rtc.streams || {}).includes(cameraConfig.live.stream_name);
  const jsmpegWidth = cameraConfig
    ? Math.round(cameraConfig.live.height * (cameraConfig.detect.width / cameraConfig.detect.height))
    : 0;
  const [viewSource, setViewSource, sourceIsLoaded] = usePersistence(
    `${camera}-source`,
    getDefaultLiveMode(config, cameraConfig, restreamEnabled)
  );
  const sourceValues = restreamEnabled ? ['mse', 'webrtc', 'jsmpeg'] : ['jsmpeg'];
  const [options, setOptions] = usePersistence(`${camera}-feed`, emptyObject);

  const handleSetOption = useCallback(
    (id, value) => {
      const newOptions = { ...options, [id]: value };
      setOptions(newOptions);
    },
    [options, setOptions]
  );

  const searchParams = useMemo(
    () =>
      new URLSearchParams(
        Object.keys(options).reduce((memo, key) => {
          memo.push([key, options[key] === true ? '1' : '0']);
          return memo;
        }, [])
      ),
    [options]
  );

  const handleToggleSettings = useCallback(() => {
    setShowSettings(!showSettings);
  }, [showSettings, setShowSettings]);

  const handleChangeViewMode = useCallback(
    (nextMode) => {
      if (nextMode === viewMode) return;
      if (editLivePolygons && editorDirty && !window.confirm(t('cameras.debug.editor.prompt.discard_unsaved'))) return;
      setEditLivePolygons(false);
      setEditorDirty(false);
      setEditorStreamReady(false);
      setViewMode(nextMode);
    },
    [viewMode, editLivePolygons, editorDirty]
  );

  const handleToggleEditor = useCallback(() => {
    if (editLivePolygons && editorDirty && !window.confirm(t('cameras.debug.editor.prompt.discard_unsaved'))) return;
    setEditLivePolygons((current) => !current);
    setEditorDirty(false);
    setEditorStreamReady(false);
  }, [editLivePolygons, editorDirty]);

  if (!cameraConfig || !sourceIsLoaded) {
    return <ActivityIndicator />;
  }

  if (!restreamEnabled) {
    setViewSource('jsmpeg');
  }

  const optionContent = showSettings ? (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      <Switch
        checked={options['bbox']}
        id="bbox"
        onChange={handleSetOption}
        label={t('cameras.debug.controls.bounding_box')}
        labelPosition="after"
      />
      <Switch
        checked={options['timestamp']}
        id="timestamp"
        onChange={handleSetOption}
        label={t('cameras.debug.controls.timestamp')}
        labelPosition="after"
      />
      <Switch checked={options['zones']} id="zones" onChange={handleSetOption} label={t('cameras.debug.controls.zones')} labelPosition="after" />
      <Switch
        checked={options['mask']}
        id="mask"
        onChange={handleSetOption}
        label={t('cameras.debug.controls.motion_masks')}
        labelPosition="after"
      />
      <Switch
        checked={options['motion']}
        id="motion"
        onChange={handleSetOption}
        label={t('cameras.debug.controls.motion_boxes')}
        labelPosition="after"
      />
      <Switch
        checked={options['regions']}
        id="regions"
        onChange={handleSetOption}
        label={t('cameras.debug.controls.regions')}
        labelPosition="after"
      />
    </div>
  ) : null;

  // The same debug controls are rendered beside the video in both editor
  // and ordinary Debug modes; they remain connected to the existing handlers.
  const debugControls = (
    <div className="flex flex-wrap items-center gap-3 py-4" data-testid="camera-debug-controls">
      <button type="button" onClick={handleToggleSettings}
        aria-expanded={showSettings} aria-controls="camera-debug-options"
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/90 px-4 text-sm font-semibold text-slate-100 shadow-sm transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
        <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.7 5.7l2.1 2.1m8.4 8.4 2.1 2.1m0-12.6-2.1 2.1M7.8 16.2l-2.1 2.1" />
          <circle cx="12" cy="12" r="4" />
        </svg>
        {t(showSettings ? 'cameras.debug.controls.options_hide' : 'cameras.debug.controls.options_show')}
        <svg aria-hidden="true" className={'h-3.5 w-3.5 transition-transform ' + (showSettings ? 'rotate-180' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <button type="button" onClick={handleToggleEditor}
        aria-pressed={editLivePolygons}
        className={'inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ' +
          (editLivePolygons
            ? 'border-blue-500/80 bg-blue-600 text-white shadow-blue-900/30 hover:bg-blue-500'
            : 'border-blue-500/70 bg-blue-600 text-white shadow-blue-900/30 hover:bg-blue-500')}>
        <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 3 9 6-3.5 12h-11L3 9Z" /><path d="M3 9l9 5 9-5M12 14v7" />
        </svg>
        {t(editLivePolygons ? 'cameras.debug.editor.button.close' : 'cameras.debug.editor.button.open')}
      </button>
    </div>
  );
  const debugOptions = showSettings ? (
    <section id="camera-debug-options" aria-label={t('cameras.debug.controls.options_aria')}
      className="rounded-2xl border border-slate-700/80 bg-slate-900/80 p-4 shadow-lg shadow-black/10">
      <h3 className="mb-4 text-sm font-bold text-white">{t('cameras.debug.controls.options_title')}</h3>
      {optionContent}
    </section>
  ) : null;

  let player;
  if (viewMode === 'live') {
    if (viewSource == 'mse' && restreamEnabled) {
      if ('MediaSource' in window || 'ManagedMediaSource' in window) {
        player = (
          <Fragment>
            <div className="max-w-5xl">
              <video-stream
                mode="mse"
                src={
                  new URL(`${baseUrl.replace(/^http/, 'ws')}live/webrtc/api/ws?src=${cameraConfig.live.stream_name}`)
                }
              />
            </div>
          </Fragment>
        );
      } else {
        player = (
          <Fragment>
            <div className="w-5xl text-center text-sm">
              {t('cameras.page.mse_unsupported')}
            </div>
          </Fragment>
        );
      }
    } else if (viewSource == 'webrtc' && restreamEnabled) {
      player = (
        <Fragment>
          <div className="max-w-5xl">
            <WebRtcPlayer camera={cameraConfig.live.stream_name} />
          </div>
        </Fragment>
      );
    } else {
      player = (
        <Fragment>
          <div>
            <JSMpegPlayer camera={camera} width={jsmpegWidth} height={cameraConfig.live.height} />
          </div>
        </Fragment>
      );
    }
  } else if (viewMode === 'debug') {
    player = (
      <Fragment>
        {editLivePolygons ? (
          <LiveZoneEditor
            toolbar={debugControls}
            optionsPanel={debugOptions}
            camera={camera}
            width={cameraConfig.detect.width}
            height={cameraConfig.detect.height}
            displayWidth={jsmpegWidth}
            trackedObjects={cameraConfig.objects?.track || []}
            onClose={() => {
              setEditLivePolygons(false);
              setEditorDirty(false);
              setEditorStreamReady(false);
            }}
            onDirtyChange={setEditorDirty}
            streamReady={editorStreamReady}
          >
            <JSMpegPlayer camera={camera} width={jsmpegWidth} height={cameraConfig.live.height}
              fillContainer onFirstFrame={handleFirstEditorFrame} />
          </LiveZoneEditor>
        ) : (
          <div className="w-full min-w-0">
            {/* CameraImage measures its parent with ResizeObserver. An
                inline-block shrink-to-fit wrapper makes the parent collapse
                before the first measurement, leaving a tiny debug image. */}
            <div data-testid="modern-debug-preview"
              className="camera-modern-debug-preview w-full max-w-full overflow-hidden rounded-2xl border border-slate-700/90 bg-slate-950 shadow-xl shadow-black/20"
              style={{ width: cameraConfig.detect.width + 'px', maxWidth: '100%' }}>
              <AutoUpdatingCameraImage camera={camera} searchParams={searchParams} className="w-full" />
            </div>
            {debugControls}
            {debugOptions}
          </div>
        )}
      </Fragment>
    );
  }

  return (
    <div className="camera-modern-page min-h-[calc(100vh-4rem)] px-4 pb-10 pt-6 text-slate-100 sm:px-6 xl:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-5" data-testid="modern-camera-header">
        <div className="flex min-w-0 items-center gap-4">
          <a href="/" aria-label={t('cameras.page.back_to_cameras')}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-700/90 bg-slate-800/90 text-slate-200 shadow-lg shadow-black/10 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6M9 12h12" />
            </svg>
          </a>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{t('cameras.page.subtitle')}</p>
            <h1 className="truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">{camera.replaceAll('_', ' ')}</h1>
            <p className="mt-1 text-xs text-slate-400">
              {t('cameras.page.detect_resolution', { width: cameraConfig.detect.width, height: cameraConfig.detect.height })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/75 px-3 py-1.5 text-xs font-semibold text-slate-400">
            <span>{t('cameras.page.stream_source')}</span>
            <select
              aria-label={t('cameras.page.stream_source')}
              className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm font-semibold text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400"
              value={viewSource}
              onChange={(e) => setViewSource(e.target.value)}
            >
              {sourceValues.map((item) => (
                <option key={item} value={item}>
                  {t('cameras.page.stream_source_' + item)}
                </option>
              ))}
            </select>
          </label>
          <ButtonsTabbed viewModes={['live', 'debug']} currentViewMode={viewMode} setViewMode={handleChangeViewMode} variant="camera" />
        </div>
      </header>

      <main>
        <section aria-label={t('cameras.page.camera_preview')} className="camera-modern-stage mb-8">
          {player}
        </section>

        {cameraConfig?.onvif?.host && (
          <section aria-label={t('cameras.page.control_panel')} className="mb-8 w-full rounded-2xl border border-slate-700/80 bg-slate-900/80 p-5 shadow-xl shadow-black/10 sm:w-fit">
            <h2 className="mb-3 text-base font-bold text-white">{t('cameras.page.control_panel')}</h2>
            <CameraControlPanel camera={camera} />
          </section>
        )}

        <section aria-label={t('cameras.page.tracked_objects')} className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden="true" />
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">
              {t('cameras.page.tracked_objects')}
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {(trackedLabels || []).map((objectType) => {
              const classKey = 'cameras.objects.class.' + objectType;
              const label = t(classKey) === classKey ? objectType : t(classKey);
              return (
                <a key={objectType} href={`/events?cameras=${camera}&labels=${encodeURIComponent(objectType)}`}
                  className="group flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-slate-700/90 bg-slate-900/90 pr-5 shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:border-blue-500/70 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                  <img className="h-20 w-24 shrink-0 object-cover grayscale" loading="lazy"
                    alt={t('cameras.page.object_thumbnail', { name: label })}
                    src={`${apiHost}api/${camera}/${encodeURIComponent(objectType)}/thumbnail.jpg`} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-semibold text-slate-100">{label}</span>
                    <span className="text-xs text-slate-400 group-hover:text-blue-300">
                      {t('cameras.page.view_events')}
                    </span>
                  </span>
                </a>
              );
            })}
            {trackedLabels && trackedLabels.length === 0 && (
              <p className="text-sm text-slate-400">{t('cameras.page.tracked_objects_empty')}</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function getDefaultLiveMode(config, cameraConfig, restreamEnabled) {
  if (cameraConfig) {
    if (restreamEnabled) {
      return config.ui.live_mode;
    }

    return 'jsmpeg';
  }

  return undefined;
}
