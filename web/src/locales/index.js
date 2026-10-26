import de from './de.json';

// The built-in German copy is the fallback for missing or invalid host keys.
// The server supplies the optional /config/lang/de.json override before App
// mounts, so existing components can continue using t(...) without changes.
let hostMessages = null;

export function setLocaleMessages(messages) {
  hostMessages = messages && typeof messages === 'object' && !Array.isArray(messages)
    ? messages
    : null;
}

function lookup(root, path) {
  return path.split('.').reduce(
    (node, key) => node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, key)
      ? node[key]
      : undefined,
    root
  );
}

// Keys mirror the locale JSON hierarchy: cameras.debug.editor.button.save.
// Host files are never overwritten during an image update. Keep reading older
// host-defined camera editor error/warning keys when the new modal key is absent.
function legacyModalPath(path) {
  const prefix = 'cameras.debug.editor.modal.';
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (rest.startsWith('error.') || rest.startsWith('warning.')) {
    return 'cameras.debug.editor.' + rest;
  }
  return null;
}

export function t(path, params = {}) {
  const translated = lookup(hostMessages, path);
  const legacy = legacyModalPath(path);
  const oldTranslation = legacy ? lookup(hostMessages, legacy) : undefined;
  const value = typeof translated === 'string'
    ? translated
    : typeof oldTranslation === 'string'
      ? oldTranslation
      : lookup(de, path);
  if (typeof value !== 'string') return path;
  return value.replace(/\{([a-z_]+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}
