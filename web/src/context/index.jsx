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
  const [value, setInternalValue] = useState(defaultValue);
  const [loaded, setLoaded] = useState(false);

  const setValue = useCallback(
    (value) => {
      setInternalValue(value);
      async function update() {
        await setData(key, value);
      }

      update();
    },
    [key]
  );

  useEffect(() => {
    setLoaded(false);
    setInternalValue(defaultValue);

    async function load() {
      const value = await getData(key);
      if (typeof value !== 'undefined') {
        setValue(value);
      }
      setLoaded(true);
    }

    load();
  }, [key, defaultValue, setValue]);

  return [value, setValue, loaded];
}
