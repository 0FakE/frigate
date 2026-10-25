import de from './de.json';

// Translation paths mirror the locale JSON hierarchy, e.g. cameras.debug.editor.button.save.
// German is the only bundled language for now. A persisted language selector can be
// added later without changing component keys or storing translated text in config.yml.
export function t(path, params = {}) {
  const value = path.split('.').reduce((node, key) => node?.[key], de);
  if (typeof value !== 'string') return path;
  return value.replace(/\{([a-z_]+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}
