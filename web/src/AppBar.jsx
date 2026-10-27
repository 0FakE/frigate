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
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-400 ${selected
        ? 'bg-blue-600/15 text-blue-700 dark:bg-blue-500/20 dark:text-white'
        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800'}`}>
      <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-500 dark:text-slate-300">
        <Icon />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {isTheme && (
        <span aria-hidden="true"
          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${selected
            ? 'border-blue-500' : 'border-slate-400 dark:border-slate-500'}`}>
          {selected && <span className="h-2 w-2 rounded-full bg-blue-500" />}
        </span>
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
          <div className="p-2">
            <div className="px-3 pb-1 pt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
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
            <div className="mx-2 my-2 border-t border-slate-200 dark:border-slate-700" />
            <div className="px-3 pb-1 pt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
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
