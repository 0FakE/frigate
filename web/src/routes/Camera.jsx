import { h, Fragment } from 'preact';
import AutoUpdatingCameraImage from '../components/AutoUpdatingCameraImage';
import ActivityIndicator from '../components/ActivityIndicator';
import JSMpegPlayer from '../components/JSMpegPlayer';
import Button from '../components/Button';
import Card from '../components/Card';
import Heading from '../components/Heading';
import SettingsIcon from '../icons/Settings';
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

const emptyObject = Object.freeze({});

export default function Camera({ camera }) {
  const { data: config } = useSWR('config');
  const { data: trackedLabels } = useSWR(['labels', { camera }]);
  const apiHost = useApiHost();
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState('live');
  const [editLivePolygons, setEditLivePolygons] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);

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
      if (editLivePolygons && editorDirty && !window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
      setEditLivePolygons(false);
      setEditorDirty(false);
      setViewMode(nextMode);
    },
    [viewMode, editLivePolygons, editorDirty]
  );

  const handleToggleEditor = useCallback(() => {
    if (editLivePolygons && editorDirty && !window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
    setEditLivePolygons((current) => !current);
    setEditorDirty(false);
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
        label="Bounding box"
        labelPosition="after"
      />
      <Switch
        checked={options['timestamp']}
        id="timestamp"
        onChange={handleSetOption}
        label="Timestamp"
        labelPosition="after"
      />
      <Switch checked={options['zones']} id="zones" onChange={handleSetOption} label="Zones" labelPosition="after" />
      <Switch
        checked={options['mask']}
        id="mask"
        onChange={handleSetOption}
        label="Motion Masks"
        labelPosition="after"
      />
      <Switch
        checked={options['motion']}
        id="motion"
        onChange={handleSetOption}
        label="Motion boxes"
        labelPosition="after"
      />
      <Switch
        checked={options['regions']}
        id="regions"
        onChange={handleSetOption}
        label="Regions"
        labelPosition="after"
      />
    </div>
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
            MSE is only supported on iOS 17.1+. You'll need to update if available or use jsmpeg / webRTC streams. See the docs for more info.
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
            camera={camera}
            width={cameraConfig.detect.width}
            height={cameraConfig.detect.height}
            displayWidth={jsmpegWidth}
            trackedObjects={cameraConfig.objects?.track || []}
            onClose={() => {
              setEditLivePolygons(false);
              setEditorDirty(false);
            }}
            onDirtyChange={setEditorDirty}
          >
            <JSMpegPlayer camera={camera} width={jsmpegWidth} height={cameraConfig.live.height} />
          </LiveZoneEditor>
        ) : (
          <div>
            <AutoUpdatingCameraImage camera={camera} searchParams={searchParams} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleToggleSettings} type="text">
            <span className="w-5 h-5">
              <SettingsIcon />
            </span>{' '}
            <span>{showSettings ? 'Hide' : 'Show'} Options</span>
          </Button>
          <button
            type="button"
            className="inline-flex w-auto items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold uppercase text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            onClick={handleToggleEditor}
          >
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="m12 2 9 7-3.5 11h-11L3 9Z" />
              <path d="M3 9 12 14l9-5M12 14v7" />
            </svg>
            {editLivePolygons ? 'Editor schließen' : 'Zonen & Masken bearbeiten'}
          </button>
        </div>
        {showSettings ? <Card header="Options" elevated={false} content={optionContent} /> : null}
      </Fragment>
    );
  }

  return (
    <div className="space-y-4 p-2 px-4">
      <div className="flex justify-between">
        <Heading className="p-2" size="2xl">
          {camera.replaceAll('_', ' ')}
        </Heading>
        <select
          className="basis-1/8 cursor-pointer rounded dark:bg-slate-800"
          value={viewSource}
          onChange={(e) => setViewSource(e.target.value)}
        >
          {sourceValues.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      <ButtonsTabbed viewModes={['live', 'debug']} currentViewMode={viewMode} setViewMode={handleChangeViewMode} variant="camera" />

      {player}

      {cameraConfig?.onvif?.host && (
        <div className="dark:bg-gray-800 shadow-md hover:shadow-lg rounded-lg transition-shadow p-4 w-full sm:w-min">
          <Heading size="sm">Control Panel</Heading>
          <CameraControlPanel camera={camera} />
        </div>
      )}

      <div className="space-y-4">
        <Heading size="sm">Tracked objects</Heading>
        <div className="flex flex-wrap justify-start">
          {(trackedLabels || []).map((objectType) => (
            <Card
              className="mb-4 mr-4"
              key={objectType}
              header={objectType}
              href={`/events?cameras=${camera}&labels=${encodeURIComponent(objectType)}`}
              media={<img src={`${apiHost}api/${camera}/${encodeURIComponent(objectType)}/thumbnail.jpg`} />}
            />
          ))}
        </div>
      </div>
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
