import { h, Fragment } from 'preact';
import BaseAppBar from './components/AppBar';
import LinkedLogo from './components/LinkedLogo';
import Menu from './components/Menu';
import LightModeIcon from './icons/LightMode';
import DarkModeIcon from './icons/DarkMode';
import FrigateRestartIcon from './icons/FrigateRestart';
import Prompt from './components/Prompt';
import { useDarkMode } from './context';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useRestart, useWsReady } from './api/ws';
import { getFrigateStarted, isNewFrigateProcess, RESTART_CHECK_INTERVAL_MS, RESTART_MONITOR_TIMEOUT_MS, RESTART_REQUEST_TIMEOUT_MS, reloadFrigatePage } from './util/restartMonitor';
import { t } from './locales';

function SettingsAction({ icon: Icon, children, selected, onClick, type = 'action' }) {
  const isTheme = type === 'theme';
  return (
    <button type="button" tabIndex={0}
      role={isTheme ? 'menuitemradio' : 'menuitem'}
      aria-checked={isTheme ? Boolean(selected) : undefined}
      onClick={onClick}
      className={`frigate-settings-action${selected ? ' frigate-settings-action--selected' : ''}`}>
      <span aria-hidden="true" className="frigate-settings-icon">
        <Icon />
      </span>
      <span className="frigate-settings-action-label">{children}</span>
      {isTheme && (
        <span aria-hidden="true"
          className={`frigate-settings-radio${selected ? ' frigate-settings-radio--selected' : ''}`}>
          {selected && <span className="frigate-settings-radio-dot" />}
        </span>
      )}
      {!isTheme && (
        <svg className="frigate-settings-chevron" aria-hidden="true" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      )}
    </button>
  );
}

export default function AppBar() {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [restartStage, setRestartStage] = useState('idle');
  const [restartBaseline, setRestartBaseline] = useState(null);
  const [restartAttempt, setRestartAttempt] = useState(0);
  const { setDarkMode, persistedMode } = useDarkMode();
  const { send: sendRestart } = useRestart();
  const wsReady = useWsReady();
  const wsReadyRef = useRef(wsReady);
  wsReadyRef.current = wsReady;

  // Polling only starts after a baseline was captured and the restart was sent.
  // All timers and in-flight HTTP checks are cancelled on unmount or retry.
  useEffect(() => {
    if (!restartAttempt || restartBaseline === null) return;

    let active = true;
    let timer = null;
    let requestController = null;
    let requestTimeout = null;
    let verifiedResponses = 0;
    const deadline = Date.now() + RESTART_MONITOR_TIMEOUT_MS;

    async function poll() {
      if (!active) return;
      if (Date.now() >= deadline) {
        setRestartStage('timeout');
        return;
      }
      requestController = new AbortController();
      requestTimeout = setTimeout(() => requestController.abort(), RESTART_REQUEST_TIMEOUT_MS);
      try {
        const started = await getFrigateStarted(requestController.signal);
        if (!active) return;

        if (isNewFrigateProcess(restartBaseline, started)) {
          setRestartStage('verifying');
          verifiedResponses = wsReadyRef.current ? verifiedResponses + 1 : 0;
          if (verifiedResponses >= 2) {
            reloadFrigatePage();
            return;
          }
        } else {
          verifiedResponses = 0;
          setRestartStage('restarting');
        }
      } catch (error) {
        if (!active) return;
        verifiedResponses = 0;
        setRestartStage('waiting');
      } finally {
        clearTimeout(requestTimeout);
        requestTimeout = null;
        requestController = null;
      }
      if (active) {
        if (Date.now() >= deadline) {
          setRestartStage('timeout');
        } else {
          timer = setTimeout(poll, RESTART_CHECK_INTERVAL_MS);
        }
      }
    }

    timer = setTimeout(poll, RESTART_CHECK_INTERVAL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(requestTimeout);
      requestController?.abort();
    };
  }, [restartAttempt, restartBaseline]);

  const handleSelectDarkMode = useCallback(
    (value) => {
      setDarkMode(value);
      setShowMoreMenu(false);
    },
    [setDarkMode, setShowMoreMenu]
  );

  const moreRef = useRef(null);

  const handleShowMenu = useCallback(() => {
    setShowMoreMenu(true);
  }, [setShowMoreMenu]);

  const handleDismissMoreMenu = useCallback(() => {
    setShowMoreMenu(false);
  }, [setShowMoreMenu]);

  const handleClickRestartDialog = useCallback(async () => {
    setShowDialog(false);
    setRestartStage('preparing');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESTART_REQUEST_TIMEOUT_MS);
    try {
      // Do not dispatch a restart until we can identify the old process.
      const oldStart = await getFrigateStarted(controller.signal);
      if (!wsReadyRef.current) throw new Error('WebSocket unavailable');
      sendRestart();
      setRestartBaseline(oldStart);
      setRestartStage('restarting');
      setRestartAttempt((current) => current + 1);
    } catch (error) {
      setRestartStage('request_error');
    } finally {
      clearTimeout(timeout);
    }
  }, [sendRestart]);

  const retryMonitoring = useCallback(() => {
    setRestartStage('restarting');
    setRestartAttempt((current) => current + 1);
  }, []);

  const cancelFailedRestart = useCallback(() => {
    setRestartStage('idle');
  }, []);

  const handleDismissRestartDialog = useCallback(() => {
    setShowDialog(false);
  }, [setShowDialog]);

  const handleRestart = useCallback(() => {
    setShowMoreMenu(false);
    setShowDialog(true);
  }, [setShowDialog]);

  return (
    <Fragment>
      <BaseAppBar title={LinkedLogo} overflowRef={moreRef} onOverflowClick={handleShowMenu} />
      {showMoreMenu && (
        <Menu role="menu" ariaLabel={t('app.menu.settings_label')}
          className="frigate-settings-menu" placement="bottom-end"
          onDismiss={handleDismissMoreMenu} relativeTo={moreRef}>
          <div className="frigate-settings-content">
            <div className="frigate-settings-heading">
              {t('app.menu.design')}
            </div>
            <SettingsAction icon={LightModeIcon} type="theme" selected={persistedMode === 'light'}
              onClick={() => handleSelectDarkMode('light')}>
              {t('app.menu.light')}
            </SettingsAction>
            <SettingsAction icon={DarkModeIcon} type="theme" selected={persistedMode !== 'light'}
              onClick={() => handleSelectDarkMode('dark')}>
              {t('app.menu.dark')}
            </SettingsAction>
            <div className="frigate-settings-divider" />
            <div className="frigate-settings-heading">
              {t('app.menu.system')}
            </div>
            <SettingsAction icon={FrigateRestartIcon} onClick={handleRestart}>
              {t('app.menu.restart')}
            </SettingsAction>
          </div>
        </Menu>
      )}
      {showDialog && (
        <Prompt
          title={t('app.modal.restart.title')}
          text={t('app.modal.restart.confirm')}
          variant="restart"
          actions={[
            { text: t('app.modal.restart.restart'), color: 'blue', onClick: handleClickRestartDialog },
            { text: t('app.modal.restart.cancel'), onClick: handleDismissRestartDialog },
          ]}
        />
      )}
      {['preparing', 'restarting', 'waiting', 'verifying'].includes(restartStage) && (
        <Prompt
          title={t('app.modal.restart.progress_title')}
          text={t('app.modal.restart.status_' + restartStage)}
          variant="info"
        />
      )}
      {restartStage === 'timeout' && (
        <Prompt
          title={t('app.modal.restart.unavailable_title')}
          text={t('app.modal.restart.unavailable_text')}
          variant="error"
          actions={[
            { text: t('app.modal.restart.retry_check'), onClick: retryMonitoring },
            { text: t('app.modal.restart.reload_page'), onClick: () => reloadFrigatePage() },
          ]}
        />
      )}
      {restartStage === 'request_error' && (
        <Prompt
          title={t('app.modal.restart.request_error_title')}
          text={t('app.modal.restart.request_error_text')}
          variant="error"
          actions={[
            { text: t('app.modal.restart.retry_start'), onClick: handleClickRestartDialog },
            { text: t('app.modal.restart.cancel'), onClick: cancelFailedRestart },
          ]}
        />
      )}
    </Fragment>
  );
}
