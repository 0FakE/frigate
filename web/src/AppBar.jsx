import { h, Fragment } from 'preact';
import BaseAppBar from './components/AppBar';
import LinkedLogo from './components/LinkedLogo';
import Menu from './components/Menu';
import LightModeIcon from './icons/LightMode';
import DarkModeIcon from './icons/DarkMode';
import FrigateRestartIcon from './icons/FrigateRestart';
import Prompt from './components/Prompt';
import { useDarkMode } from './context';
import { useCallback, useRef, useState } from 'preact/hooks';
import { useRestart } from './api/ws';
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
  const [showDialogWait, setShowDialogWait] = useState(false);
  const { setDarkMode, persistedMode } = useDarkMode();
  const { send: sendRestart } = useRestart();

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

  const handleClickRestartDialog = useCallback(() => {
    setShowDialog(false);
    setShowDialogWait(true);
    sendRestart();
  }, [setShowDialog, sendRestart]);

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
      {showDialogWait && (
        <Prompt
          title={t('app.modal.restart.progress_title')}
          text={t('app.modal.restart.progress_text')}
          variant="info"
        />
      )}
    </Fragment>
  );
}
