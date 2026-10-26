import { h } from 'preact';
import { useCallback } from 'preact/hooks';
import { t } from '../locales';

export default function ButtonsTabbed({
  viewModes = [''],
  currentViewMode = '',
  setViewMode = null,
  setHeader = null,
  headers = [''],
  variant = 'default',
  className = 'text-gray-600 py-0 px-4 block hover:text-gray-500',
  selectedClassName = `${className} focus:outline-none border-b-2 font-medium border-gray-500`,
}) {
  const selected = viewModes.indexOf(currentViewMode);
  const captitalize = (str) => {
    return `${str.charAt(0).toUpperCase()}${str.slice(1)}`;
  };

  const getHeader = useCallback(
    (i) => {
      return headers.length === viewModes.length ? headers[i] : captitalize(viewModes[i]);
    },
    [headers, viewModes]
  );

  const handleClick = useCallback(
    (i) => {
      setViewMode && setViewMode(viewModes[i]);
      setHeader && setHeader(getHeader(i));
    },
    [setViewMode, setHeader, viewModes, getHeader]
  );

  setHeader && setHeader(getHeader(selected));
  const cameraTabs = variant === 'camera';

  return (
    <nav className="flex justify-end" aria-label={cameraTabs ? t('cameras.debug.tabs.aria_label') : undefined}>
      {cameraTabs ? (
        <div className="inline-flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-900/80 p-1 shadow-lg shadow-black/10">
          {viewModes.map((item, i) => (
            <button
              key={item}
              type="button"
              aria-pressed={selected === i}
              onClick={() => handleClick(i)}
              className={'inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ' +
                (selected === i
                  ? 'bg-blue-600 text-white shadow-[0_4px_20px_rgba(37,99,235,0.28)] ring-1 ring-blue-400/60'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white')}
            >
              {item === 'live' && (
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="13" height="14" rx="2" />
                  <path d="m16 10 5-3v10l-5-3" />
                </svg>
              )}
              {item === 'debug' && (
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="8" y="8" width="8" height="12" rx="4" />
                  <path d="M12 8V4M8 4l4 2 4-2M4 13h4M16 13h4M4 18h4M16 18h4" />
                </svg>
              )}
              {item === 'live' ? t('cameras.live.tab_title') : item === 'debug' ? t('cameras.debug.tab_title') : captitalize(item)}
            </button>
          ))}
        </div>
      ) : (
        viewModes.map((item, i) => (
          <button key={i} type="button" onClick={() => handleClick(i)} className={i === selected ? selectedClassName : className}>
            {captitalize(item)}
          </button>
        ))
      )}
    </nav>
  );
}
