import { h, Fragment } from 'preact';
import LinkedLogo from './components/LinkedLogo';
import { Match } from 'preact-router/match';
import { memo } from 'preact/compat';
import { ENV } from './env';
import { useMemo } from 'preact/hooks'
import useSWR from 'swr';
import NavigationDrawer, { Destination, Separator } from './components/NavigationDrawer';
import { t } from './locales';

export default function Sidebar() {
  const { data: config } = useSWR('config');

  const sortedCameras = useMemo(() => {
    if (!config) {
      return [];
    }

    return Object.entries(config.cameras)
      .filter(([_, conf]) => conf.ui.dashboard)
      .sort(([_, aConf], [__, bConf]) => aConf.ui.order - bConf.ui.order);
  }, [config]);

  if (!config) {
    return null;
  }
  const { birdseye } = config;

  return (
    <NavigationDrawer header={<Header />}>
      <Destination href="/" text={t('app.navigation.cameras')} />
      <Match path="/cameras/:camera/:other?">
        {({ matches }) =>
          matches ? (
            <CameraSection sortedCameras={sortedCameras} />
          ) : null
        }
      </Match>
      <Match path="/recording/:camera/:date?/:hour?/:seconds?">
        {({ matches }) =>
          matches ? (
            <RecordingSection sortedCameras={sortedCameras} />
          ) : null
        }
      </Match>
      {birdseye?.enabled ? <Destination href="/birdseye" text={t('app.navigation.birdseye')} /> : null}
      <Destination href="/events" text={t('app.navigation.events')} />
      <Destination href="/exports" text={t('app.navigation.exports')} />
      <Separator />
      <Destination href="/storage" text={t('app.navigation.storage')} />
      <Destination href="/system" text={t('app.navigation.system')} />
      <Destination href="/config" text={t('app.navigation.config')} />
      <Destination href="/logs" text={t('app.navigation.logs')} />
      <Separator />
      <div className="flex flex-grow" />
      {ENV !== 'production' ? (
        <Fragment>
          <Destination href="/styleguide" text={t('app.navigation.styleguide')} />
          <Separator />
        </Fragment>
      ) : null}
      <Destination className="self-end" href="https://github.com/blakeblackshear/frigate" text={t('app.navigation.github')} />
    </NavigationDrawer>
  );
}

function CameraSection({ sortedCameras }) {

  return (
    <Fragment>
      <Separator />
      <div className="overflow-auto pr-2">
        {sortedCameras.map(([camera]) => (
          <Destination key={camera} href={`/cameras/${camera}`} text={camera.replaceAll('_', ' ')} />
        ))}   
      </div>
      <Separator />
    </Fragment>
  );
}

function RecordingSection({ sortedCameras }) {

  return (
    <Fragment>
      <Separator />
      <div className="overflow-auto pr-2">
        {sortedCameras.map(([camera, _]) => {
          return (
            <Destination
              key={camera}
              path={`/recording/${camera}/:date?/:hour?/:seconds?`}
              href={`/recording/${camera}`}
              text={camera.replaceAll('_', ' ')}
            />
          );
        })}
      </div>
      <Separator />
    </Fragment>
  );
}

const Header = memo(() => {
  return (
    <div className="text-gray-500">
      <LinkedLogo />
    </div>
  );
});