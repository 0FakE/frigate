import { h } from 'preact';
import { useCallback } from 'preact/hooks';

export default function ButtonsTabbed({
  viewModes = [''],
  currentViewMode = '',
  setViewMode = null,
  setHeader = null,
  headers = [''],
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
  return (
    <nav className="flex justify-end">
      {viewModes.map((item, i) => {
        return (
          <button key={i} onClick={() => handleClick(i)} className={i === selected ? selectedClassName : className}>
            {captitalize(item)}
          </button>
        );
      })}
    </nav>
  );
}
