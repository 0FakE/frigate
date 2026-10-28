import { h, createContext } from 'preact';
import { get as getData, set as setData } from 'idb-keyval';
import { useCallback, useContext, useEffect, useLayoutEffect, useState } from 'preact/hooks';

const DarkMode = createContext(null);

export function DarkModeProvider({ children }) {
  const [persistedMode, setPersistedMode] = useState(null);
  const currentMode = persistedMode;

  const setDarkMode = useCallback(
    (value) => {
      const mode = value === 'light' ? 'light' : 'dark';
      setPersistedMode(mode);
      setData('darkmode', mode);
    },
    [setPersistedMode]
  );

  useEffect(() => {
    async function load() {
      const darkmode = await getData('darkmode');
      // Older automatic preferences and missing values default to dark.
      setDarkMode(darkmode === 'light' ? 'light' : 'dark');
    }

    load();
  }, [setDarkMode]);

  useLayoutEffect(() => {
    if (currentMode === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [currentMode]);

  return !persistedMode ? null : (
    <DarkMode.Provider value={{ currentMode, persistedMode, setDarkMode }}>{children}</DarkMode.Provider>
  );
}

export function useDarkMode() {
  return useContext(DarkMode);
}

const Drawer = createContext(null);

export function DrawerProvider({ children }) {
  const [showDrawer, setShowDrawer] = useState(false);

  return <Drawer.Provider value={{ showDrawer, setShowDrawer }}>{children}</Drawer.Provider>;
}

export function useDrawer() {
  return useContext(Drawer);
}

export function usePersistence(key, defaultValue = undefined) {
  // Keep the key together with its value and loading flag. Camera routes are
  // reused, so a previous camera's loaded value must never be treated as the
  // current camera's value, even for a single render before effects run.
  const [entry, setEntry] = useState(() => ({ key, value: defaultValue, loaded: false }));

  const setValue = useCallback(
    (value) => {
      setEntry((current) => ({
        key,
        value,
        loaded: current.key === key && current.loaded,
      }));
      setData(key, value);
    },
    [key]
  );

  useEffect(() => {
    let cancelled = false;
    setEntry({ key, value: defaultValue, loaded: false });

    async function load() {
      const storedValue = await getData(key);
      if (cancelled) return;
      setEntry((current) => current.key === key
        ? { key, value: storedValue === undefined ? defaultValue : storedValue, loaded: true }
        : current);
    }

    load();
    return () => { cancelled = true; };
  }, [key, defaultValue]);

  // The effect resetting state for a new key runs only after render. Return
  // an unloaded value immediately on key change to prevent a transient player.
  const current = entry.key === key;
  return [current ? entry.value : defaultValue, setValue, current && entry.loaded];
}
