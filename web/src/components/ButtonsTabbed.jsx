import { h } from 'preact';
import { useCallback } from 'preact/hooks';

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
    <nav className="flex justify-end" aria-label={cameraTabs ? 'Kameraansicht' : undefined}>
      {cameraTabs ? (
        <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {viewModes.map((item, i) => (
            <button
              key={item}
              type="button"
              aria-pressed={selected === i}
              onClick={() => handleClick(i)}
              className={'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ' +
                (selected === i
                  ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white')}
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
              {captitalize(item)}
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
